export interface GitHubUser {
  id: string;
  login: string;
  name: string;
  avatar_url: string;
  html_url: string;
  bio?: string;
  public_repos: number;
}

export interface RepositoryCiRun {
  name: string;
  status: string;
  conclusion?: string;
  html_url?: string;
  updated_at?: string;
}

export interface RepositoryRelease {
  tag_name: string;
  name?: string;
  published_at: string;
  html_url?: string;
}

export interface Repository {
  id: string;
  name: string;
  full_name: string;
  html_url?: string;
  description: string;
  language: string;
  is_private: boolean;
  default_branch: string;
  stargazers_count: number;
  forks_count: number;
  updated_at: string;
  pushed_at: string;
  selected_for_analysis: boolean;
  risk_level?: 'HEALTHY' | 'NEEDS_ATTENTION' | 'AT_RISK' | 'CRITICAL';
  languages?: Record<string, number>;
  latest_ci_run?: RepositoryCiRun;
  latest_release?: RepositoryRelease;
  branches_count?: number;
}

export type CommitCategory =
  | 'BUG_FIX'
  | 'FEATURE'
  | 'REFACTOR'
  | 'PERFORMANCE'
  | 'SECURITY'
  | 'DOCUMENTATION'
  | 'CHORE';

export interface CommitSemanticAnalysis {
  sha: string;
  isBugFix: boolean;
  category: CommitCategory;
  reasoning?: string;
  confidence?: number;
}

export interface CommitMetric {
  sha: string;
  message: string;
  author: string;
  author_name?: string;
  author_avatar?: string;
  date: string;
  additions: number;
  deletions: number;
  total_changes: number;
  files_changed: number;
  is_bug_fix: boolean;
  ai_category?: CommitCategory;
  ai_reasoning?: string;
  ai_confidence?: number;
  repo_name: string;
  affected_files?: string[];
  files?: { filename?: string; path?: string; additions?: number; deletions?: number }[];
}

export interface PullRequestMetric {
  id: number | string;
  number: number;
  title: string;
  state: 'open' | 'closed' | 'merged';
  author: string;
  created_at: string;
  updated_at?: string;
  closed_at?: string;
  merged_at?: string;
  additions: number;
  deletions: number;
  comments_count?: number;
  cycle_time_hours?: number;
  repo_name: string;
  is_stale?: boolean;
}

export interface IssueMetric {
  id: number | string;
  number: number;
  title: string;
  state: 'open' | 'closed';
  author: string;
  created_at: string;
  closed_at?: string;
  comments_count?: number;
  labels: string[];
  repo_name: string;
  is_stale?: boolean;
}

export interface FileHotspot {
  path: string;
  repo_name: string;
  language: string;
  modifications_count: number;
  contributors_count: number;
  code_churn: number;
  avg_churn_per_commit?: number;
  bug_fix_commits_count: number;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  confidence: number;
  last_modified: string;
  evidence: {
    metric: string;
    value: string | number;
    description: string;
  }[];
  recommendation: string;
}

export interface HealthScoreDimensions {
  codeHealth: number;
  delivery: number;
  documentation: number;
  maintenance: number;
  collaboration: number;
  activity: number;
}

export interface HealthScoreWeights {
  codeHealth: number;
  delivery: number;
  documentation: number;
  maintenance: number;
  collaboration: number;
  activity: number;
}

export interface EngineeringHealthScore {
  overallScore: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F' | 'NO_DATA';
  hasData: boolean;
  dataStatus: 'ready' | 'partial' | 'no_data';
  dimensions: HealthScoreDimensions;
  /**
   * Motorun GERÇEKTEN hesapladığı boyutlar.
   *
   * `dimensions` sözlüğü her boyutun alanını taşır ama ölçülmemiş bir boyutun
   * değeri de `0`'dır — sözlüğe bakan bir tüketici "ölçüldü, sıfır çıktı" ile
   * "hiç ölçülmedi" durumunu ayırt edemez ve ölçülmemiş bir boyutu "0/100"
   * diye gösterir. Bu alan ayrımı taşıyan tek kaynaktır: hangi boyutun
   * ölçüldüğü kararı motorda tek yerde verilir (bkz.
   * server/metrics/healthEngine.ts -> dimensionMeasured) ve ağırlıklı
   * ortalama, notlar ile arayüz aynı kümeyi okur.
   */
  measuredDimensions: (keyof HealthScoreDimensions)[];
  weights: HealthScoreWeights;
  calculatedAt: string;
  breakdownNotes: {
    dimension: keyof HealthScoreDimensions;
    score: number;
    finding: string;
    status: 'good' | 'warning' | 'critical';
  }[];
}

export type SyncStatus = 'idle' | 'syncing' | 'ready' | 'partial' | 'error' | 'no_data';

export interface TelemetrySyncStatus {
  status: SyncStatus;
  windowDays: number;
  totalRepositories: number;
  completedRepositories: number;
  failedRepositories: number;
  failedRepositoryNames: string[];
  lastError?: string;
}

export interface RateLimitStatus {
  limit: number;
  remaining: number;
  reset: number;
  used: number;
  updatedAt: string;
}

export interface AuthStatusResponse {
  authenticated: boolean;
  user: GitHubUser | null;
  lastSyncAt: string | null;
  syncStatus: SyncStatus;
  syncError?: string;
  telemetryStatus: TelemetrySyncStatus;
  rateLimitStatus?: RateLimitStatus;
  isCachedFromDb?: boolean;
}

export interface RepositoriesResponse {
  repositories: Repository[];
  lastSyncAt: string | null;
  syncStatus: SyncStatus;
  syncError?: string;
  telemetryStatus: TelemetrySyncStatus;
  rateLimitStatus?: RateLimitStatus;
  isCachedFromDb?: boolean;
}

/** /api/metrics/activity — günlük aktivite telemetrisi (yalnızca seçili depolar). */
export interface ActivityTimeSeriesPoint {
  date: string; // YYYY-MM-DD (UTC)
  commits: number;
  bugFixes: number;
}

export interface ActivityData {
  timeSeries: ActivityTimeSeriesPoint[];
}

export interface RepoAiReview {
  repoName: string;
  architectureOverview: string;
  codeQualityScore: number; // 0-100
  strengths: string[];
  technicalDebts: string[];
  securityObservations: string[];
  recommendedRoadmap: { title: string; description: string; priority: 'HIGH' | 'MEDIUM' | 'LOW' }[];
  reviewedAt: string;
}

export interface DeveloperPersona {
  personaTitle: string;
  summary: string;
  primaryLanguages: { name: string; percentage: number }[];
  productivityMetrics: {
    /**
     * Son `ACTIVITY_WINDOW_DAYS` günde ölçülen commit sayısı (pencerenin tek
     * kaynağı server/constants.ts'tir; bu alan onunla aynı pencereyi anlatır).
     */
    weeklyCommitFrequency: number;
    /** Commit zaman damgalarından türetilen en yoğun çalışma penceresi. */
    dominantWorkingHours: string;
    /** Sınıflandırılmış commit oranı; ölçülemiyorsa bunu açıkça belirtir. */
    conventionalCommitHygiene: string;
  };
  superpowers: string[];
  growthAreas: string[];
  analyzedAt: string;
}

export interface HotspotRefactorRecommendation {
  filePath: string;
  repoName: string;
  antiPatternsDetected: string[];
  proposedDesignPattern: string;
  refactorSteps: string[];
  sampleCodeSnippet?: string;
  expectedImpact: string;
}

export interface EngineeringRisk {
  id: string;
  title: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  category: 'CODE_HOTSPOT' | 'DELIVERY_BOTTLENECK' | 'TECHNICAL_DEBT' | 'DOCUMENTATION_GAP' | 'MAINTENANCE_STALENESS' | 'QUALITY_REGRESSION' | 'CI_FAILURE';
  affectedRepository: string;
  repo_name?: string;
  /**
   * Riskin ölçüm kapsamı. `'portfolio'` → risk tüm analiz kapsamı (seçili
   * depoların toplamı) üzerinden ölçülür ve TEK bir depoya atfedilemez; bu
   * durumda `affectedRepository` ve `repo_name` boştur. Alanın bulunmaması
   * `'repository'` anlamına gelir (depoya bağlı riskler için alan yazılmaz).
   */
  scope?: 'repository' | 'portfolio';
  summary: string;
  evidence: {
    metric: string;
    value: string | number;
    baseline?: string | number;
    description: string;
  }[];
  confidence: number;
  recommendedAction: string;
  firstDetected: string;
  status: 'OPEN' | 'INVESTIGATING' | 'RESOLVED';
}


export interface TodayBriefItem {
  id: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW' | 'OPPORTUNITY';
  title: string;
  description: string;
  relatedRepo: string;
  actionable: boolean;
  evidenceSummary: string;
}

export interface AnalysisTraceStep {
  step: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  details?: string;
  durationMs?: number;
  /**
   * Adımın yürüttüğü araç (varsa).
   *
   * `step` kullanıcıya gösterilen cümledir ve serbestçe değişebilir; arayüzün
   * "hangi araç ne durumda" eşlemesini metne göre yapması, cümle değiştiğinde
   * sessizce bozulur ve başarısız bir çağrı "tamamlandı" diye görünürdü. Bu
   * yüzden araç bağı ayrı ve makine tarafından okunur bir alandır.
   */
  tool?: string;
}

export interface AnalysisTrace {
  id: string;
  query?: string;
  timestamp: string;
  steps: AnalysisTraceStep[];
  toolsUsed: string[];
  dataPointsAnalyzed: number;
  durationSeconds: number;
  completed: boolean;
}

export interface AskAiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  trace?: AnalysisTrace;
  evidence?: {
    metric: string;
    value: string | number;
    source: string;
  }[];
  facts?: string[];
  interpretation?: string;
  recommendedActions?: string[];
}


