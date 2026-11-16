import {
  Repository,
  CommitMetric,
  PullRequestMetric,
  IssueMetric,
  GitHubUser,
  SyncStatus,
  TelemetrySyncStatus,
  RateLimitStatus,
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
  TREE_ENTRY_LIMIT,
  MAX_COMMIT_FILES,
} from '../constants.js';
import { HotspotEngine } from '../metrics/hotspotEngine.js';
import { RiskEngine } from '../metrics/riskEngine.js';
import { HealthEngine } from '../metrics/healthEngine.js';
import { CommitSemanticClassifier } from '../ai/commitClassifier.js';
import { FirestoreService, type TelemetrySnapshot } from '../db/firestoreService.js';
import { ensureRuntimeConfig, getGitHubToken } from '../runtimeConfig.js';
import { BoundedCache } from '../utils/boundedCache.js';
import { commitFileNames } from '../utils/commitFiles.js';

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
  isSyncing?: boolean;
  syncStatus: SyncStatus;
  syncError?: string;
  telemetryStatus: TelemetrySyncStatus;
  isCachedFromDb?: boolean;
}

/**
 * Analiz için seçilmiş depolar ve bunlara ait filtrelenmiş telemetri ile
 * deterministik motor çıktılarını tek pakette taşır.
 */
export interface ActiveTelemetryContext {
  state: GitHubStoreState;
  activeRepos: Repository[];
  commits: CommitMetric[];
  pullRequests: PullRequestMetric[];
  issues: IssueMetric[];
  hotspots: FileHotspot[];
  risks: EngineeringRisk[];
  health: EngineeringHealthScore;
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
  /**
   * Liste uç noktasının yanıtı: `files` ve `stats` alanları YALNIZCA commit
   * detay yanıtında bulunur (bkz. commit detay çekimi). Şekil tek arayüzde
   * toplandığı için burada tanımlılardır; liste yanıtında hiç gelmezler.
   */
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
  comments?: number;
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
  /**
   * Uçuştaki snapshot okuması. Soğuk başlangıçta panelin tüm sorguları paralel
   * gelir ve her biri (henüz `lastSyncAt` yokken) aynı dokümanı okumak ister;
   * tekilleştirme olmadan aynı ~yüzlerce KiB'lik doküman istek başına bir kez
   * okunur (gecikme + Firestore okuma faturası). Okuma bitince temizlenir:
   * sonraki eşitleme dokümanı yeniden yazdığı için sonucu önbelleğe almak
   * bayat veriyi servis etmek olurdu.
   */
  private static activeSnapshotLoad: Promise<TelemetrySnapshot | null> | null = null;

  /**
   * Kalıcılaştırma yazmalarının tek sırası (bkz. persistSnapshot).
   *
   * Brifing ve persona neredeyse aynı anda tamamlanabilir ve ikisi de AYNI
   * dokümanı yazar; sırasız iki yazmada sonuç, yazmaların bitiş sırasına kalırdı.
   */
  private static snapshotWriteQueue: Promise<boolean> = Promise.resolve(false);

  /**
   * Başarısız bir eşitlemeden sonra yeni bir tam eşitleme denemesi için beklenecek
   * süre. Bu fren olmadan `syncStatus === 'error'` iken gelen HER istek (panel
   * başına birkaç sorgu) yeni bir tam eşitleme başlatır: her deneme GitHub kota
   * harcar, hesap seviyesinde çağrılar yapar ve isteği saniyelerce bekletir.
   * Kullanıcı kaynaklı yenileme (`force`) bu freni atlar — "Yenile" her zaman
   * hemen dener.
   */
  private static readonly SYNC_RETRY_COOLDOWN_MS = 60_000;

  // Yapay zeka metin önbelleği (Snapshot & Instant Startup için). Kural motoru
  // çıktıları (hotspot/risk/sağlık) bilinçli olarak burada tutulmaz: onlar
  // commitlerden istek üzerine yeniden hesaplanır ve snapshot'a yazılan kopya,
  // soğuk başlangıçta yalnızca commit listesi boşken okunabiliyordu — yani
  // ölçülen bir durumda hiç kullanılmayan, dokümanın ~%70'ini şişiren ölü veri.
  private static cachedDailyBrief: TodayBriefItem[] | null = null;
  private static cachedDeveloperPersona: DeveloperPersona | null = null;

  public static getCachedDailyBrief(): TodayBriefItem[] | null {
    return this.cachedDailyBrief;
  }
  /**
   * Üretilen brifingi önbelleğe alır ve kalıcılaştırır (bkz. persistSnapshot).
   *
   * Yazma yolu (write-through) olmadan iki şey ölü kalırdı: snapshot'ın
   * `dailyBrief` alanı (hiç dolmazdı) ve `routes/ai.ts`'teki hızlı yol —
   * soğuk başlangıçta brifing yeniden üretilsin diye değil, üretilmiş hâliyle
   * anında servis edilsin diye tutuluyor. Yazma başarısız olsa bile akış
   * durmaz (bkz. persistSnapshot).
   */
  public static setCachedDailyBrief(brief: TodayBriefItem[]): void {
    this.cachedDailyBrief = brief;
    void this.persistSnapshot();
  }
  public static getCachedDeveloperPersona(): DeveloperPersona | null {
    return this.cachedDeveloperPersona;
  }
  /** Üretilen personayı önbelleğe alır ve kalıcılaştırır (bkz. setCachedDailyBrief). */
  public static setCachedDeveloperPersona(persona: DeveloperPersona): void {
    this.cachedDeveloperPersona = persona;
    void this.persistSnapshot();
  }

  // Commit ve PR detay önbelleği (Bellek sızıntısı ve rate limit tükenmesini önler)
  private static commitDetailCache = new BoundedCache<string, GitHubApiCommitDetail>(1000);
  private static prDetailCache = new BoundedCache<string, GitHubApiPRDetail>(500);
  private static languagesCache = new BoundedCache<string, Record<string, number>>(200);
  private static ciRunsCache = new BoundedCache<string, RepositoryCiRun | null>(200);
  private static releasesCache = new BoundedCache<string, RepositoryRelease | null>(200);
  private static branchesCountCache = new BoundedCache<string, number>(200);
  private static treeCache = new BoundedCache<string, string[]>(50);

  /**
   * Değişebilir (mutable) GitHub verisi tutan önbellekleri düşürür.
   *
   * Anahtar bir commit SHA'sı değil, bir depo/PR gibi **yaşayan** bir kaynak
   * olduğunda içerik zamanla değişir: bir PR birleşir, CI durumu döner, sürüm
   * yayınlanır, dallar ilerler, dil dağılımı yeni dosya tipleriyle kayar. Bu
   * önbellekler kullanıcı kaynaklı bir yenilemede temizlenmezse, süreç ayakta
   * kaldığı sürece ilk çekilen değerler servis edilir ve "Yenile" düğmesi
   * görünürde hiçbir şeyi değiştirmez.
   *
   * `commitDetailCache` bilinçli olarak temizlenmez: bir commit SHA'sının
   * dosya/istatistik içeriği değişmez, bu yüzden onu yeniden çekmek yalnızca
   * GitHub kotası harcar.
   */
  private static invalidateMutableCaches(): void {
    this.prDetailCache.clear();
    this.languagesCache.clear();
    this.ciRunsCache.clear();
    this.releasesCache.clear();
    this.branchesCountCache.clear();
    this.treeCache.clear();
  }

  // Analiz bağlamı önbelleği: tek bir sayfa yüklemesi sağlık, hotspot, risk ve
  // bülten uç noktalarını paralel çağırdığı için üç metrik motoru istek başına
  // değil, kısa bir TTL penceresi başına bir kez çalıştırılır.
  private static telemetryContextCache: {
    signature: string;
    context: ActiveTelemetryContext;
  } | null = null;
  private static readonly TELEMETRY_CONTEXT_TTL_MS = 5_000;
  private static telemetryContextComputedAt = 0;

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

  /**
   * Telemetri durumunu daraltılmış bir seçim kapsamı için yeniden kurar.
   *
   * İki yol (kimlik kapsamı daraltma ve seçim değişikliği) aynı kuralı
   * kullanır; kural kopyalandığında kopyalar ayrışmıştı: biri "tamamlanan"
   * sayısını korurken diğeri kapsam büyüklüğünü yazıyordu ve başarısız depo
   * varken "hepsi tamamlandı" diyebiliyordu — `failedRepositories > 0` ile
   * `completed === total` yan yana geldiğinde durum kendi içinde çelişir.
   *
   * Kapsamdaki başarısızlıklar korunur (kapsam dışına çıkanlar düşer) ve
   * "tamamlanan" = kapsam − başarısız olarak türetilir. Uçuştaki bir eşitleme
   * bu yeniden kurulumla 'ready'ye düşürülmez: `syncing` korunur, aksi hâlde
   * eşitleme sürerken okuma uçları "hazır" derdi.
   *
   * @returns Kapsamda kalan başarısız depo adları (çağıran `syncStatus`
   * uyumlaması için kullanır).
   */
  private static rebuildScopedTelemetryStatus(
    state: GitHubStoreState,
    scopedRepoNames: ReadonlySet<string>,
  ): string[] {
    const failedRepositoryNames = (state.telemetryStatus?.failedRepositoryNames || [])
      .filter((repositoryName) => scopedRepoNames.has(repositoryName));
    const total = scopedRepoNames.size;
    state.telemetryStatus = this.createTelemetryStatus(
      total === 0
        ? 'no_data'
        : failedRepositoryNames.length > 0
          ? 'partial'
          : state.telemetryStatus.status === 'syncing'
            ? 'syncing'
            : 'ready',
      total,
      Math.max(0, total - failedRepositoryNames.length),
      failedRepositoryNames,
      failedRepositoryNames.length > 0 ? state.telemetryStatus.lastError : undefined,
    );
    return failedRepositoryNames;
  }

  public static getInitialState(): GitHubStoreState {
    return {
      user: INITIAL_USER,
      repositories: [],
      commits: [],
      pullRequests: [],
      issues: [],
      lastSyncAt: '',
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

    // Tek geçişte kişisel depoları ve adlarını topla; ayrı bir filtre geçişi yapılmaz.
    const personalRepositories: Repository[] = [];
    const personalRepositoryNames = new Set<string>();
    for (const repository of state.repositories) {
      const ownerLogin = String(repository.full_name || '').split('/')[0].trim().toLowerCase();
      if (ownerLogin === authenticatedLogin) {
        personalRepositories.push(repository);
        personalRepositoryNames.add(repository.name);
      }
    }

    const hasNonPersonalRepository = personalRepositories.length !== state.repositories.length;
    const hasForeignTelemetry =
      this.hasForeignRepoName(state.commits, personalRepositoryNames) ||
      this.hasForeignRepoName(state.pullRequests, personalRepositoryNames) ||
      this.hasForeignRepoName(state.issues, personalRepositoryNames);

    if (!hasNonPersonalRepository && !hasForeignTelemetry) {
      return;
    }

    state.repositories = personalRepositories;
    state.commits = state.commits.filter((commit) => personalRepositoryNames.has(commit.repo_name));
    state.pullRequests = state.pullRequests.filter((pullRequest) => personalRepositoryNames.has(pullRequest.repo_name));
    state.issues = state.issues.filter((issue) => personalRepositoryNames.has(issue.repo_name));

    // Kapsam, telemetri durumunun ölçtüğü kümedir: **seçili** kişisel depolar.
    // Tüm kişisel depolar üzerinden saymak, seçimden çıkarılmış bir deponun
    // başarısızlığını seçim kapsamına yazardı (bkz. rebuildScopedTelemetryStatus).
    const selectedPersonalRepoNames = new Set<string>();
    for (const repository of personalRepositories) {
      if (repository.selected_for_analysis) selectedPersonalRepoNames.add(repository.name);
    }
    const failedRepositoryNames = this.rebuildScopedTelemetryStatus(state, selectedPersonalRepoNames);
    // Yalnızca bayat bir 'partial' LİFT edilir; 'ready'ye düşürmenin tek
    // yetkilisi bu değil (bkz. toggleRepoSelectionInternal: seçim değişikliği
    // sonrası durumun tek sahibi odur). Bu yol bir eşitlemenin hemen öncesinde
    // çalışır ve `syncStatus`'u eşitleme kendisi kuracaktır.
    if (state.syncStatus === 'partial' && failedRepositoryNames.length === 0) {
      state.syncStatus = 'ready';
      state.syncError = undefined;
    }
  }

  /**
   * Verilen kayıt dizisinde kişisel depo kapsamı dışında bir depo adı var mı?
   * İlk uyuşmazlıkta erken çıkar; ara dizi üretmez.
   */
  private static hasForeignRepoName(
    records: { repo_name: string }[],
    personalRepositoryNames: Set<string>,
  ): boolean {
    for (const record of records) {
      if (!personalRepositoryNames.has(record.repo_name)) {
        return true;
      }
    }
    return false;
  }

  public static getState(): GitHubStoreState {
    if (!this.state) {
      this.state = this.getInitialState();
    }
    const runtimeToken = getGitHubToken();
    if (runtimeToken) {
      this.state.token = runtimeToken;
    } else if (!this.state.token && process.env.GITHUB_TOKEN) {
      this.state.token = process.env.GITHUB_TOKEN.trim();
    }
    this.enforcePersonalRepositoryScope(this.state);
    return this.state;
  }

  private static async fetchJson<T>(url: string, headers: Record<string, string>): Promise<T> {
    return this.fetchTimed(url, headers, (response) => response.json() as Promise<T>);
  }

  /**
   * Zaman aşımlı GitHub isteği: okuma (`consume`) da zamanlayıcının İÇİNDE yapılır.
   *
   * Sınır yalnızca başlıklara uygulanamaz. `fetch` yanıtı başlıklar gelir gelmez
   * çözer; gövde ayrı bir okuma turudur ve asıl baytlar orada gelir. Zamanlayıcı
   * başlıklardan sonra iptal edilirse (eski `fetchResponse` + `response.json()`
   * ayrımı), gövdesi takılan bir yanıt hiçbir zaman sınırlanmaz: eşitleme ve
   * onu bekleyen her uç, `GITHUB_REQUEST_TIMEOUT_MS` yerine alttaki HTTP
   * istemcisinin gövde zaman aşımına kadar asılı kalırdı.
   *
   * Başlıkları da okuyan uçlar (bkz. fetchBranchesCount -> `Link`) aynı sınır
   * içinde gövdeye erişir; sözleşme tek: zaman aşımı, hata mesajı ve kota
   * muhasebesi burada.
   */
  private static async fetchTimed<T>(
    url: string,
    headers: Record<string, string>,
    consume: (response: Response) => Promise<T>,
  ): Promise<T> {
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
      return await consume(response);
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

  /**
   * Deponun dal sayısı — ÖLÇÜLMÜŞ sayı ya da `null` (ölçülemedi).
   *
   * Sayı `Link: rel="last"` başlığından okunur: `per_page=1` ile ilk sayfa tek
   * dal taşır ve son sayfanın numarası dalların tam sayısıdır. Tek sayfalık
   * yanıtlarda başlık hiç gelmez; o durumda gövdedeki kayıt sayısı (0 ya da 1)
   * cevabın kendisidir. Sabit `per_page=30` ile saymak (eski davranış) 30'dan
   * fazla dalı olan her depoyu "30 dal" diye gösterirdi — ölçülmemiş bir alt
   * sınır, ölçülmüş bir sayı gibi. Ölçülemediğinde `null` döner; çağıran alanı
   * hiç yazmaz, arayüz rozeti de ölçümsüzken görünmez. Önbellekteki `0` gerçek
   * bir ölçümdür (`0 dal`) ve `undefined` ile karıştırılmaz.
   */
  public static async fetchBranchesCount(owner: string, repoName: string, headers: Record<string, string>): Promise<number | null> {
    const key = `${owner}/${repoName}`;
    const cached = this.branchesCountCache.get(key);
    if (cached !== undefined) return cached;
    try {
      const count = await this.fetchTimed(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/branches?per_page=1`,
        headers,
        async (response): Promise<number | null> => {
          const lastPage = this.parseLastPageNumber(response.headers.get('link'));
          if (lastPage !== null) return lastPage;
          const page = await response.json();
          return Array.isArray(page) ? page.length : null;
        },
      );
      if (count === null) return null;
      this.branchesCountCache.set(key, count);
      return count;
    } catch {
      return null;
    }
  }

  /**
   * `Link` başlığından son sayfanın numarasını çıkarır; başlık yoksa ya da
   * `rel="last"` taşımıyorsa (tek sayfa) `null` döner.
   */
  private static parseLastPageNumber(linkHeader: string | null): number | null {
    if (!linkHeader) return null;
    const match = linkHeader.match(/[?&]page=(\d+)[^>]*>;\s*rel="last"/);
    if (!match) return null;
    const page = Number(match[1]);
    return Number.isFinite(page) && page > 0 ? page : null;
  }

  public static async fetchRepositoryTree(owner: string, repoName: string, defaultBranch = 'main'): Promise<string[]> {
    await ensureRuntimeConfig();
    const state = this.getState();
    const token = getGitHubToken() || state.token || process.env.GITHUB_TOKEN;
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
      const allPaths = (data?.tree || [])
        .filter((item) => typeof item.path === 'string')
        .map((item) => item.path as string);
      const paths = allPaths.slice(0, TREE_ENTRY_LIMIT);
      if (allPaths.length > paths.length) {
        // Sessiz kırpma yapılmaz: modelin gördüğü ağacın eksik olduğu açıkça kaydedilir.
        console.info(
          `[DevControl AI] ${repoName} dosya ağacı ${allPaths.length} girdiden ${paths.length} girdiye kırpıldı (TREE_ENTRY_LIMIT).`
        );
      }
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

      // Canlı eşitleme türev yapay zeka çıktılarını geçersiz kılar: brifing ve
      // persona, ÖNCEKİ telemetriden üretilmiş sayıları taşır (ör. "3 PR
      // inceleme bekliyor"). Bunlar temizlenmezse eski sayılar yeni KPI
      // kartlarının yanında gösterilir ve snapshot'a yazılıp bir sonraki soğuk
      // başlangıçta "güncel" gibi servis edilirdi. Kural motoru çıktıları
      // (hotspot/risk/sağlık) önbelleğe alınmaz: istek üzerine commitlerden
      // yeniden hesaplanırlar (bkz. getActiveTelemetryContext), bu yüzden
      // temizlenecek bir kopyaları yoktur.
      this.cachedDailyBrief = null;
      this.cachedDeveloperPersona = null;

      // Firestore'a kalıcı ve anti-bloat tekil snapshot kaydı (tek yazma noktası:
      // bkz. persistSnapshot).
      await this.persistSnapshot();

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
      // Fren penceresi **başarısızlık anından** başlar, denemenin
      // başlangıcından değil: saniyeler değil dakikalar sürebilen bir eşitleme
      // başarısız olduğunda, başlangıçta yazılmış damga (bkz. yukarısı) çoktan
      // dolmuş olur ve `ensureSynced` freni hiç uygulamaz — her istek yeni bir
      // tam eşitleme başlatır (GitHub kotası + her Cloud Run örneğinde ayrı
      // deneme). Bkz. SYNC_RETRY_COOLDOWN_MS.
      state.lastSyncAttemptAt = Date.now();
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
            // Üç liste de birbirinden bağımsızdır (hiçbiri diğerinin çıktısını
            // kullanmaz): istekler birlikte başlatılıp birlikte beklenir.
            // Sırayla beklemek depo başına üç ağ turunu üst üste bindirir ve
            // altı depoluk bir eşitlemeye belirgin gecikme ekler.
            const [ghCommits, ghPRs, ghIssues] = await Promise.all([
              this.fetchJson<GitHubApiCommitSummary[]>(
                `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/commits?per_page=30&since=${encodeURIComponent(since)}`,
                headers
              ),
              this.fetchJson<GitHubApiPRSummary[]>(
                `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/pulls?state=all&sort=updated&direction=desc&per_page=30`,
                headers
              ),
              this.fetchJson<GitHubApiIssue[]>(
                `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/issues?state=all&sort=updated&direction=desc&per_page=30`,
                headers
              ),
            ]);
            if (!Array.isArray(ghCommits)) {
              throw new Error(`${repo.name} commit listesi beklenen formatta dönmedi.`);
            }
            if (!Array.isArray(ghPRs)) {
              throw new Error(`${repo.name} PR listesi beklenen formatta dönmedi.`);
            }
            if (!Array.isArray(ghIssues)) {
              throw new Error(`${repo.name} issue listesi beklenen formatta dönmedi.`);
            }

            // Ek telemetri verileri (diller, CI, sürüm, dal sayısı) commit/PR/
            // issue listelerinin işlenmesine bağlı değildir; işleme adımları
            // (detay istekleri dahil) saniyeler sürebildiği için dördü de ana
            // listelerle birlikte başlatılır ve sonuç aşağıda beklenir. Hata
            // hemen ele alınır (`then`in ikinci işleyicisi): beklemeye kadar
            // geçen sürede reddedilen bir söz, hiçbir işleyiciye bağlı
            // olmadığı için süreç düzeyinde yakalanmamış reddetme olurdu.
            const extrasPromise = Promise.all([
              this.fetchLanguages(owner, repoName, headers),
              this.fetchLatestCiRun(owner, repoName, headers),
              this.fetchLatestRelease(owner, repoName, headers),
              this.fetchBranchesCount(owner, repoName, headers),
            ]).then(
              (extras) => ({ ok: true as const, extras }),
              (error: unknown) => ({ ok: false as const, error }),
            );

            const commitRecords: { summary: GitHubApiCommitSummary; detail: GitHubApiCommitDetail }[] = [];
            // Detay isteği düşen commitler sayılır: liste uç noktası `files` ve
            // `stats` taşımaz, bu yüzden böyle bir commit için satır istatistiği
            // ve dosya listesi ÖLÇÜLEMEZ (kayıt sıfır satırla yazılır). Sessiz
            // kalmak, ölçülmemiş bir churn'ü "0 satır değişti" diye ölçülmüş
            // gibi gösterirdi; en azından eşitleme günlüğüne geçer.
            let commitDetailFailures = 0;
            let firstCommitDetailError: string | null = null;
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
                } catch (err: unknown) {
                  commitDetailFailures += 1;
                  firstCommitDetailError ??= err instanceof Error ? err.message : String(err);
                  return { summary, detail: summary as GitHubApiCommitDetail };
                }
              }));
              commitRecords.push(...detailedChunk);
            }
            if (commitDetailFailures > 0) {
              console.warn(
                `[GitHubService] '${repo.name}': ${commitDetailFailures}/${ghCommits.length} commit detayı alınamadı; ` +
                'bu commitlerin satır istatistikleri ve dosya listeleri ölçülemedi (churn katkısı 0 sayılır). ' +
                `İlk hata: ${firstCommitDetailError}`,
              );
            }

            commitRecords.forEach(({ summary, detail }) => {
              const msg = detail?.commit?.message || summary?.commit?.message || 'Depo güncellendi';
              const sha = detail?.sha || summary?.sha;
              const commitDate = detail?.commit?.author?.date || summary?.commit?.author?.date;
              if (typeof sha !== 'string' || !sha || typeof commitDate !== 'string' || Number.isNaN(new Date(commitDate).getTime())) {
                return;
              }
              // Dosya listesi ve satır istatistikleri YALNIZCA detay yanıtında
              // bulunur (liste uç noktası ne `files` ne `stats` döner); detay
              // alınamadıysa bu commit için ikisi de ölçülmemiştir. Eskiden
              // `summary.files` diye bir yedek vardı: hiçbir zaman dolmadığı
              // için, ölçülemeyen bir durumu "ölçüldü, sıfır" gibi göstermekten
              // başka bir iş yapmıyordu (bkz. yukarıdaki hata sayacı).
              const rawFiles = Array.isArray(detail?.files) ? detail.files : [];
              const normalizedFiles = rawFiles
                .filter((file: GitHubApiCommitFile) => typeof file?.filename === 'string')
                .map((file: GitHubApiCommitFile) => ({
                  filename: file.filename,
                  additions: asNonNegativeNumber(file.additions),
                  deletions: asNonNegativeNumber(file.deletions),
                }));
              // Sınır burada (kayıt oluşturulurken) uygulanır; gerekçe için bkz.
              // MAX_COMMIT_FILES: hotspot churn'ü bu listeden türetilir ve
              // snapshot'tan yüklenen commit aynı motordan geçer, bu yüzden sınır
              // yalnızca yazma anında kırpılırsa canlı ve soğuk ölçüm ayrışır.
              const files = normalizedFiles.slice(0, MAX_COMMIT_FILES);
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
                // Rapordaki gerçek dosya sayısı: `files` kırpılmış olabilir
                // (bkz. MAX_COMMIT_FILES), bu alan kırpılmamış sayıyı taşır.
                files_changed: normalizedFiles.length,
                affected_files: files.map((file) => file.filename),
                files,
                is_bug_fix: initialClassification.isBugFix,
                ai_category: initialClassification.category,
                ai_reasoning: initialClassification.reasoning,
                ai_confidence: initialClassification.confidence,
                repo_name: repo.name,
              });
            });

            // PR listesi yukarıda diğer listelerle birlikte çekildi.
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
                comments_count: asNonNegativeNumber(detail?.comments ?? summary?.comments),
                // GitHub PR list/detail uçları review event sürelerini vermez.
                // Bu nedenle yalnızca gerçek created -> closed/merged çevrimini sakla.
                cycle_time_hours: cycleTimeHours,
                repo_name: repo.name,
                is_stale: prState === 'open' && Number.isFinite(createdTime) && (Date.now() - createdTime) > STALE_PR_THRESHOLD_DAYS * MS_PER_DAY,
              });
            });

            // Issue listesi de yukarıda diğer listelerle birlikte çekildi.
            const relevantIssues = ghIssues.filter((issue: GitHubApiIssue) => {
              if (String(issue?.state || '').toLowerCase() === 'open') return true;
              const updatedTime = new Date(issue?.updated_at || issue?.created_at || '').getTime();
              return Number.isFinite(updatedTime) && updatedTime >= sinceTimestamp;
            });
            relevantIssues.forEach((i: GitHubApiIssue) => {
              if (i.pull_request) return;
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
              });
            });

            // Ek telemetri sonuçları yukarıda ana listelerle birlikte istendi;
            // burada yalnızca beklenir (ek ağ turu yok).
            const extrasResult = await extrasPromise;
            if (extrasResult.ok) {
              const [languages, latestCi, latestRelease, branchesCount] = extrasResult.extras;
              repo.languages = languages;
              repo.latest_ci_run = latestCi || undefined;
              repo.latest_release = latestRelease || undefined;
              // Ölçülemediyse (`null`) alan hiç yazılmaz: `0` ya da `1` yazmak
              // ölçülmemiş bir değeri ölçülmüş gibi gösterirdi.
              repo.branches_count = branchesCount ?? undefined;
            } else {
              console.warn(`${repo.name} için ek telemetri çekilirken uyarı:`, extrasResult.error);
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
    // Uçuştaki eşitleme/seçim değişikliği beklenirken HATA yutulur. Neden:
    // bu iki akış paylaşılan durumu yazar ve hataları `syncStatus`/`syncError`
    // alanlarına zaten işler; burada fırlatmak, çağıranın kendi seçim
    // değişikliğini hiç yürütmemesine yol açardı — kullanıcı onay kutusuna
    // tıklar, hiçbir şey olmaz ve yanıt olarak ilgisiz bir GitHub hatası
    // görürdü. Beklemenin amacı sıralamayı ve yarım durum okumayı önlemektir,
    // hatayı iletmek değil (bkz. ensureSynced/syncRepositories'teki aynı desen).
    if (this.activeSyncPromise) {
      await this.activeSyncPromise.catch(() => undefined);
    }
    if (this.activeTogglePromise) {
      await this.activeTogglePromise.catch(() => undefined);
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

  /**
   * Seçim değiştiğinde snapshot'tan gelen türev önbellekleri geçersiz kılar.
   *
   * Bu önbellekler (brifing, persona) belirli bir depo seçimine aittir ve
   * `/api/ai/brief` ile `/api/ai/developer-persona` hızlı yolları bunları
   * doğrudan servis eder (bkz. routes/ai.ts: kapsam değiştiğinde önbellek
   * burada düşürüldüğü için `isCachedFromDb` bayrağına bakan bir koşul
   * gerekmez). Seçim değiştiğinde temizlenmezlerse, artık kapsam dışı olan
   * depolara ait eski içerik yeni seçimin sonucuymuş gibi gösterilir.
   */
  private static invalidateSelectionDerivedCaches(state: GitHubStoreState): void {
    state.isCachedFromDb = false;
    this.cachedDailyBrief = null;
    this.cachedDeveloperPersona = null;
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

    // Seçim değişti: hem seçme hem bırakma yönünde türev önbellekler geçersizdir.
    this.invalidateSelectionDerivedCaches(state);

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
        // Bu yol hiç damga basmıyordu: seçim değişikliğiyle tetiklenen telemetri
        // çekimi başarısız olduğunda `syncStatus` 'error'a döner ama fren
        // penceresi dolmadığı için bir sonraki otomatik istek anında yeni bir
        // tam eşitleme başlatırdı (bkz. isWithinSyncRetryCooldown).
        state.lastSyncAttemptAt = Date.now();
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
      this.rebuildScopedTelemetryStatus(state, activeRepoNames);
      // Seçim değişikliği, paylaşılan durumun son sözüdür (uçuştaki eşitleme
      // beklenmiştir, bkz. toggleRepoSelection): `syncStatus` burada iki yönde
      // de kurulur.
      state.syncStatus = state.telemetryStatus.status === 'partial' ? 'partial' : 'ready';
      state.syncError = state.telemetryStatus.lastError;
    }

    // Seçim kalıcılaştırılır: snapshot yeniden başlatmada hem seçimi hem de o
    // seçime karşılık gelen telemetriyi taşımalı. Yazılmazsa kullanıcı bir depoyu
    // analizden çıkardıktan sonra süreç yeniden başladığında depo yeniden seçili
    // (ve telemetrisi geri gelmiş) görünürdü — sunucu, kullanıcının açıkça
    // kaldırdığı bir depoyu ölçmeye devam ederdi.
    await this.persistSnapshot();

    return this.getState().repositories;
  }

  /**
   * Bellekteki telemetriyi Firestore tekil snapshot'ına yazar.
   *
   * Snapshot gövdesinin **tek** tanımıdır: hangi alanların kalıcı olduğu yalnızca
   * burada yazılır. Aynı eşlemeyi ikinci bir çağrı yerinde kopyalamak,
   * alanlardan biri güncellendiğinde diğer kopyanın sessizce eskimesi demekti —
   * ör. commit kayıtlarındaki `files` alanı: yalnızca burada yazılır ve yükleyici
   * `affected_files`'ı ondan türetir, yani kopyalardan biri onu atlarsa soğuk
   * başlangıçta hotspot churn'ü eşit bölüştürme yedeğine düşerdi.
   *
   * Hata yutulur ama sessiz kalınmaz: yazma başarısız olursa (boyut bütçesi,
   * kimlik bilgisi, ağ) bellekteki durum doğru kalır, yalnızca soğuk başlangıç
   * hızlandırması kaybedilir. Çağıranlar akışı durdurmaz.
   */
  private static persistSnapshot(): Promise<boolean> {
    // Yazmalar tek sıraya alınır. İki türev üretim (brifing + persona) birbirine
    // çok yakın anlarda tamamlanabilir ve her ikisi de AYNI tekil dokümanı
    // yazar; sırasız iki yazmada sonuç yazmaların bitiş sırasına kalırdı ve geç
    // biten eski bir gövde, yeni persona alanını düşürüp kalıcılaştırılmış
    // snapshot'ı bayat bırakırdı (gövde, çağrı anındaki önbellek alanlarını
    // taşır). Sıra, gövdenin çağrı anında değil YAZMA anında okunmasını da
    // sağlar: kuyruktaki ikinci yazma, ilk yazmadan sonra eklenen alanları görür.
    const next = this.snapshotWriteQueue.then(
      () => this.writeSnapshot(),
      () => this.writeSnapshot(),
    );
    this.snapshotWriteQueue = next;
    return next;
  }

  private static async writeSnapshot(): Promise<boolean> {
    const state = this.getState();
    if (!state.lastSyncAt || state.repositories.length === 0) {
      // Yazacak bir ölçüm yok (henüz eşitlenmedi ya da depo listesi boş):
      // boş bir gövdeyi kalıcılaştırmak, soğuk başlangıçta "veri var" gibi
      // görünen ama hiçbir paneli beslemeyen bir kayıt bırakırdı.
      return false;
    }

    // Eşitleme sürerken yazılan bir gövde (ör. bu sırada üretilen bir brifing)
    // kısmi telemetri taşır; 'syncing' kalıcılaştırılırsa süreç yeniden
    // başladığında sonsuza dek süren bir eşitleme gibi görünürdü. 'partial'
    // bu durumun dürüst karşılığıdır ve arayüzde "kısmi" rozetiyle görünür.
    const telemetryStatus: TelemetrySyncStatus = state.telemetryStatus.status === 'syncing'
      ? { ...state.telemetryStatus, status: 'partial' }
      : state.telemetryStatus;

    try {
      const persisted = await FirestoreService.saveLatestSnapshot({
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
          // Dosya listesi satır istatistikleriyle birlikte kaydedilir:
          // hotspot churn'ü dosya bazında ekleme/silme dağılımından türetilir
          // ve yalnızca adlar kaydedilirse soğuk başlangıç, satırları dosyalara
          // eşit bölüştüren yedeğe düşer — aynı telemetri canlıda ve yeniden
          // başlatmada farklı risk seviyeleri üretirdi.
          files: c.files,
          // `affected_files`, `files` varken türevidir ve yazılmaz: aynı adları
          // iki kez yazmak dokümanı şişirirdi (yükleyici türetir, bkz. ensureSynced).
          // Ama `files` YOKKEN yazılmalıdır: bütçeye kırpılmış bir snapshot'tan
          // soğuk başlangıç yapan süreç dosya listesini yalnızca bu alanda taşır
          // (bkz. fitSnapshotToBudget) ve bu gövde yeniden kalıcılaştırıldığında
          // (ör. brifing önbelleğe alınırken, bkz. setCachedDailyBrief) liste
          // hiçbir alanda bulunmazdı — dosya eşleşmesi kaybolur, hotspot churn'ü
          // eşit bölüştürme yedeğine inerdi. Tanımsız değer hem Firestore'da
          // (ignoreUndefinedProperties) hem JSON turunda düşer.
          affected_files: c.files && c.files.length > 0 ? undefined : c.affected_files,
        })),
        pullRequests: state.pullRequests,
        issues: state.issues,
        dailyBrief: this.cachedDailyBrief || [],
        developerPersona: this.cachedDeveloperPersona || null,
        commitsCount: state.commits.length,
        pullRequestsCount: state.pullRequests.length,
        telemetryStatus,
      });

      if (!persisted) {
        console.warn(
          '⚠️ [GitHubService] Snapshot kalıcılaştırılamadı: soğuk başlangıç bu eşitlemede ' +
          'hızlandırılamaz (sonraki eşitleme yeniden dener).',
        );
      }
      return persisted;
    } catch (saveErr) {
      console.warn('Firestore snapshot kaydedilemedi:', saveErr);
      return false;
    }
  }

  /**
   * Snapshot okumasını tek uçuşa indirger (bkz. activeSnapshotLoad).
   */
  private static async loadLatestSnapshotOnce(): Promise<TelemetrySnapshot | null> {
    if (!this.activeSnapshotLoad) {
      this.activeSnapshotLoad = FirestoreService.getLatestSnapshot().finally(() => {
        this.activeSnapshotLoad = null;
      });
    }
    return this.activeSnapshotLoad;
  }

  /**
   * Snapshot'tan yüklenen telemetri durumunu doğrular.
   *
   * Kayıt bu sürecin kendi ürettiği veridir, ama okuma sırasında şekli yine de
   * doğrulanır: eksik/bozuk bir alan doğrudan duruma yazılsaydı `status`
   * tanınmayan bir değer aldığında arayüz rozeti ve sağlık motoruna geçirilen
   * `dataStatus` sessizce sapardı. Geçersizse `null` döner ve çağıran türetilmiş
   * varsayılana düşer.
   *
   * `syncing` kabul edilmez: kalıcılaşmış bir "eşitleniyor" durumu, yeniden
   * başlatmadan sonra hiç bitmeyen bir eşitleme gibi görünürdü (yazma yolu da
   * bu yüzden 'syncing' yerine 'partial' kaydeder).
   */
  private static restoreTelemetryStatus(
    raw: unknown,
    repositories: Repository[],
  ): TelemetrySyncStatus | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }
    const candidate = raw as Partial<TelemetrySyncStatus>;
    const allowedStatuses: SyncStatus[] = ['ready', 'partial', 'no_data'];
    if (typeof candidate.status !== 'string' || !allowedStatuses.includes(candidate.status as SyncStatus)) {
      return null;
    }

    const selectedCount = repositories.filter((repository) => repository.selected_for_analysis).length;
    const asCount = (value: unknown, fallback: number): number =>
      typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : fallback;
    const total = asCount(candidate.totalRepositories, selectedCount);
    const completed = Math.min(asCount(candidate.completedRepositories, total), total);
    const failedRepositoryNames = Array.isArray(candidate.failedRepositoryNames)
      ? candidate.failedRepositoryNames.filter((name): name is string => typeof name === 'string')
      : [];

    return this.createTelemetryStatus(
      candidate.status as SyncStatus,
      total,
      completed,
      failedRepositoryNames,
      typeof candidate.lastError === 'string' && candidate.lastError ? candidate.lastError : undefined,
    );
  }

  /**
   * Son eşitleme denemesinden bu yana yeniden deneme freni dolmadı mı?
   *
   * Yalnızca **otomatik** denemeleri (istek üzerine tetiklenenler) bağlar;
   * kullanıcı kaynaklı "Yenile" her zaman denenir (bkz. SYNC_RETRY_COOLDOWN_MS).
   */
  private static isWithinSyncRetryCooldown(state: GitHubStoreState): boolean {
    const attemptedAt = state.lastSyncAttemptAt;
    return typeof attemptedAt === 'number'
      && Number.isFinite(attemptedAt)
      && Date.now() - attemptedAt < this.SYNC_RETRY_COOLDOWN_MS;
  }

  /**
   * Hata durumunda arka planda bir eşitleme denemesi başlatır (fren içinde).
   *
   * `waitForSync: false` okuyan uçlar uçuştaki eşitlemeyi beklemez ve telemetri
   * yüklüyse `ensureSynced()`i hiç çağırmaz. Ama hata durumunda hiç denemezlerse
   * panel, kullanıcı "Yenile"ye basana kadar kalıcı hatalı kalırdı: okuma
   * uçlarının tamamı eskiden `ensureSynced()` üzerinden geçtiği için bu
   * kendiliğinden iyileşme vardı ve hızlı okuma yolunun eklenmesiyle kayboldu.
   *
   * Deneme BEKLENMEZ: istek ölçülmüş veriyle hemen yanıtlanır (bkz. syncGuard ->
   * hasUsableTelemetry). Fren (`SYNC_RETRY_COOLDOWN_MS`) istek başına bir denemeyi
   * engellediği ve `ensureSynced` uçuştaki bir eşitlemeyi paylaştığı için bu
   * çağrı ne kotayı ne de isteği yakar.
   */
  private static retrySyncInBackgroundIfFailed(state: GitHubStoreState): void {
    if (state.syncStatus !== 'error') return;
    void this.ensureSynced().catch(() => undefined);
  }

  public static async ensureSynced(force = false): Promise<GitHubStoreState> {
    await ensureRuntimeConfig();
    const state = this.getState();

    if (this.activeSyncPromise) {
      // Uçuştaki eşitlemenin hatası bu isteği düşürmez. Hata `syncStatus` ve
      // `syncError`'a zaten yazılmıştır; okuma uçları onu kendi JSON
      // sözleşmesiyle (502 + hata mesajı) raporlar. Hatayı burada yeniden
      // fırlatmak, rotanın beklediği gövdeyi kaybettirir ve istemciye JSON
      // yerine sunucunun varsayılan hata sayfasını döndürürdü.
      await this.activeSyncPromise.catch(() => undefined);
      return this.getState();
    }

    // Seçim değişikliğinin kendi telemetri çekimi de paylaşılan durumu yazar
    // (bkz. toggleRepoSelection). Beklenmezse iki sorun doğar: (1) okuma uçları
    // yarım güncellenmiş bir durumu ölçer, (2) `syncStatus` 'syncing' olduğu
    // için aşağıdaki hızlı yol atlanır ve tam bir eşitleme başlatılır —
    // `activeSyncPromise` yalnızca eşitlemeleri kapsadığı için seçim akışıyla
    // aynı anda çalışan ikinci bir tam eşitleme demektir (çift kota, son yazan
    // kazanır).
    if (this.activeTogglePromise) {
      await this.activeTogglePromise.catch(() => undefined);
      return this.getState();
    }

    if (!force && (state.syncStatus === 'ready' || state.syncStatus === 'partial')) {
      return state;
    }

    // Yeniden deneme freni: hata durumunda her istek yeni bir tam eşitleme
    // başlatmasın (bkz. SYNC_RETRY_COOLDOWN_MS). `force` bu freni atlar.
    if (!force && state.syncStatus === 'error' && this.isWithinSyncRetryCooldown(state)) {
      return state;
    }

    // 1. ADIM: Zorunlu yenileme değilse ve bellekte veri yoksa önce Firestore Snapshot'ı oku (Instant Cold-Start)
    if (!force && !state.lastSyncAt) {
      try {
        const snapshot = await this.loadLatestSnapshotOnce();
        if (snapshot && Array.isArray(snapshot.repositories) && snapshot.repositories.length > 0) {
          state.user = snapshot.user || state.user;
          state.repositories = snapshot.repositories;
          // `affected_files`, kaydedilen `files` listesinden türetilir (snapshot
          // bu alanı taşımaz; aynı adları iki kez yazmamak için). Türetme burada
          // yapılır ki alanı okuyan tüketiciler — hotspot motorunun yedek yolu ve
          // kanıt toplama — soğuk başlangıçta da aynı listeyi görsün. `files`
          // alanı olmayan eski kayıtlarda kayıtlı değer (varsa) korunur.
          // Ad çıkarımı tek kaynaktan gelir (bkz. commitFileNames): aynı kural
          // burada ve snapshot kırpma/yazma yollarında ayrı yazılsaydı, bir
          // okuyucu `path` alanlı eski kayıtta adı korurken diğeri kaybederdi.
          state.commits = (snapshot.commits || []).map((commit) => {
            const names = commitFileNames(commit);
            return { ...commit, affected_files: names.length > 0 ? names : commit.affected_files };
          });
          state.pullRequests = snapshot.pullRequests || [];
          state.issues = snapshot.issues || [];
          state.lastSyncAt = snapshot.lastSyncAt;
          state.isCachedFromDb = true;
          // Telemetri durumu kaydedilmişse o kullanılır: kısmi bir eşitleme
          // yeniden başlatmadan sonra "tamamlandı" gibi görünmemelidir (bkz.
          // restoreTelemetryStatus). Kayıt yoksa (eski şemayla yazılmış
          // snapshot) kapsamdan türetilir; toplam, **seçili** depoların sayısıdır
          // — canlı eşitleme de bu sayıyı raporlar, tüm depoların sayısını değil.
          const selectedCount = state.repositories.filter((repository) => repository.selected_for_analysis).length;
          state.telemetryStatus = this.restoreTelemetryStatus(snapshot.telemetryStatus, state.repositories)
            ?? this.createTelemetryStatus('ready', selectedCount, selectedCount);
          state.syncStatus = state.telemetryStatus.status === 'partial' ? 'partial' : 'ready';
          state.syncError = state.telemetryStatus.lastError;

          if (snapshot.dailyBrief) this.cachedDailyBrief = snapshot.dailyBrief;
          if (snapshot.developerPersona) this.cachedDeveloperPersona = snapshot.developerPersona;

          console.log(`⚡ [GitHubService] Firestore'dan kayıtlı snapshot yüklendi! (${snapshot.repositories.length} repo, Son Eşitleme: ${snapshot.lastSyncAt})`);

          // Kayıtlı snapshot eski bir türev sözleşmesiyle yazıldıysa (bkz.
          // FirestoreService.SNAPSHOT_SCHEMA_VERSION) türev çıktılar zaten
          // okuma sırasında düşürülmüştür; yani bayat çıktı servis edilmez ve
          // eksik kalanlar istek üzerine yerel olarak yeniden üretilir.
          //
          // Burada arka planda bir eşitleme BAŞLATILMAZ: eşitleme
          // `connectWithToken` üzerinden `syncStatus`'u kalıcı olarak 'error'a
          // çevirebilir; bu durumda tüm uç noktalar 502 döner ve `ensureSynced`
          // hızlı yolları atlayıp her istekte yeniden tam eşitleme dener (GitHub
          // kota yakımı + her Cloud Run örneğinde ayrı deneme). Snapshot'ın
          // kendisi bir sonraki kullanıcı eşitlemesinde yeni sürümle yazılır.
          return state;
        }
      } catch (cacheErr) {
        console.warn('Firestore snapshot okuma uyarısı:', cacheErr);
      }
    }

    const token = getGitHubToken() || state.token || process.env.GITHUB_TOKEN;
    if (token) {
      return this.syncRepositories();
    }

    state.syncStatus = 'no_data';
    state.telemetryStatus = this.createTelemetryStatus('no_data');
    return state;
  }

  public static async syncRepositories(force = false): Promise<GitHubStoreState> {
    // Değişebilir meta veri önbellekleri HER tam eşitlemede düşürülür — yalnızca
    // kullanıcı kaynaklı yenilemede (`force`) değil. Eşitleme depoları, commit/PR/
    // issue listelerini ve `lastSyncAt`'i tazelerken dil/CI/sürüm/dal değerlerini
    // eski önbellekten alsaydı, aynı depo kartı iki farklı dönemin verisini
    // birlikte gösterir ve taze telemetri gibi okunurdu (bkz.
    // invalidateMutableCaches). `commitDetailCache` korunur: bir commit SHA'sının
    // içeriği değişmez.
    //
    // Düşürme, uçuştaki eşitleme erken dönüşünden ÖNCE yapılır: aksi halde
    // kullanıcı arka plan eşitlemesi sürerken "Yenile"ye bastığında düşürme
    // atlanır ve uçuştaki eşitleme bayat dil/CI/sürüm/dal değerlerini taze
    // telemetri olarak yazar. Uçuş zaten taze veri çektiği için ikinci bir ağ
    // turu başlatılmaz.
    this.invalidateMutableCaches();
    if (this.activeSyncPromise) {
      return this.activeSyncPromise;
    }
    // Seçim değişikliği kendi telemetri çekimini yürütüyor olabilir (bkz.
    // toggleRepoSelection). Beklenmezse iki akış aynı anda `state.repositories`
    // üzerine yazar: eşitleme, başlangıcında aldığı seçim haritasıyla depo
    // listesini yeniden kurar ve arada yapılan seçim değişikliğini ezebilir.
    if (this.activeTogglePromise) {
      await this.activeTogglePromise.catch(() => undefined);
      return this.getState();
    }
    await ensureRuntimeConfig();
    const state = this.getState();
    const token = getGitHubToken() || state.token || process.env.GITHUB_TOKEN;
    if (token) {
      return this.connectWithToken(token);
    }
    state.syncStatus = 'no_data';
    state.syncError = undefined;
    state.telemetryStatus = this.createTelemetryStatus('no_data');
    return state;
  }

  /**
   * Analiz bağlamının hangi durum için hesaplandığını tanımlayan ucuz imza.
   * Depo seçimi, eşitleme veya veri hacmi değiştiğinde önbellek kendiliğinden geçersizleşir.
   *
   * İmza **seçili** depoların adlarını taşır. Yalnızca seçili sayısını (ve tüm
   * depolar üzerinden bir sağlama toplamını) taşımak yetmezdi: bir depoyu
   * bırakıp aynı sayıda başka bir depoyu seçmek imzayı değiştirmez ve
   * önbellekteki bağlam, yanlış depo kümesi için (TTL boyunca) servis edilirdi.
   * Adlar sıralanır, çünkü seçim sırası türev çıktıları etkilemez; aynı küme
   * her zaman aynı imzayı üretmelidir.
   */
  private static telemetryContextSignature(state: GitHubStoreState): string {
    const selectedRepoNames = state.repositories
      .filter((repository) => repository.selected_for_analysis)
      .map((repository) => repository.name)
      .sort();
    return [
      String(state.user?.login || '').toLowerCase(),
      state.repositories.length,
      selectedRepoNames.length,
      selectedRepoNames.join(','),
      state.commits.length,
      state.pullRequests.length,
      state.issues.length,
      state.lastSyncAt,
      state.telemetryStatus.status,
      state.syncStatus,
    ].join('|');
  }

  /**
   * Şu andaki telemetri imzası (bkz. telemetryContextSignature); durum henüz
   * yüklenmediyse `null`.
   *
   * Uzun süren türev üretimlerin (brifing/persona) "hangi telemetri için
   * üretildi" kontrolü için açılır: üretim sırasında telemetri değiştiyse çıktı
   * artık servis edilen ölçüme ait değildir ve önbelleğe alınmamalıdır.
   */
  public static getTelemetrySignature(): string | null {
    return this.state ? this.telemetryContextSignature(this.state) : null;
  }

  /**
   * DRY Yardımcısı: Analiz için seçilmiş depoları, filtrelenmiş commit, PR ve issue'ları,
   * hesaplanmış hotspot, risk ve sağlık skorlarını tek merkezden döner.
   *
   * Sonuç kısa bir TTL boyunca önbelleklenir: tek bir panel yüklemesi sağlık,
   * hotspot, risk ve bülten uç noktalarını paralel çağırdığından üç metrik motoru
   * istek başına değil, pencere başına bir kez çalışır.
   */
  public static async getActiveTelemetryContext(options: { waitForSync?: boolean } = {}): Promise<ActiveTelemetryContext> {
    // `waitForSync: false` — **yüklü telemetri varken** uçuştaki bir eşitleme
    // beklenmez. Yapay zeka okuma uçları bunu kullanır: kullanıcı "Yenile"ye
    // bastıktan sonra süren eşitleme dakikalar alabildiği için, beklemek hem
    // istemci zaman aşımına uğrayıp üretilen (faturalanan) yanıtı çöpe atar hem
    // de paneli kilitler. Telemetri henüz yoksa (`lastSyncAt` boş — ör. soğuk
    // başlangıçta eşitleme sürüyor) bekleme zorunludur; aksi halde model veri
    // gelmek üzereyken "veri yok" sonucu üretirdi. İnceleme/refactor uçları
    // beklemeye devam eder: hedef depo ancak eşitleme sonrası kapsamda olabilir.
    const loadedState = this.getState();
    // Yüklü telemetriyle hemen yanıt verilen yol: hata durumunda kendiliğinden
    // iyileşme burada tetiklenir, çünkü `ensureSynced()` çağrılmaz.
    const servesLoadedState = options.waitForSync === false && Boolean(loadedState.lastSyncAt);
    const state = servesLoadedState
      ? loadedState
      : await this.ensureSynced();
    if (servesLoadedState) {
      this.retrySyncInBackgroundIfFailed(state);
    }
    const signature = this.telemetryContextSignature(state);
    const now = Date.now();

    if (
      this.telemetryContextCache &&
      this.telemetryContextCache.signature === signature &&
      now - this.telemetryContextComputedAt < this.TELEMETRY_CONTEXT_TTL_MS
    ) {
      return this.telemetryContextCache.context;
    }

    const activeRepos = state.repositories.filter((r) => r.selected_for_analysis);
    const activeRepoNames = new Set(activeRepos.map((r) => r.name));
    const commits = state.commits.filter((c) => activeRepoNames.has(c.repo_name));
    const pullRequests = state.pullRequests.filter((p) => activeRepoNames.has(p.repo_name));
    const issues = state.issues.filter((i) => activeRepoNames.has(i.repo_name));

    // Kural motoru çıktıları her bağlam için yeniden hesaplanır (önbelleğe
    // alınmış bir kopya okunmaz): girdiler yüklü commit/PR/issue listeleridir,
    // yani ölçüm her zaman mevcut telemetriye aittir. Sağlık skoru commit
    // penceresi boş olsa bile PR/issue verisiyle ölçülür (hasData ölçütü üç
    // kaynağın herhangi biridir; bkz. HealthEngine).
    const hotspots = HotspotEngine.analyzeHotspots(commits);
    const risks = RiskEngine.analyzeRisks(activeRepos, commits, pullRequests, issues, hotspots);
    const health = HealthEngine.calculateHealth(
      activeRepos,
      commits,
      pullRequests,
      issues,
      state.telemetryStatus.status === 'partial' ? 'partial' : undefined,
    );

    const context: ActiveTelemetryContext = {
      state,
      activeRepos,
      commits,
      pullRequests,
      issues,
      hotspots,
      risks,
      health,
    };

    this.telemetryContextCache = { signature, context };
    this.telemetryContextComputedAt = now;
    return context;
  }
}
