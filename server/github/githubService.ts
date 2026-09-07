import {
  Repository,
  CommitMetric,
  PullRequestMetric,
  IssueMetric,
  GitHubUser,
  SyncStatus,
  TelemetrySyncStatus,
  RateLimitStatus,
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
  lastSyncAt: string;
  lastSyncAttemptAt?: number;
  lastAccessedAt?: number;
  isSyncing?: boolean;
  syncStatus: SyncStatus;
  syncError?: string;
  telemetryStatus: TelemetrySyncStatus;
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

  // Commit ve PR detay önbelleği (Bellek sızıntısı ve rate limit tükenmesini önler)
  private static commitDetailCache = new BoundedCache<string, GitHubApiCommitDetail>(1000);
  private static prDetailCache = new BoundedCache<string, GitHubApiPRDetail>(500);

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
      
      return state;
    } catch (err: any) {
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
      state.syncError = err?.message || 'GitHub bağlantısı sırasında hata oluştu.';
      state.telemetryStatus = previousState.telemetryStatus;
      console.error('Canlı GitHub verisi senkronize edilirken hata:', err?.message || err);
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

    const CHUNK_SIZE = 5;
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
            const COMMIT_DETAIL_CHUNK_SIZE = 5;
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
                is_bug_fix: false, // Gemini yapay zekası anlamsal olarak sınıflandıracaktır
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
            const PR_DETAIL_CHUNK_SIZE = 5;
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
                ? Math.max(1, Math.round((closedTime - createdTime) / MS_PER_HOUR))
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
    const targetRepo = state.repositories.find((repository) => repository.id === repoId);
    if (!targetRepo) {
      const error = new Error('Seçilmeye çalışılan depo bulunamadı.') as Error & { status?: number };
      error.status = 404;
      throw error;
    }

    state.repositories = state.repositories.map((r) =>
      r.id === repoId ? { ...r, selected_for_analysis: !r.selected_for_analysis } : r
    );
    if (state.repositories.some((repository) => repository.id === repoId && repository.selected_for_analysis)) {
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

  public static async ensureSynced(): Promise<GitHubStoreState> {
    const state = this.getState();
    if (this.activeSyncPromise) {
      await this.activeSyncPromise;
      return this.getState();
    }

    if (state.syncStatus === 'ready' || state.syncStatus === 'partial') {
      return state;
    }

    const token = state.token || process.env.GITHUB_TOKEN;
    if (token) {
      return this.syncRepositories();
    }

    state.syncStatus = 'no_data';
    state.telemetryStatus = this.createTelemetryStatus('no_data');
    return state;
  }

  public static async syncRepositories(): Promise<GitHubStoreState> {
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
    const hotspots = HotspotEngine.analyzeHotspots(commits);
    const risks = RiskEngine.analyzeRisks(activeRepos, commits, pullRequests, issues, hotspots);
    const health = HealthEngine.calculateHealth(
      activeRepos,
      commits,
      pullRequests,
      issues,
      undefined,
      state.telemetryStatus.status === 'partial' ? 'partial' : undefined,
    );

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
    };
  }
}
