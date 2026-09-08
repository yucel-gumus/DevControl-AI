import {
  Repository,
  CommitMetric,
  PullRequestMetric,
  IssueMetric,
  GitHubUser,
  SyncStatus,
  TelemetrySyncStatus,
  RateLimitStatus,
  PunchCardItem,
  LanguageBreakdownItem,
  RepositoryCiRun,
  RepositoryRelease,
  EngineeringHealthScore,
  FileHotspot,
  EngineeringRisk,
  TodayBriefItem,
  DeveloperPersona,
} from '../../src/types.js';
import {
  GITHUB_REQUEST_TIMEOUT_MS,
  TELEMETRY_WINDOW_DAYS,
  STALE_ISSUE_THRESHOLD_DAYS,
  STALE_PR_THRESHOLD_DAYS,
  MS_PER_DAY,
  MS_PER_HOUR,
} from '../constants.js';
import { HotspotEngine } from '../metrics/hotspotEngine.js';
import { RiskEngine } from '../metrics/riskEngine.js';
import { HealthEngine } from '../metrics/healthEngine.js';
import { CommitSemanticClassifier } from '../ai/commitClassifier.js';
import { FirestoreService } from '../db/firestoreService.js';

export const INITIAL_USER: GitHubUser = {
  id: '0',
  login: 'github-kullanicisi',
  name: 'GitHub Kullanıcısı',
  avatar_url: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png',
  html_url: 'https://github.com',
  bio: 'GitHub API bağlantısı bekleniyor...',
  public_repos: 0,
};

export interface GitHubStoreState {
  token?: string;
  user: GitHubUser;
  repositories: Repository[];
  commits: CommitMetric[];
  pullRequests: PullRequestMetric[];
  issues: IssueMetric[];
  punchCard?: PunchCardItem[];
  languagesBreakdown?: LanguageBreakdownItem[];
  lastSyncAt: string;
  lastSyncAttemptAt?: number;
  lastAccessedAt?: number;
  isSyncing?: boolean;
  syncStatus: SyncStatus;
  syncError?: string;
  telemetryStatus: TelemetrySyncStatus;
  isCachedFromDb?: boolean;
}

class BoundedCache<K, V> {
  private cache = new Map<K, V>();
  constructor(private readonly maxSize = 1000) {}

  get(key: K): V | undefined {
    const item = this.cache.get(key);
    if (item !== undefined) {
      this.cache.delete(key);
      this.cache.set(key, item);
    }
    return item;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) this.cache.delete(oldestKey);
    }
    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }
}

interface GitHubApiRepo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  private: boolean;
  default_branch: string;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  updated_at: string;
  pushed_at: string;
  owner?: {
    login?: string;
    type?: string;
  };
}

interface GitHubApiCommitFile {
  filename: string;
  additions?: number;
  deletions?: number;
  changes?: number;
}

interface GitHubApiCommitSummary {
  sha: string;
  commit?: {
    message?: string;
    author?: { name?: string; date?: string };
    committer?: { date?: string };
  };
  author?: {
    login?: string;
    avatar_url?: string;
  };
  files?: GitHubApiCommitFile[];
  stats?: {
    additions?: number;
    deletions?: number;
    total?: number;
  };
}

interface GitHubApiCommitDetail extends GitHubApiCommitSummary {}

interface GitHubApiPRSummary {
  id: number;
  number: number;
  title: string;
  state: string;
  created_at: string;
  updated_at?: string;
  closed_at?: string;
  merged_at?: string;
  user?: {
    login?: string;
  };
  additions?: number;
  deletions?: number;
  changed_files?: number;
  comments?: number;
  review_comments?: number;
}

interface GitHubApiPRDetail extends GitHubApiPRSummary {}

interface GitHubApiIssue {
  id: number;
  number: number;
  title: string;
  state: string;
  created_at: string;
  closed_at?: string;
  updated_at?: string;
  user?: {
    login?: string;
  };
  comments?: number;
  labels?: Array<{ name?: string }>;
  pull_request?: unknown;
}

export class GitHubService {
  // Tekil Kişisel GitHub Store (Tek hesap ve .env GITHUB_TOKEN odaklı)
  private static state: GitHubStoreState | null = null;
  private static activeSyncPromise: Promise<GitHubStoreState> | null = null;
  private static activeSyncToken: string | null = null;
  private static activeTogglePromise: Promise<Repository[]> | null = null;

  // Snapshot & Metrik Önbelleği (Cold-start ve Instant Startup için)
  private static cachedDailyBrief: TodayBriefItem[] | null = null;
  private static cachedDeveloperPersona: DeveloperPersona | null = null;
  private static cachedHotspots: FileHotspot[] | null = null;
  private static cachedRisks: EngineeringRisk[] | null = null;
  private static cachedHealthScore: EngineeringHealthScore | null = null;

  public static getCachedDailyBrief(): TodayBriefItem[] | null {
    return this.cachedDailyBrief;
  }
  public static setCachedDailyBrief(brief: TodayBriefItem[]): void {
    this.cachedDailyBrief = brief;
  }
  public static getCachedDeveloperPersona(): DeveloperPersona | null {
    return this.cachedDeveloperPersona;
  }
  public static setCachedDeveloperPersona(persona: DeveloperPersona): void {
    this.cachedDeveloperPersona = persona;
  }
  public static getCachedHotspots(): FileHotspot[] | null {
    return this.cachedHotspots;
  }
  public static getCachedRisks(): EngineeringRisk[] | null {
    return this.cachedRisks;
  }
  public static getCachedHealthScore(): EngineeringHealthScore | null {
    return this.cachedHealthScore;
  }

  // Commit ve PR detay önbelleği (Bellek sızıntısı ve rate limit tükenmesini önler)
  private static commitDetailCache = new BoundedCache<string, GitHubApiCommitDetail>(1000);
  private static prDetailCache = new BoundedCache<string, GitHubApiPRDetail>(500);
  private static languagesCache = new BoundedCache<string, Record<string, number>>(200);
  private static ciRunsCache = new BoundedCache<string, RepositoryCiRun | null>(200);
  private static releasesCache = new BoundedCache<string, RepositoryRelease | null>(200);
  private static branchesCountCache = new BoundedCache<string, number>(200);
  private static punchCardCache = new BoundedCache<string, PunchCardItem[]>(200);
  private static treeCache = new BoundedCache<string, string[]>(50);

  // GitHub API Rate Limit durum takibi
  private static rateLimitStatus: RateLimitStatus = {
    limit: 5000,
    remaining: 5000,
    reset: Math.floor(Date.now() / 1000) + 3600,
    used: 0,
    updatedAt: new Date().toISOString(),
  };

  public static getRateLimitStatus(): RateLimitStatus {
    return { ...this.rateLimitStatus };
  }

  private static createTelemetryStatus(
    status: SyncStatus,
    totalRepositories = 0,
    completedRepositories = 0,
    failedRepositoryNames: string[] = [],
    lastError?: string,
  ): TelemetrySyncStatus {
    return {
      status,
      windowDays: TELEMETRY_WINDOW_DAYS,
      totalRepositories,
      completedRepositories,
      failedRepositories: failedRepositoryNames.length,
      failedRepositoryNames: [...failedRepositoryNames],
      ...(lastError ? { lastError } : {}),
    };
  }

  public static getInitialState(): GitHubStoreState {
    return {
      user: INITIAL_USER,
      repositories: [],
      commits: [],
      pullRequests: [],
      issues: [],
      punchCard: [],
      languagesBreakdown: [],
      lastSyncAt: '',
      lastAccessedAt: Date.now(),
      isSyncing: false,
      syncStatus: 'idle',
      telemetryStatus: this.createTelemetryStatus('idle'),
    };
  }

  private static enforcePersonalRepositoryScope(state: GitHubStoreState): void {
    const authenticatedLogin = String(state.user?.login || '').trim().toLowerCase();
    if (!authenticatedLogin || authenticatedLogin === INITIAL_USER.login.toLowerCase()) {
      return;
    }

    const personalRepositories = state.repositories.filter((repository) => {
      const ownerLogin = String(repository.full_name || '').split('/')[0].trim().toLowerCase();
      return ownerLogin === authenticatedLogin;
    });
    const personalRepositoryNames = new Set(personalRepositories.map((repository) => repository.name));
    const hasForeignTelemetry = [
      ...state.commits.map((commit) => commit.repo_name),
      ...state.pullRequests.map((pullRequest) => pullRequest.repo_name),
      ...state.issues.map((issue) => issue.repo_name),
    ].some((repositoryName) => !personalRepositoryNames.has(repositoryName));
    if (personalRepositories.length === state.repositories.length && !hasForeignTelemetry) {
      return;
    }

    state.repositories = personalRepositories;
    state.commits = state.commits.filter((commit) => personalRepositoryNames.has(commit.repo_name));
    state.pullRequests = state.pullRequests.filter((pullRequest) => personalRepositoryNames.has(pullRequest.repo_name));
    state.issues = state.issues.filter((issue) => personalRepositoryNames.has(issue.repo_name));

    const failedRepositoryNames = (state.telemetryStatus?.failedRepositoryNames || [])
      .filter((repositoryName) => personalRepositoryNames.has(repositoryName));
    const selectedCount = personalRepositories.filter((repository) => repository.selected_for_analysis).length;
    state.telemetryStatus = this.createTelemetryStatus(
      selectedCount === 0
        ? 'no_data'
        : failedRepositoryNames.length > 0
          ? 'partial'
          : state.telemetryStatus.status === 'syncing'
            ? 'syncing'
            : 'ready',
      selectedCount,
      Math.min(state.telemetryStatus.completedRepositories || 0, selectedCount),
      failedRepositoryNames,
      failedRepositoryNames.length > 0 ? state.telemetryStatus.lastError : undefined,
    );
    if (state.syncStatus === 'partial' && failedRepositoryNames.length === 0) {
      state.syncStatus = 'ready';
      state.syncError = undefined;
    }
  }

  public static getState(): GitHubStoreState {
    if (!this.state) {
      this.state = this.getInitialState();
      if (process.env.GITHUB_TOKEN) {
        this.state.token = process.env.GITHUB_TOKEN.trim();
      }
    }
    if (!this.state.token && process.env.GITHUB_TOKEN) {
      this.state.token = process.env.GITHUB_TOKEN.trim();
    }
    this.enforcePersonalRepositoryScope(this.state);
    this.state.lastAccessedAt = Date.now();
    return this.state;
  }

  private static async fetchJson<T>(url: string, headers: Record<string, string>): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GITHUB_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, { headers, signal: controller.signal });
      
      // GitHub Rate Limit başlıklarını yakala ve güncelle
      const limitHeader = response.headers.get('x-ratelimit-limit');
      const remainingHeader = response.headers.get('x-ratelimit-remaining');
      const resetHeader = response.headers.get('x-ratelimit-reset');
      const usedHeader = response.headers.get('x-ratelimit-used');
      if (remainingHeader !== null) {
        const limit = limitHeader ? Number(limitHeader) : this.rateLimitStatus.limit;
        const remaining = Number(remainingHeader);
        const reset = resetHeader ? Number(resetHeader) : this.rateLimitStatus.reset;
        const used = usedHeader ? Number(usedHeader) : (limit - remaining);
        this.rateLimitStatus = {
          limit,
          remaining,
          reset,
          used: Math.max(0, used),
          updatedAt: new Date().toISOString(),
        };
      }

      if (!response.ok) {
        const error = new Error(`GitHub isteği başarısız oldu (${response.status}${response.statusText ? ` ${response.statusText}` : ''}).`) as Error & { status?: number };
        error.status = response.status;
        throw error;
      }
      return (await response.json()) as T;
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'AbortError') {
        throw new Error(`GitHub isteği ${GITHUB_REQUEST_TIMEOUT_MS / 1000} saniye içinde yanıt vermedi.`);
      }
      if (err instanceof Error) throw err;
      throw new Error('GitHub isteği sırasında bilinmeyen bir hata oluştu.');
    } finally {
      clearTimeout(timeout);
    }
  }

  public static async fetchLanguages(owner: string, repoName: string, headers: Record<string, string>): Promise<Record<string, number>> {
    const key = `${owner}/${repoName}`;
    if (this.languagesCache.has(key)) return this.languagesCache.get(key)!;
    try {
      const data = await this.fetchJson<Record<string, number>>(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/languages`,
        headers
      );
      const result = data && typeof data === 'object' ? data : {};
      this.languagesCache.set(key, result);
      return result;
    } catch {
      return {};
    }
  }

  public static async fetchLatestCiRun(owner: string, repoName: string, headers: Record<string, string>): Promise<RepositoryCiRun | null> {
    const key = `${owner}/${repoName}`;
    if (this.ciRunsCache.has(key)) return this.ciRunsCache.get(key) || null;
    try {
      const data = await this.fetchJson<{ workflow_runs?: any[] }>(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/actions/runs?per_page=1`,
        headers
      );
      const run = data?.workflow_runs?.[0];
      if (!run) {
        this.ciRunsCache.set(key, null);
        return null;
      }
      const ciRun: RepositoryCiRun = {
        name: String(run.name || 'CI'),
        status: String(run.status || 'completed'),
        conclusion: run.conclusion ? String(run.conclusion) : undefined,
        html_url: run.html_url ? String(run.html_url) : undefined,
        updated_at: run.updated_at ? String(run.updated_at) : undefined,
      };
      this.ciRunsCache.set(key, ciRun);
      return ciRun;
    } catch {
      return null;
    }
  }

  public static async fetchLatestRelease(owner: string, repoName: string, headers: Record<string, string>): Promise<RepositoryRelease | null> {
    const key = `${owner}/${repoName}`;
    if (this.releasesCache.has(key)) return this.releasesCache.get(key) || null;
    try {
      const data = await this.fetchJson<any[]>(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/releases?per_page=1`,
        headers
      );
      const rel = Array.isArray(data) ? data[0] : null;
      if (!rel) {
        this.releasesCache.set(key, null);
        return null;
      }
      const release: RepositoryRelease = {
        tag_name: String(rel.tag_name || ''),
        name: rel.name ? String(rel.name) : undefined,
        published_at: String(rel.published_at || rel.created_at || ''),
        html_url: rel.html_url ? String(rel.html_url) : undefined,
      };
      this.releasesCache.set(key, release);
      return release;
    } catch {
      return null;
    }
  }

  public static async fetchBranchesCount(owner: string, repoName: string, headers: Record<string, string>): Promise<number> {
    const key = `${owner}/${repoName}`;
    if (this.branchesCountCache.has(key)) return this.branchesCountCache.get(key) || 1;
    try {
      const branches = await this.fetchJson<any[]>(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/branches?per_page=30`,
        headers
      );
      const count = Array.isArray(branches) ? branches.length : 1;
      this.branchesCountCache.set(key, count);
      return count;
    } catch {
      return 1;
    }
  }

  public static async fetchPunchCard(owner: string, repoName: string, headers: Record<string, string>): Promise<PunchCardItem[]> {
    const key = `${owner}/${repoName}`;
    if (this.punchCardCache.has(key)) return this.punchCardCache.get(key) || [];
    try {
      const data = await this.fetchJson<number[][]>(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/stats/punch_card`,
        headers
      );
      if (!Array.isArray(data)) return [];
      const items: PunchCardItem[] = data.map(([day, hour, count]) => ({
        day: Number(day) || 0,
        hour: Number(hour) || 0,
        count: Number(count) || 0,
      }));
      this.punchCardCache.set(key, items);
      return items;
    } catch {
      return [];
    }
  }

  public static async fetchRepositoryTree(owner: string, repoName: string, defaultBranch = 'main'): Promise<string[]> {
    const state = this.getState();
    const token = state.token || process.env.GITHUB_TOKEN;
    if (!token) return [];
    const cacheKey = `${owner}/${repoName}/${defaultBranch}`;
    if (this.treeCache.has(cacheKey)) {
      return this.treeCache.get(cacheKey)!;
    }
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'DevControl-AI-Platform',
    };
    try {
      const data = await this.fetchJson<{ tree?: Array<{ path?: string; type?: string }> }>(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/git/trees/${encodeURIComponent(defaultBranch)}?recursive=1`,
        headers
      );
      const paths = (data?.tree || [])
        .filter((item) => typeof item.path === 'string')
        .map((item) => item.path as string)
        .slice(0, 150);
      this.treeCache.set(cacheKey, paths);
      return paths;
    } catch (err) {
      console.warn(`[DevControl AI] ${repoName} dosya ağacı alınamadı:`, err);
      return [];
    }
  }

  public static async connectWithToken(token: string): Promise<GitHubStoreState> {
    const normalizedToken = token.trim();
    if (!normalizedToken) {
      throw new Error('GitHub token alanı zorunludur.');
    }

    if (this.activeSyncPromise) {
      if (this.activeSyncToken === normalizedToken) {
        return this.activeSyncPromise;
      }
      try {
        await this.activeSyncPromise;
      } catch {
        // Önceki hatadan sonra yeni deneme devam edebilir
      }
    }

    const syncPromise = this.connectWithTokenInternal(normalizedToken);
    this.activeSyncPromise = syncPromise;
    this.activeSyncToken = normalizedToken;
    try {
      return await syncPromise;
    } finally {
      if (this.activeSyncPromise === syncPromise) {
        this.activeSyncPromise = null;
        this.activeSyncToken = null;
      }
    }
  }

  private static async connectWithTokenInternal(token: string): Promise<GitHubStoreState> {
    const state = this.getState();
    const normalizedToken = token.trim();
    if (!normalizedToken) {
      throw new Error('GitHub token alanı zorunludur.');
    }

    const previousState = {
      token: state.token,
      user: state.user,
      repositories: state.repositories,
      commits: state.commits,
      pullRequests: state.pullRequests,
      issues: state.issues,
      lastSyncAt: state.lastSyncAt,
      syncStatus: state.syncStatus,
      syncError: state.syncError,
      telemetryStatus: state.telemetryStatus,
    };
    const previousSelection = new Map(
      state.repositories.map((repository) => [repository.full_name, repository.selected_for_analysis])
    );
    
    state.token = normalizedToken;
    state.isSyncing = true;
    state.syncStatus = 'syncing';
    state.syncError = undefined;
    state.telemetryStatus = this.createTelemetryStatus('syncing');
    state.lastSyncAttemptAt = Date.now();

    try {
      const headers = {
        Authorization: `Bearer ${normalizedToken}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'DevControl-AI-Platform',
      };

      // 1. Kullanıcı profilini getir
      const ghUser = await this.fetchJson<{
        id: number | string;
        login: string;
        name?: string;
        avatar_url: string;
        html_url: string;
        bio?: string;
        public_repos?: number;
      }>('https://api.github.com/user', headers);
      const authenticatedLogin = String(ghUser.login || '').trim().toLowerCase();
      if (!authenticatedLogin) {
        throw new Error('GitHub hesabı bilgisi alınamadı.');
      }
      state.user = {
        id: String(ghUser.id),
        login: ghUser.login,
        name: ghUser.name || ghUser.login,
        avatar_url: ghUser.avatar_url,
        html_url: ghUser.html_url,
        bio: ghUser.bio || 'GitHub API ile bağlandı',
        public_repos: ghUser.public_repos || 0,
      };

      // 2. Depoları getir
      const allFetchedRepos: GitHubApiRepo[] = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const pageRepos = await this.fetchJson<GitHubApiRepo[]>(
          `https://api.github.com/user/repos?sort=updated&direction=desc&per_page=100&page=${page}&affiliation=owner`,
          headers,
        );
        if (!Array.isArray(pageRepos)) {
          throw new Error('GitHub depo listesi beklenen formatta dönmedi.');
        }
        if (Array.isArray(pageRepos) && pageRepos.length > 0) {
          allFetchedRepos.push(...pageRepos);
          if (pageRepos.length < 100) {
            hasMore = false;
          } else {
            page++;
          }
        } else {
          hasMore = false;
        }
      }

      const seenIds = new Set<string>();
      const uniqueRepos = allFetchedRepos.filter((r) => {
        if (seenIds.has(String(r.id))) return false;
        seenIds.add(String(r.id));
        return true;
      });
      const personalRepos = uniqueRepos.filter((repo: GitHubApiRepo) => {
        const ownerLogin = String(repo?.owner?.login || repo?.full_name?.split('/')?.[0] || '').trim().toLowerCase();
        const ownerType = String(repo?.owner?.type || '').trim().toLowerCase();
        return ownerLogin === authenticatedLogin && (!ownerType || ownerType === 'user');
      });

      state.repositories = personalRepos.map((r: GitHubApiRepo) => ({
        id: `repo_${r.id}`,
        name: r.name,
        full_name: r.full_name,
        html_url: r.html_url,
        description: r.description || 'Açıklama belirtilmemiş.',
        language: r.language || 'Code',
        is_private: Boolean(r.private),
        default_branch: r.default_branch || 'main',
        stargazers_count: Number(r.stargazers_count) || 0,
        forks_count: Number(r.forks_count) || 0,
        open_issues_count: Number(r.open_issues_count) || 0,
        updated_at: r.updated_at || '',
        pushed_at: r.pushed_at || r.updated_at || '',
        selected_for_analysis: previousSelection.get(r.full_name) ?? true,
      }));

      // 3. Telemetri verilerini çek
      await this.fetchRepositoryTelemetry();

      state.lastSyncAt = new Date().toISOString();
      state.isSyncing = false;
      state.syncStatus = state.telemetryStatus.status === 'partial' ? 'partial' : 'ready';
      state.syncError = state.telemetryStatus.lastError;
      state.isCachedFromDb = false;

      // Firestore'a kalıcı ve anti-bloat tekil snapshot kaydı
      try {
        const activeRepos = state.repositories.filter((r) => r.selected_for_analysis);
        const activeRepoNames = new Set(activeRepos.map((r) => r.name));
        const activeCommits = state.commits.filter((c) => activeRepoNames.has(c.repo_name));
        const activePRs = state.pullRequests.filter((p) => activeRepoNames.has(p.repo_name));
        const activeIssues = state.issues.filter((i) => activeRepoNames.has(i.repo_name));
        const hotspots = HotspotEngine.analyzeHotspots(activeCommits);
        const risks = RiskEngine.analyzeRisks(activeRepos, activeCommits, activePRs, activeIssues, hotspots);
        const health = HealthEngine.calculateHealth(
          activeRepos,
          activeCommits,
          activePRs,
          activeIssues,
          undefined,
          state.telemetryStatus.status === 'partial' ? 'partial' : undefined,
        );

        this.cachedHotspots = hotspots;
        this.cachedRisks = risks;
        this.cachedHealthScore = health;

        await FirestoreService.saveLatestSnapshot({
          lastSyncAt: state.lastSyncAt,
          user: state.user,
          repositories: state.repositories,
          commits: state.commits.map((c) => ({
            sha: c.sha,
            message: c.message,
            author: c.author,
            author_name: c.author_name,
            author_avatar: c.author_avatar,
            date: c.date,
            additions: c.additions,
            deletions: c.deletions,
            total_changes: c.total_changes,
            files_changed: c.files_changed,
            is_bug_fix: c.is_bug_fix,
            ai_category: c.ai_category,
            ai_reasoning: c.ai_reasoning,
            ai_confidence: c.ai_confidence,
            repo_name: c.repo_name,
            affected_files: (c.affected_files || []).slice(0, 10),
          })),
          pullRequests: state.pullRequests,
          issues: state.issues,
          healthScore: health,
          hotspots,
          risks,
          dailyBrief: this.cachedDailyBrief || [],
          developerPersona: this.cachedDeveloperPersona || null,
          punchCard: state.punchCard || [],
          languagesBreakdown: state.languagesBreakdown || [],
          commitsCount: state.commits.length,
          pullRequestsCount: state.pullRequests.length,
        });
      } catch (saveErr) {
        console.warn('Firestore snapshot kaydedilemedi:', saveErr);
      }
      
      return state;
    } catch (err: unknown) {
      if (previousState.token) state.token = previousState.token;
      else delete state.token;
      state.user = previousState.user;
      state.repositories = previousState.repositories;
      state.commits = previousState.commits;
      state.pullRequests = previousState.pullRequests;
      state.issues = previousState.issues;
      state.lastSyncAt = previousState.lastSyncAt;
      state.isSyncing = false;
      state.syncStatus = 'error';
      const errMsg = err instanceof Error ? err.message : String(err);
      state.syncError = errMsg || 'GitHub bağlantısı sırasında hata oluştu.';
      state.telemetryStatus = previousState.telemetryStatus;
      console.error('Canlı GitHub verisi senkronize edilirken hata:', errMsg || err);
      throw err;
    }
  }

  private static async fetchRepositoryTelemetry(): Promise<void> {
    const state = this.getState();
    if (!state.token) {
      state.commits = [];
      state.pullRequests = [];
      state.issues = [];
      state.telemetryStatus = this.createTelemetryStatus('no_data');
      return;
    }
    
    const selectedRepos = state.repositories.filter((r) => r.selected_for_analysis);
    if (selectedRepos.length === 0) {
      state.commits = [];
      state.pullRequests = [];
      state.issues = [];
      state.telemetryStatus = this.createTelemetryStatus('no_data');
      return;
    }

    const allCommits: CommitMetric[] = [];
    const allPRs: PullRequestMetric[] = [];
    const allIssues: IssueMetric[] = [];
    const allPunchCardItems: PunchCardItem[] = [];
    const failedRepositoryNames: string[] = [];
    const errors: string[] = [];
    let completedRepositories = 0;

    state.telemetryStatus = this.createTelemetryStatus('syncing', selectedRepos.length);

    const headers = {
      Authorization: `Bearer ${state.token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'DevControl-AI-Platform',
    };

    const asNonNegativeNumber = (value: unknown): number => {
      return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
    };
    const sinceTimestamp = Date.now() - TELEMETRY_WINDOW_DAYS * MS_PER_DAY;
    const since = new Date(sinceTimestamp).toISOString();

    const CHUNK_SIZE = 6;
    for (let i = 0; i < selectedRepos.length; i += CHUNK_SIZE) {
      const chunk = selectedRepos.slice(i, i + CHUNK_SIZE);
      await Promise.allSettled(
        chunk.map(async (repo) => {
          const [owner, repoName] = (repo?.full_name && typeof repo.full_name === 'string' && repo.full_name.includes('/'))
            ? repo.full_name.split('/')
            : [state.user.login || 'user', repo.name || 'repo'];

          try {
            // Commitleri getir
            const ghCommits = await this.fetchJson<GitHubApiCommitSummary[]>(
              `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/commits?per_page=30&since=${encodeURIComponent(since)}`,
              headers
            );
            if (!Array.isArray(ghCommits)) {
              throw new Error(`${repo.name} commit listesi beklenen formatta dönmedi.`);
            }

            const commitRecords: { summary: GitHubApiCommitSummary; detail: GitHubApiCommitDetail }[] = [];
            const COMMIT_DETAIL_CHUNK_SIZE = 6;
            for (let commitIndex = 0; commitIndex < ghCommits.length; commitIndex += COMMIT_DETAIL_CHUNK_SIZE) {
              const commitChunk = ghCommits.slice(commitIndex, commitIndex + COMMIT_DETAIL_CHUNK_SIZE);
              const detailedChunk = await Promise.all(commitChunk.map(async (summary: GitHubApiCommitSummary) => {
                const sha = summary?.sha;
                if (!sha) return { summary, detail: summary as GitHubApiCommitDetail };

                // Önbellekten kontrol et
                if (this.commitDetailCache.has(sha)) {
                  return { summary, detail: this.commitDetailCache.get(sha)! };
                }

                try {
                  const detail = await this.fetchJson<GitHubApiCommitDetail>(
                    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/commits/${encodeURIComponent(sha)}`,
                    headers
                  );
                  this.commitDetailCache.set(sha, detail);
                  return { summary, detail };
                } catch {
                  return { summary, detail: summary as GitHubApiCommitDetail };
                }
              }));
              commitRecords.push(...detailedChunk);
            }

            commitRecords.forEach(({ summary, detail }) => {
              const msg = detail?.commit?.message || summary?.commit?.message || 'Depo güncellendi';
              const sha = detail?.sha || summary?.sha;
              const commitDate = detail?.commit?.author?.date || summary?.commit?.author?.date;
              if (typeof sha !== 'string' || !sha || typeof commitDate !== 'string' || Number.isNaN(new Date(commitDate).getTime())) {
                return;
              }
              const rawFiles = Array.isArray(detail?.files)
                ? detail.files
                : Array.isArray(summary?.files)
                  ? summary.files
                  : [];
              const files = rawFiles
                .filter((file: GitHubApiCommitFile) => typeof file?.filename === 'string')
                .map((file: GitHubApiCommitFile) => ({
                  filename: file.filename,
                  additions: asNonNegativeNumber(file.additions),
                  deletions: asNonNegativeNumber(file.deletions),
                }));
              const fileAdditions = files.reduce((total, file) => total + (file.additions || 0), 0);
              const fileDeletions = files.reduce((total, file) => total + (file.deletions || 0), 0);
              const additions = typeof detail?.stats?.additions === 'number'
                ? asNonNegativeNumber(detail.stats.additions)
                : fileAdditions;
              const deletions = typeof detail?.stats?.deletions === 'number'
                ? asNonNegativeNumber(detail.stats.deletions)
                : fileDeletions;

              const initialClassification = CommitSemanticClassifier.classifyByConvention(msg, sha);

              allCommits.push({
                sha,
                message: msg,
                author: detail?.commit?.author?.name || summary?.commit?.author?.name || detail?.author?.login || summary?.author?.login || 'Geliştirici',
                author_name: detail?.commit?.author?.name || summary?.commit?.author?.name,
                author_avatar: detail?.author?.avatar_url || summary?.author?.avatar_url,
                date: commitDate,
                additions,
                deletions,
                total_changes: additions + deletions,
                files_changed: files.length,
                affected_files: files.map((file) => file.filename),
                files,
                is_bug_fix: initialClassification.isBugFix,
                ai_category: initialClassification.category,
                ai_reasoning: initialClassification.reasoning,
                ai_confidence: initialClassification.confidence,
                repo_name: repo.name,
              });
            });

            // Pull Request'leri getir
            const ghPRs = await this.fetchJson<GitHubApiPRSummary[]>(
              `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/pulls?state=all&sort=updated&direction=desc&per_page=30`,
              headers
            );
            if (!Array.isArray(ghPRs)) {
              throw new Error(`${repo.name} PR listesi beklenen formatta dönmedi.`);
            }
            const relevantPRs = ghPRs.filter((pr: GitHubApiPRSummary) => {
              if (String(pr?.state || '').toLowerCase() === 'open') return true;
              const updatedTime = new Date(pr?.updated_at || pr?.created_at || '').getTime();
              return Number.isFinite(updatedTime) && updatedTime >= sinceTimestamp;
            });
            const prRecords: { summary: GitHubApiPRSummary; detail: GitHubApiPRDetail }[] = [];
            const PR_DETAIL_CHUNK_SIZE = 6;
            for (let prIndex = 0; prIndex < relevantPRs.length; prIndex += PR_DETAIL_CHUNK_SIZE) {
              const prChunk = relevantPRs.slice(prIndex, prIndex + PR_DETAIL_CHUNK_SIZE);
              const detailedChunk = await Promise.all(prChunk.map(async (summary: GitHubApiPRSummary) => {
                const prNumber = summary?.number;
                const prKey = `${owner}/${repoName}#${prNumber}`;
                if (this.prDetailCache.has(prKey)) {
                  return { summary, detail: this.prDetailCache.get(prKey)! };
                }
                try {
                  const detail = prNumber
                    ? await this.fetchJson<GitHubApiPRDetail>(
                        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/pulls/${prNumber}`,
                        headers
                      )
                    : null;
                  if (detail) this.prDetailCache.set(prKey, detail);
                  return { summary, detail: detail || (summary as GitHubApiPRDetail) };
                } catch {
                  return { summary, detail: summary as GitHubApiPRDetail };
                }
              }));
              prRecords.push(...detailedChunk);
            }

            prRecords.forEach(({ summary, detail }) => {
              const createdAt = detail?.created_at || summary?.created_at;
              if (typeof createdAt !== 'string' || Number.isNaN(new Date(createdAt).getTime())) {
                return;
              }
              const closedAt = detail?.closed_at || detail?.merged_at || summary?.closed_at || summary?.merged_at;
              const prState = detail?.merged_at || summary?.merged_at
                ? 'merged'
                : (detail?.state || summary?.state) === 'closed'
                  ? 'closed'
                  : 'open';
              const createdTime = new Date(createdAt).getTime();
              const closedTime = closedAt ? new Date(closedAt).getTime() : Number.NaN;
              const cycleTimeHours = Number.isFinite(createdTime) && Number.isFinite(closedTime)
                ? Math.max(0, Math.round((closedTime - createdTime) / MS_PER_HOUR))
                : undefined;

              allPRs.push({
                id: `pr_${detail?.id || summary?.id || `${repo.name}_${Date.now()}`}`,
                number: Number(detail?.number || summary?.number || 0),
                title: detail?.title || summary?.title || 'Başlıksız PR',
                state: prState as PullRequestMetric['state'],
                author: detail?.user?.login || summary?.user?.login || 'Geliştirici',
                created_at: createdAt,
                updated_at: detail?.updated_at || summary?.updated_at,
                closed_at: detail?.closed_at || summary?.closed_at,
                merged_at: detail?.merged_at || summary?.merged_at,
                additions: asNonNegativeNumber(detail?.additions ?? summary?.additions),
                deletions: asNonNegativeNumber(detail?.deletions ?? summary?.deletions),
                changed_files: asNonNegativeNumber(detail?.changed_files ?? summary?.changed_files),
                comments_count: asNonNegativeNumber(detail?.comments ?? summary?.comments),
                review_comments_count: asNonNegativeNumber(detail?.review_comments ?? summary?.review_comments),
                // GitHub PR list/detail uçları review event sürelerini vermez.
                // Bu nedenle yalnızca gerçek created -> closed/merged çevrimini sakla.
                cycle_time_hours: cycleTimeHours,
                repo_name: repo.name,
                is_stale: prState === 'open' && Number.isFinite(createdTime) && (Date.now() - createdTime) > STALE_PR_THRESHOLD_DAYS * MS_PER_DAY,
              });
            });

            // Issues'ları getir
            const ghIssues = await this.fetchJson<GitHubApiIssue[]>(
              `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/issues?state=all&sort=updated&direction=desc&per_page=30`,
              headers
            );
            if (!Array.isArray(ghIssues)) {
              throw new Error(`${repo.name} issue listesi beklenen formatta dönmedi.`);
            }
            const relevantIssues = ghIssues.filter((issue: GitHubApiIssue) => {
              if (String(issue?.state || '').toLowerCase() === 'open') return true;
              const updatedTime = new Date(issue?.updated_at || issue?.created_at || '').getTime();
              return Number.isFinite(updatedTime) && updatedTime >= sinceTimestamp;
            });
            relevantIssues.forEach((i: GitHubApiIssue) => {
              if (i.pull_request) return;
              const isBug = (i.labels || []).some((l: { name?: string }) => (l.name || '').toLowerCase().includes('bug') || (l.name || '').toLowerCase().includes('hata'));
              const createdAt = i.created_at;
              if (typeof createdAt !== 'string' || Number.isNaN(new Date(createdAt).getTime())) {
                return;
              }
              const createdTime = new Date(createdAt).getTime();

              allIssues.push({
                id: `issue_${i.id}`,
                number: Number(i.number) || 0,
                title: i.title || 'Başlıksız issue',
                state: i.state === 'closed' ? 'closed' : 'open',
                author: i.user?.login || 'Katkıda Bulunan',
                created_at: createdAt,
                closed_at: i.closed_at,
                comments_count: asNonNegativeNumber(i.comments),
                labels: (i.labels || []).map((l: { name?: string }) => l.name || 'sorun'),
                repo_name: repo.name,
                is_stale: i.state === 'open' && Number.isFinite(createdTime) && (Date.now() - createdTime) > STALE_ISSUE_THRESHOLD_DAYS * MS_PER_DAY,
                is_bug: isBug,
              });
            });

            // Ek telemetri verilerini çek (Diller, CI/CD, Sürümler, Dallar, Punch Card)
            try {
              const [languages, latestCi, latestRelease, branchesCount, punchCardItems] = await Promise.all([
                this.fetchLanguages(owner, repoName, headers),
                this.fetchLatestCiRun(owner, repoName, headers),
                this.fetchLatestRelease(owner, repoName, headers),
                this.fetchBranchesCount(owner, repoName, headers),
                this.fetchPunchCard(owner, repoName, headers),
              ]);

              repo.languages = languages;
              repo.latest_ci_run = latestCi || undefined;
              repo.latest_release = latestRelease || undefined;
              repo.branches_count = branchesCount;
              if (punchCardItems.length > 0) {
                allPunchCardItems.push(...punchCardItems);
              }
            } catch (extraErr) {
              console.warn(`${repo.name} için ek telemetri çekilirken uyarı:`, extraErr);
            }
          } catch (repoErr: unknown) {
            const message = repoErr instanceof Error ? repoErr.message : 'Bilinmeyen GitHub telemetri hatası.';
            failedRepositoryNames.push(repo.name);
            errors.push(`${repo.name}: ${message}`);
            console.warn(`${repo.name} için telemetri uyarısı:`, message);
          } finally {
            completedRepositories += 1;
            state.telemetryStatus = this.createTelemetryStatus(
              'syncing',
              selectedRepos.length,
              completedRepositories,
              failedRepositoryNames,
              errors[0],
            );
          }
        })
      );
    }

    // Punch card verilerini birleştir (0-6 gün, 0-23 saat)
    const punchCardMap = new Map<string, number>();
    for (const item of allPunchCardItems) {
      const key = `${item.day}_${item.hour}`;
      punchCardMap.set(key, (punchCardMap.get(key) || 0) + item.count);
    }
    const mergedPunchCard: PunchCardItem[] = [];
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        const key = `${d}_${h}`;
        mergedPunchCard.push({ day: d, hour: h, count: punchCardMap.get(key) || 0 });
      }
    }
    state.punchCard = mergedPunchCard;

    // Tüm seçili repoların dillerini topla ve yüzde dağılımı hesapla
    const totalBytesByLang: Record<string, number> = {};
    let grandTotalBytes = 0;
    for (const r of selectedRepos) {
      if (r.languages) {
        for (const [lang, bytes] of Object.entries(r.languages)) {
          totalBytesByLang[lang] = (totalBytesByLang[lang] || 0) + bytes;
          grandTotalBytes += bytes;
        }
      }
    }
    state.languagesBreakdown = Object.entries(totalBytesByLang)
      .map(([name, bytes]) => ({
        name,
        bytes,
        percentage: grandTotalBytes > 0 ? Math.round((bytes / grandTotalBytes) * 100) : 0,
      }))
      .sort((a, b) => b.bytes - a.bytes);

    // Gemini destekli anlamsal commit sınıflandırması (Toplu batch işleme & SHA immutability cache)
    if (allCommits.length > 0) {
      try {
        const semanticMap = await CommitSemanticClassifier.classifyCommits(allCommits);
        for (const commit of allCommits) {
          const analysis = semanticMap.get(commit.sha);
          if (analysis) {
            commit.is_bug_fix = analysis.isBugFix;
            commit.ai_category = analysis.category;
            commit.ai_reasoning = analysis.reasoning;
            commit.ai_confidence = analysis.confidence;
          }
        }
      } catch (classifierErr) {
        console.warn('Commit anlamsal sınıflandırma uyarısı:', classifierErr);
      }
    }

    state.commits = allCommits.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    state.pullRequests = allPRs.sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime());
    state.issues = allIssues.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    state.telemetryStatus = this.createTelemetryStatus(
      failedRepositoryNames.length > 0 ? 'partial' : 'ready',
      selectedRepos.length,
      completedRepositories,
      failedRepositoryNames,
      errors[0],
    );
  }

  public static async toggleRepoSelection(repoId: string): Promise<Repository[]> {
    if (this.activeSyncPromise) {
      await this.activeSyncPromise;
    }
    if (this.activeTogglePromise) {
      await this.activeTogglePromise;
    }

    const togglePromise = this.toggleRepoSelectionInternal(repoId);
    this.activeTogglePromise = togglePromise;
    try {
      return await togglePromise;
    } finally {
      if (this.activeTogglePromise === togglePromise) {
        this.activeTogglePromise = null;
      }
    }
  }

  private static async toggleRepoSelectionInternal(repoId: string): Promise<Repository[]> {
    const state = this.getState();
    const normalizedId = String(repoId || '').trim();
    const targetRepo = state.repositories.find(
      (repository) =>
        repository.id === normalizedId ||
        repository.id === `repo_${normalizedId}` ||
        `repo_${repository.id}` === normalizedId ||
        repository.name.toLowerCase() === normalizedId.toLowerCase(),
    );
    if (!targetRepo) {
      const error = new Error('Seçilmeye çalışılan depo bulunamadı.') as Error & { status?: number };
      error.status = 404;
      throw error;
    }

    const actualId = targetRepo.id;
    state.repositories = state.repositories.map((r) =>
      r.id === actualId ? { ...r, selected_for_analysis: !r.selected_for_analysis } : r
    );
    if (state.repositories.some((repository) => repository.id === actualId && repository.selected_for_analysis)) {
      state.isSyncing = true;
      state.syncStatus = 'syncing';
      state.syncError = undefined;
      try {
        await this.fetchRepositoryTelemetry();
        state.isSyncing = false;
        state.syncStatus = state.telemetryStatus.status === 'partial' ? 'partial' : 'ready';
        state.syncError = state.telemetryStatus.lastError;
        state.lastSyncAt = new Date().toISOString();
      } catch (err: unknown) {
        state.isSyncing = false;
        state.syncStatus = 'error';
        state.syncError = err instanceof Error ? err.message : 'Depo telemetrisi alınamadı.';
        throw err;
      }
    } else {
      // Seçim dışı bırakılan repoya ait eski telemetriyi hemen kaldır.
      const activeRepoNames = new Set(
        state.repositories.filter((repository) => repository.selected_for_analysis).map((repository) => repository.name),
      );
      state.commits = state.commits.filter((commit) => activeRepoNames.has(commit.repo_name));
      state.pullRequests = state.pullRequests.filter((pr) => activeRepoNames.has(pr.repo_name));
      state.issues = state.issues.filter((issue) => activeRepoNames.has(issue.repo_name));
      const failedRepositoryNames = (state.telemetryStatus.failedRepositoryNames || [])
        .filter((repositoryName) => activeRepoNames.has(repositoryName));
      state.telemetryStatus = this.createTelemetryStatus(
        activeRepoNames.size === 0
          ? 'no_data'
          : failedRepositoryNames.length > 0
            ? 'partial'
            : 'ready',
        activeRepoNames.size,
        activeRepoNames.size,
        failedRepositoryNames,
        failedRepositoryNames.length > 0 ? state.telemetryStatus.lastError : undefined,
      );
      state.syncStatus = state.telemetryStatus.status === 'partial' ? 'partial' : 'ready';
      state.syncError = state.telemetryStatus.lastError;
    }
    return this.getState().repositories;
  }

  public static async ensureSynced(force = false): Promise<GitHubStoreState> {
    const state = this.getState();
    if (this.activeSyncPromise) {
      await this.activeSyncPromise;
      return this.getState();
    }

    if (!force && (state.syncStatus === 'ready' || state.syncStatus === 'partial')) {
      return state;
    }

    // 1. ADIM: Zorunlu yenileme değilse ve bellekte veri yoksa önce Firestore Snapshot'ı oku (Instant Cold-Start)
    if (!force && !state.lastSyncAt) {
      try {
        const snapshot = await FirestoreService.getLatestSnapshot();
        if (snapshot && Array.isArray(snapshot.repositories) && snapshot.repositories.length > 0) {
          state.user = snapshot.user || state.user;
          state.repositories = snapshot.repositories;
          state.commits = snapshot.commits || [];
          state.pullRequests = snapshot.pullRequests || [];
          state.issues = snapshot.issues || [];
          state.punchCard = snapshot.punchCard || [];
          state.languagesBreakdown = snapshot.languagesBreakdown || [];
          state.lastSyncAt = snapshot.lastSyncAt;
          state.syncStatus = 'ready';
          state.isCachedFromDb = true;
          state.telemetryStatus = this.createTelemetryStatus('ready', state.repositories.length, state.repositories.length);

          if (snapshot.dailyBrief) this.cachedDailyBrief = snapshot.dailyBrief;
          if (snapshot.developerPersona) this.cachedDeveloperPersona = snapshot.developerPersona;
          if (snapshot.hotspots) this.cachedHotspots = snapshot.hotspots;
          if (snapshot.risks) this.cachedRisks = snapshot.risks;
          if (snapshot.healthScore) this.cachedHealthScore = snapshot.healthScore;

          console.log(`⚡ [GitHubService] Firestore'dan kayıtlı snapshot yüklendi! (${snapshot.repositories.length} repo, Son Eşitleme: ${snapshot.lastSyncAt})`);
          return state;
        }
      } catch (cacheErr) {
        console.warn('Firestore snapshot okuma uyarısı:', cacheErr);
      }
    }

    const token = state.token || process.env.GITHUB_TOKEN;
    if (token) {
      return this.syncRepositories();
    }

    state.syncStatus = 'no_data';
    state.telemetryStatus = this.createTelemetryStatus('no_data');
    return state;
  }

  public static async syncRepositories(force = false): Promise<GitHubStoreState> {
    if (this.activeSyncPromise) {
      return this.activeSyncPromise;
    }
    const state = this.getState();
    const token = state.token || process.env.GITHUB_TOKEN;
    if (token) {
      return this.connectWithToken(token);
    }
    state.syncStatus = 'no_data';
    state.syncError = undefined;
    state.telemetryStatus = this.createTelemetryStatus('no_data');
    return state;
  }

  /**
   * DRY Yardımcısı: Analiz için seçilmiş depoları, filtrelenmiş commit, PR ve issue'ları,
   * hesaplanmış hotspot, risk ve sağlık skorlarını tek merkezden döner.
   */
  public static async getActiveTelemetryContext() {
    const state = await this.ensureSynced();
    const activeRepos = state.repositories.filter((r) => r.selected_for_analysis);
    const activeRepoNames = new Set(activeRepos.map((r) => r.name));
    const commits = state.commits.filter((c) => activeRepoNames.has(c.repo_name));
    const pullRequests = state.pullRequests.filter((p) => activeRepoNames.has(p.repo_name));
    const issues = state.issues.filter((i) => activeRepoNames.has(i.repo_name));
    
    const hotspots = (commits.length > 0)
      ? HotspotEngine.analyzeHotspots(commits)
      : (this.cachedHotspots || []);
    const risks = (commits.length > 0)
      ? RiskEngine.analyzeRisks(activeRepos, commits, pullRequests, issues, hotspots)
      : (this.cachedRisks || []);
    const health = (commits.length > 0)
      ? HealthEngine.calculateHealth(
          activeRepos,
          commits,
          pullRequests,
          issues,
          undefined,
          state.telemetryStatus.status === 'partial' ? 'partial' : undefined,
        )
      : (this.cachedHealthScore || HealthEngine.calculateHealth(activeRepos, [], [], []));

    return {
      state,
      activeRepos,
      activeRepoNames,
      commits,
      pullRequests,
      issues,
      hotspots,
      risks,
      health,
      punchCard: state.punchCard || [],
      languagesBreakdown: state.languagesBreakdown || [],
    };
  }
}
