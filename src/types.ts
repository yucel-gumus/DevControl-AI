export interface GitHubUser {
  id: string;
  login: string;
  name: string;
  avatar_url: string;
  html_url: string;
  bio?: string;
  public_repos: number;
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
  open_issues_count: number;
  updated_at: string;
  pushed_at: string;
  selected_for_analysis: boolean;
  health_score?: number;
  risk_level?: 'HEALTHY' | 'NEEDS_ATTENTION' | 'AT_RISK' | 'CRITICAL';
}

export interface CommitMetric {
  id?: string;
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
  changed_files: number;
  comments_count?: number;
  review_comments_count?: number;
  review_time_hours?: number;
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
  is_bug?: boolean;
  resolution_time_hours?: number;
}

export interface FileHotspot {
  path: string;
  repo_name: string;
  language: string;
  modifications_count: number;
  commits_count: number;
  contributors_count: number;
  lines_added: number;
  lines_deleted: number;
  code_churn: number;
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
}

export interface RepositoriesResponse {
  repositories: Repository[];
  lastSyncAt: string | null;
  syncStatus: SyncStatus;
  syncError?: string;
  telemetryStatus: TelemetrySyncStatus;
  rateLimitStatus?: RateLimitStatus;
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
    weeklyCommitFrequency: number;
    dominantWorkingHours: string;
    bugFixEfficiency: string;
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
  category: 'CODE_HOTSPOT' | 'DELIVERY_BOTTLENECK' | 'TECHNICAL_DEBT' | 'DOCUMENTATION_GAP' | 'MAINTENANCE_STALENESS' | 'QUALITY_REGRESSION';
  affectedRepository: string;
  repo_name?: string;
  affectedFiles?: string[];
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

export interface AIInsight {
  id: string;
  title: string;
  summary: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW' | 'OPPORTUNITY';
  category: 'ARCHITECTURE' | 'PRODUCTIVITY' | 'HOTSPOT' | 'PROCESS' | 'SKILLS';
  targetRepo?: string;
  facts: string[];
  aiInterpretation: string;
  confidence: number;
  evidence: {
    metric: string;
    value: string | number;
    source: string;
  }[];
  recommendedAction: string;
  createdAt: string;
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

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  outputSchema: Record<string, any>;
}

export interface AnalysisSnapshot {
  id: string;
  name: string;
  timestamp: string;
  repositoriesCount: number;
  healthScore: number;
  risksCount: number;
  hotspotsCount: number;
  commitsAnalyzed: number;
}
