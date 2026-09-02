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
import { randomUUID } from 'crypto';
import { GITHUB_REQUEST_TIMEOUT_MS, TELEMETRY_WINDOW_DAYS, STALE_ISSUE_THRESHOLD_DAYS } from '../constants.js';
import { HotspotEngine } from '../metrics/hotspotEngine.js';
import { RiskEngine } from '../metrics/riskEngine.js';
import { HealthEngine } from '../metrics/healthEngine.js';

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

export class GitHubService {
  // In-memory session store (Kişisel hesap odaklı birincil store)
  private static sessions: Map<string, GitHubStoreState> = new Map();
  private static syncPromises: Map<string, Promise<{ sessionId: string; state: GitHubStoreState }>> = new Map();
  private static syncTokens: Map<string, string> = new Map();

  // Commit ve PR detay önbelleği (N+1 tekrar isteklerini ve rate limit tükenmesini önler)
  private static commitDetailCache: Map<string, any> = new Map();
  private static prDetailCache: Map<string, any> = new Map();

  // GitHub API Rate Limit durum takibi
  private static rateLimitStatus: RateLimitStatus = {
    limit: 5000,
    remaining: 5000,
    reset: Math.floor(Date.now() / 1000) + 3600,
    used: 0,
    updatedAt: new Date().toISOString(),
  };

  private static readonly SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

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

  private static cleanupStaleSessions() {
    const now = Date.now();
    for (const [sessionId, state] of this.sessions.entries()) {
      if (this.syncPromises.has(sessionId)) {
        continue;
      }
      if (state.lastAccessedAt && now - state.lastAccessedAt > this.SESSION_TTL_MS) {
        this.sessions.delete(sessionId);
      }
    }
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

  public static getState(_sessionId: string = 'default'): GitHubStoreState {
    this.cleanupStaleSessions();
    const canonicalSid = 'default';
    if (!this.sessions.has(canonicalSid)) {
      const initial = this.getInitialState();
      if (process.env.GITHUB_TOKEN) {
        initial.token = process.env.GITHUB_TOKEN.trim();
      }
      this.sessions.set(canonicalSid, initial);
    }
    const state = this.sessions.get(canonicalSid)!;
    if (!state.token && process.env.GITHUB_TOKEN) {
      state.token = process.env.GITHUB_TOKEN.trim();
    }
    this.enforcePersonalRepositoryScope(state);
    state.lastAccessedAt = Date.now();
    return state;
  }
  
  public static getAllSessionsCount(): number {
    return this.sessions.size;
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
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new Error(`GitHub isteği ${GITHUB_REQUEST_TIMEOUT_MS / 1000} saniye içinde yanıt vermedi.`);
      }
      if (err instanceof Error) throw err;
      throw new Error('GitHub isteği sırasında bilinmeyen bir hata oluştu.');
    } finally {
      clearTimeout(timeout);
    }
  }

  public static async connectWithToken(token: string, sessionId?: string): Promise<{ sessionId: string, state: GitHubStoreState }> {
    const sid = sessionId || randomUUID();
    const normalizedToken = token.trim();
    if (!normalizedToken) {
      throw new Error('GitHub token alanı zorunludur.');
    }

    // Aynı session ve token için gerçek bir single-flight garantisi ver.
    // Bekleyen promise tamamlandıktan sonra tekrar sync başlatmak, ilk ekranın
    // paralel query'leriyle aynı hesabı defalarca taramamıza neden oluyordu.
    while (true) {
      const runningSync = this.syncPromises.get(sid);
      if (!runningSync) break;

      if (this.syncTokens.get(sid) === normalizedToken) {
        return await runningSync;
      }

      // Farklı bir token ile gelen bilinçli bağlantı, mevcut sync bitince
      // sıraya girer. Aynı token ise yukarıdaki branch doğrudan paylaşır.
      try {
        await runningSync;
      } catch {
        // Yeni token denemesi önceki hatadan bağımsız olarak devam edebilir.
      }
    }

    const syncPromise = this.connectWithTokenInternal(normalizedToken, sid);
    this.syncPromises.set(sid, syncPromise);
    this.syncTokens.set(sid, normalizedToken);
    try {
      return await syncPromise;
    } finally {
      if (this.syncPromises.get(sid) === syncPromise) {
        this.syncPromises.delete(sid);
        this.syncTokens.delete(sid);
      }
    }
  }

  private static async connectWithTokenInternal(token: string, sid: string): Promise<{ sessionId: string, state: GitHubStoreState }> {
    const state = this.getState(sid);
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
    this.sessions.set(sid, state);

    try {
      const headers = {
        Authorization: `Bearer ${normalizedToken}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'DevControl-AI-Platform',
      };

      // 1. Kullanıcı profilini getir
      const ghUser = await this.fetchJson<any>('https://api.github.com/user', headers);
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
      const allFetchedRepos: any[] = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const pageRepos = await this.fetchJson<any[]>(
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
      const personalRepos = uniqueRepos.filter((repo: any) => {
        const ownerLogin = String(repo?.owner?.login || repo?.full_name?.split('/')?.[0] || '').trim().toLowerCase();
        const ownerType = String(repo?.owner?.type || '').trim().toLowerCase();
        return ownerLogin === authenticatedLogin && (!ownerType || ownerType === 'user');
      });

      state.repositories = personalRepos.map((r: any) => ({
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
      await this.fetchRepositoryTelemetry(sid);

      state.lastSyncAt = new Date().toISOString();
      state.isSyncing = false;
      state.syncStatus = state.telemetryStatus.status === 'partial' ? 'partial' : 'ready';
      state.syncError = state.telemetryStatus.lastError;
      this.sessions.set(sid, state);
      
      return { sessionId: sid, state };
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
      this.sessions.set(sid, state);
      console.error('Canlı GitHub verisi senkronize edilirken hata:', err?.message || err);
      throw err;
    }
  }

  private static async fetchRepositoryTelemetry(sessionId: string): Promise<void> {
    const state = this.getState(sessionId);
    if (!state.token) {
      state.commits = [];
      state.pullRequests = [];
      state.issues = [];
      state.telemetryStatus = this.createTelemetryStatus('no_data');
      this.sessions.set(sessionId, state);
      return;
    }
    
    const selectedRepos = state.repositories.filter((r) => r.selected_for_analysis);
    if (selectedRepos.length === 0) {
      state.commits = [];
      state.pullRequests = [];
      state.issues = [];
      state.telemetryStatus = this.createTelemetryStatus('no_data');
      this.sessions.set(sessionId, state);
      return;
    }

    const allCommits: CommitMetric[] = [];
    const allPRs: PullRequestMetric[] = [];
    const allIssues: IssueMetric[] = [];
    const failedRepositoryNames: string[] = [];
    const errors: string[] = [];
    let completedRepositories = 0;

    state.telemetryStatus = this.createTelemetryStatus('syncing', selectedRepos.length);
    this.sessions.set(sessionId, state);

    const headers = {
      Authorization: `Bearer ${state.token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'DevControl-AI-Platform',
    };

    const asNonNegativeNumber = (value: unknown): number => {
      return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
    };
    const sinceTimestamp = Date.now() - TELEMETRY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
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
            const ghCommits = await this.fetchJson<any[]>(
              `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/commits?per_page=30&since=${encodeURIComponent(since)}`,
              headers
            );
            if (!Array.isArray(ghCommits)) {
              throw new Error(`${repo.name} commit listesi beklenen formatta dönmedi.`);
            }

            const commitRecords: { summary: any; detail: any }[] = [];
            const COMMIT_DETAIL_CHUNK_SIZE = 5;
            for (let commitIndex = 0; commitIndex < ghCommits.length; commitIndex += COMMIT_DETAIL_CHUNK_SIZE) {
              const commitChunk = ghCommits.slice(commitIndex, commitIndex + COMMIT_DETAIL_CHUNK_SIZE);
              const detailedChunk = await Promise.all(commitChunk.map(async (summary: any) => {
                const sha = summary?.sha;
                if (!sha) return { summary, detail: summary };

                // Önbellekten kontrol et
                if (this.commitDetailCache.has(sha)) {
                  return { summary, detail: this.commitDetailCache.get(sha) };
                }

                try {
                  const detail = await this.fetchJson<any>(
                    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/commits/${encodeURIComponent(sha)}`,
                    headers
                  );
                  this.commitDetailCache.set(sha, detail);
                  return { summary, detail };
                } catch {
                  return { summary, detail: summary };
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
              const lower = msg.toLowerCase();
              const isBugFix = lower.includes('fix') || lower.includes('bug') || lower.includes('patch') || lower.includes('resolve') || lower.includes('issue') || lower.includes('hata');
              const rawFiles = Array.isArray(detail?.files)
                ? detail.files
                : Array.isArray(summary?.files)
                  ? summary.files
                  : [];
              const files = rawFiles
                .filter((file: any) => typeof file?.filename === 'string')
                .map((file: any) => ({
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
                is_bug_fix: isBugFix,
                repo_name: repo.name,
              });
            });

            // Pull Request'leri getir
            const ghPRs = await this.fetchJson<any[]>(
              `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/pulls?state=all&sort=updated&direction=desc&per_page=30`,
              headers
            );
            if (!Array.isArray(ghPRs)) {
              throw new Error(`${repo.name} PR listesi beklenen formatta dönmedi.`);
            }
            const relevantPRs = ghPRs.filter((pr: any) => {
              if (String(pr?.state || '').toLowerCase() === 'open') return true;
              const updatedTime = new Date(pr?.updated_at || pr?.created_at || '').getTime();
              return Number.isFinite(updatedTime) && updatedTime >= sinceTimestamp;
            });
            const prRecords: { summary: any; detail: any }[] = [];
            const PR_DETAIL_CHUNK_SIZE = 5;
            for (let prIndex = 0; prIndex < relevantPRs.length; prIndex += PR_DETAIL_CHUNK_SIZE) {
              const prChunk = relevantPRs.slice(prIndex, prIndex + PR_DETAIL_CHUNK_SIZE);
              const detailedChunk = await Promise.all(prChunk.map(async (summary: any) => {
                const prNumber = summary?.number;
                const prKey = `${owner}/${repoName}#${prNumber}`;
                if (this.prDetailCache.has(prKey)) {
                  return { summary, detail: this.prDetailCache.get(prKey) };
                }
                try {
                  const detail = prNumber
                    ? await this.fetchJson<any>(
                        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/pulls/${prNumber}`,
                        headers
                      )
                    : null;
                  if (detail) this.prDetailCache.set(prKey, detail);
                  return { summary, detail: detail || summary };
                } catch {
                  return { summary, detail: summary };
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
                ? Math.max(1, Math.round((closedTime - createdTime) / (1000 * 60 * 60)))
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
                is_stale: prState === 'open' && Number.isFinite(createdTime) && (Date.now() - createdTime) > 1000 * 60 * 60 * 24 * 7,
              });
            });

            // Issues'ları getir
            const ghIssues = await this.fetchJson<any[]>(
              `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/issues?state=all&sort=updated&direction=desc&per_page=30`,
              headers
            );
            if (!Array.isArray(ghIssues)) {
              throw new Error(`${repo.name} issue listesi beklenen formatta dönmedi.`);
            }
            const relevantIssues = ghIssues.filter((issue: any) => {
              if (String(issue?.state || '').toLowerCase() === 'open') return true;
              const updatedTime = new Date(issue?.updated_at || issue?.created_at || '').getTime();
              return Number.isFinite(updatedTime) && updatedTime >= sinceTimestamp;
            });
            relevantIssues.forEach((i: any) => {
              if (i.pull_request) return;
              const isBug = (i.labels || []).some((l: any) => (l.name || '').toLowerCase().includes('bug') || (l.name || '').toLowerCase().includes('hata'));
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
                labels: (i.labels || []).map((l: any) => l.name || 'sorun'),
                repo_name: repo.name,
                is_stale: i.state === 'open' && Number.isFinite(createdTime) && (Date.now() - createdTime) > 1000 * 60 * 60 * 24 * STALE_ISSUE_THRESHOLD_DAYS,
                is_bug: isBug,
              });
            });
          } catch (repoErr: any) {
            const message = repoErr?.message || 'Bilinmeyen GitHub telemetri hatası.';
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
            this.sessions.set(sessionId, state);
          }
        })
      );
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
    
    this.sessions.set(sessionId, state);
  }

  public static async toggleRepoSelection(sessionId: string, repoId: string): Promise<Repository[]> {
    const state = this.getState(sessionId);
    const targetRepo = state.repositories.find((repository) => repository.id === repoId);
    if (!targetRepo) {
      const error = new Error('Seçilmeye çalışılan depo bu session içinde bulunamadı.') as Error & { status?: number };
      error.status = 404;
      throw error;
    }

    state.repositories = state.repositories.map((r) =>
      r.id === repoId ? { ...r, selected_for_analysis: !r.selected_for_analysis } : r
    );
    this.sessions.set(sessionId, state);
    if (state.repositories.some((repository) => repository.id === repoId && repository.selected_for_analysis)) {
      state.isSyncing = true;
      state.syncStatus = 'syncing';
      state.syncError = undefined;
      try {
        await this.fetchRepositoryTelemetry(sessionId);
        state.isSyncing = false;
        state.syncStatus = state.telemetryStatus.status === 'partial' ? 'partial' : 'ready';
        state.syncError = state.telemetryStatus.lastError;
        state.lastSyncAt = new Date().toISOString();
      } catch (err: any) {
        state.isSyncing = false;
        state.syncStatus = 'error';
        state.syncError = err?.message || 'Depo telemetrisi alınamadı.';
        this.sessions.set(sessionId, state);
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
    this.sessions.set(sessionId, state);
    return this.getState(sessionId).repositories;
  }

  public static async ensureSynced(_sessionId: string = 'default'): Promise<GitHubStoreState> {
    const canonicalSid = 'default';
    const state = this.getState(canonicalSid);
    const runningSync = this.syncPromises.get(canonicalSid);
    if (runningSync) {
      await runningSync;
      return this.getState(canonicalSid);
    }

    if (state.syncStatus === 'ready' || state.syncStatus === 'partial') {
      return state;
    }

    const token = state.token || process.env.GITHUB_TOKEN;
    if (token) {
      return this.syncRepositories(canonicalSid);
    }

    state.syncStatus = 'no_data';
    state.telemetryStatus = this.createTelemetryStatus('no_data');
    this.sessions.set(canonicalSid, state);
    return state;
  }

  public static async syncRepositories(_sessionId: string = 'default'): Promise<GitHubStoreState> {
    const canonicalSid = 'default';
    const state = this.getState(canonicalSid);
    const token = state.token || process.env.GITHUB_TOKEN;
    if (token) {
      await this.connectWithToken(token, canonicalSid);
    } else {
      state.syncStatus = 'no_data';
      state.syncError = undefined;
      state.telemetryStatus = this.createTelemetryStatus('no_data');
      this.sessions.set(canonicalSid, state);
    }
    return this.getState(canonicalSid);
  }

  /**
   * DRY Yardımcısı: Analiz için seçilmiş depoları, filtrelenmiş commit, PR ve issue'ları,
   * hesaplanmış hotspot, risk ve sağlık skorlarını tek merkezden döner.
   */
  public static async getActiveTelemetryContext(_sessionId: string = 'default') {
    const state = await this.ensureSynced('default');
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
