import { Repository, CommitMetric, PullRequestMetric, IssueMetric, FileHotspot, EngineeringRisk, EngineeringHealthScore } from '../src/types.js';
import { HealthEngine } from './metrics/healthEngine.js';
import { HotspotEngine } from './metrics/hotspotEngine.js';
import { RiskEngine } from './metrics/riskEngine.js';
import { TELEMETRY_WINDOW_DAYS } from './constants.js';

export interface ToolExecutionContext {
  repositories: Repository[];
  commits: CommitMetric[];
  pullRequests: PullRequestMetric[];
  issues: IssueMetric[];
  hotspots?: FileHotspot[];
  risks?: EngineeringRisk[];
  healthScore?: EngineeringHealthScore;
}

export interface RegisteredTool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  outputSchema: Record<string, any>;
  execute: (args: Record<string, any>, context: ToolExecutionContext) => Promise<any> | any;
}

export class ToolRegistry {
  private static tools: Map<string, RegisteredTool> = new Map();

  public static initialize(): void {
    if (this.tools.size > 0) return;

    this.registerTool({
      name: 'search_repositories',
      description: 'İzlenen depoları anahtar kelimeye veya programlama diline göre arar.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Arama terimi veya dil filtresi' },
        },
      },
      outputSchema: {
        type: 'array',
        items: { type: 'object' },
      },
      execute: (args, ctx) => {
        const query = (args.query || '').toLowerCase();
        return ctx.repositories.filter(
          (r) =>
            r.name.toLowerCase().includes(query) ||
            r.language.toLowerCase().includes(query) ||
            (r.description && r.description.toLowerCase().includes(query))
        );
      },
    });

    this.registerTool({
      name: 'get_repository',
      description: 'Belirli bir depo için derinlemesine ayrıntıları ve mimari özeti getirir.',
      inputSchema: {
        type: 'object',
        properties: {
          repo_name: { type: 'string', description: 'Depo adı, örn: Firecrawl_MCP-Gemini-LangGraph' },
        },
        required: ['repo_name'],
      },
      outputSchema: { type: 'object' },
      execute: (args, ctx) => {
        const repo = ctx.repositories.find(
          (r) => r.name.toLowerCase() === (args.repo_name || '').toLowerCase()
        );
        if (!repo) {
          return { error: `'${args.repo_name}' deposu yetkili veri kümesinde bulunamadı.` };
        }
        const repoCommits = ctx.commits.filter((c) => c.repo_name === repo.name);
        const repoPRs = ctx.pullRequests.filter((p) => p.repo_name === repo.name);
        const repoIssues = ctx.issues.filter((i) => i.repo_name === repo.name);
        return {
          repository: repo,
          metrics: {
            commitsCount: repoCommits.length,
            openPRs: repoPRs.filter((p) => p.state === 'open').length,
            mergedPRs: repoPRs.filter((p) => p.state === 'merged').length,
            openIssues: repoIssues.filter((i) => i.state === 'open').length,
            bugFixCommits: repoCommits.filter((c) => c.is_bug_fix).length,
          },
        };
      },
    });

    this.registerTool({
      name: 'list_commits',
      description: 'Depo adı, yazar veya hata düzeltme durumuna göre filtrelenmiş yakın tarihli commit kayıtlarını listeler.',
      inputSchema: {
        type: 'object',
        properties: {
          repo_name: { type: 'string', description: 'Depo adına göre filtre' },
          is_bug_fix: { type: 'boolean', description: 'Yalnızca hata düzeltme commitlerini filtrele' },
          limit: { type: 'number', description: 'Döndürülecek maksimum commit sayısı (varsayılan 20)' },
        },
      },
      outputSchema: { type: 'array' },
      execute: (args, ctx) => {
        let results = ctx.commits;
        if (args.repo_name) {
          results = results.filter((c) => c.repo_name.toLowerCase() === args.repo_name.toLowerCase());
        }
        if (args.is_bug_fix !== undefined) {
          results = results.filter((c) => c.is_bug_fix === args.is_bug_fix);
        }
        const requestedLimit = Number(args.limit);
        const limit = Number.isFinite(requestedLimit) ? Math.max(0, Math.min(100, requestedLimit)) : 20;
        return results.slice(0, limit);
      },
    });

    this.registerTool({
      name: 'list_pull_requests',
      description: 'Durgun durum, durum veya depoya göre filtrelenmiş çekme isteklerini (PR) listeler.',
      inputSchema: {
        type: 'object',
        properties: {
          repo_name: { type: 'string', description: 'Depo adına göre filtre' },
          state: { type: 'string', enum: ['open', 'closed', 'merged', 'all'] },
          is_stale_only: { type: 'boolean', description: 'Yalnızca 7 günden uzun süredir açık olan durgun PR\'ları göster' },
        },
      },
      outputSchema: { type: 'array' },
      execute: (args, ctx) => {
        let prs = ctx.pullRequests;
        if (args.repo_name) {
          prs = prs.filter((p) => p.repo_name.toLowerCase() === args.repo_name.toLowerCase());
        }
        if (args.state && args.state !== 'all') {
          prs = prs.filter((p) => p.state === args.state);
        }
        if (args.is_stale_only) {
          prs = prs.filter((p) => p.state === 'open' && p.is_stale);
        }
        return prs;
      },
    });

    this.registerTool({
      name: 'list_issues',
      description: 'Etiket veya duruma göre filtrelenmiş depo sorunlarını (issue) listeler.',
      inputSchema: {
        type: 'object',
        properties: {
          repo_name: { type: 'string', description: 'Depo adına göre filtre' },
          label: { type: 'string', description: 'Etikete göre filtre, örn: security, bug, documentation' },
        },
      },
      outputSchema: { type: 'array' },
      execute: (args, ctx) => {
        let issues = ctx.issues;
        if (args.repo_name) {
          issues = issues.filter((i) => i.repo_name.toLowerCase() === args.repo_name.toLowerCase());
        }
        if (args.label) {
          const label = String(args.label).toLowerCase();
          issues = issues.filter((i) => i.labels.some((issueLabel) => issueLabel.toLowerCase() === label));
        }
        return issues;
      },
    });

    this.registerTool({
      name: 'get_hotspots',
      description: 'Kod dalgalanması, değişiklik hızı ve risk derecelerine sahip kod sıcak noktalarını (hotspot) getirir.',
      inputSchema: {
        type: 'object',
        properties: {
          repo_name: { type: 'string', description: 'İsteğe bağlı depo adı filtresi' },
          min_risk: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] },
        },
      },
      outputSchema: { type: 'array' },
      execute: (args, ctx) => {
        let spots = ctx.hotspots || HotspotEngine.analyzeHotspots(ctx.commits);
        if (args.repo_name) {
          spots = spots.filter((h) => h.repo_name.toLowerCase() === args.repo_name.toLowerCase());
        }
        if (args.min_risk) {
          const riskWeight: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
          const minVal = riskWeight[args.min_risk] || 1;
          spots = spots.filter((h) => (riskWeight[h.risk_level] || 1) >= minVal);
        }
        return spots;
      },
    });

    this.registerTool({
      name: 'get_engineering_risks',
      description: 'Destekleyici ölçülen kanıtlar ve güven puanlarıyla tespit edilen mühendislik risklerini getirir.',
      inputSchema: {
        type: 'object',
        properties: {
          repo_name: { type: 'string', description: 'Riskleri depoya göre filtrele' },
          severity: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] },
        },
      },
      outputSchema: { type: 'array' },
      execute: (args, ctx) => {
        const spots = ctx.hotspots || HotspotEngine.analyzeHotspots(ctx.commits);
        let risks = ctx.risks || RiskEngine.analyzeRisks(ctx.repositories, ctx.commits, ctx.pullRequests, ctx.issues, spots);
        if (args.repo_name) {
          risks = risks.filter((r) => r.affectedRepository.toLowerCase() === args.repo_name.toLowerCase());
        }
        if (args.severity) {
          risks = risks.filter((r) => r.severity === args.severity);
        }
        return risks;
      },
    });

    this.registerTool({
      name: 'get_health_breakdown',
      description: 'Ağırlıklarla birlikte deterministik 6 boyutlu mühendislik sağlık skoru dökümünü getirir.',
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
      execute: (_args, ctx) => {
        return ctx.healthScore || HealthEngine.calculateHealth(ctx.repositories, ctx.commits, ctx.pullRequests, ctx.issues);
      },
    });

    this.registerTool({
      name: 'get_health_score',
      description: 'Genel sağlık puanını (0-100) ve derece harfini getirir.',
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
      execute: (_args, ctx) => {
        const h = ctx.healthScore || HealthEngine.calculateHealth(ctx.repositories, ctx.commits, ctx.pullRequests, ctx.issues);
        return {
          overallScore: h.overallScore,
          grade: h.grade,
          hasData: h.hasData,
          dataStatus: h.dataStatus,
          dimensions: h.dimensions,
        };
      },
    });

    this.registerTool({
      name: 'get_commit',
      description: 'SHA veya ID ile tek bir commit kaydının ayrıntılarını getirir.',
      inputSchema: {
        type: 'object',
        properties: { sha: { type: 'string', description: 'Commit SHA kodu' } },
        required: ['sha'],
      },
      outputSchema: { type: 'object' },
      execute: (args, ctx) => {
        const c = ctx.commits.find((item) => item.sha.startsWith(args.sha) || item.id === args.sha);
        return c || { error: `${args.sha} commit kaydı bulunamadı.` };
      },
    });

    this.registerTool({
      name: 'get_pull_request',
      description: 'Numara ve depoya göre çekme isteği ayrıntılarını ve döngü süresi metriklerini getirir.',
      inputSchema: {
        type: 'object',
        properties: {
          repo_name: { type: 'string' },
          number: { type: 'number' },
        },
        required: ['repo_name', 'number'],
      },
      outputSchema: { type: 'object' },
      execute: (args, ctx) => {
        const pr = ctx.pullRequests.find(
          (p) => p.repo_name.toLowerCase() === args.repo_name.toLowerCase() && p.number === args.number
        );
        return pr || { error: `${args.repo_name} deposunda #${args.number} numaralı PR bulunamadı.` };
      },
    });

    this.registerTool({
      name: 'get_issue',
      description: 'Numara ve depoya göre sorun ayrıntılarını ve etiket sınıflandırmasını getirir.',
      inputSchema: {
        type: 'object',
        properties: {
          repo_name: { type: 'string' },
          number: { type: 'number' },
        },
        required: ['repo_name', 'number'],
      },
      outputSchema: { type: 'object' },
      execute: (args, ctx) => {
        const issue = ctx.issues.find(
          (i) => i.repo_name.toLowerCase() === args.repo_name.toLowerCase() && i.number === args.number
        );
        return issue || { error: `${args.repo_name} deposunda #${args.number} numaralı sorun bulunamadı.` };
      },
    });

    this.registerTool({
      name: 'get_activity',
      description: 'Yakın tarihli commit ve olay aktivitesi özetini getirir.',
      inputSchema: {
        type: 'object',
        properties: { days: { type: 'number', description: 'Gün cinsinden analiz penceresi' } },
      },
      outputSchema: { type: 'object' },
      execute: (args, ctx) => {
        const requestedDays = Number(args.days);
        const days = Number.isFinite(requestedDays)
          ? Math.min(TELEMETRY_WINDOW_DAYS, Math.max(1, requestedDays))
          : TELEMETRY_WINDOW_DAYS;
        const cutoff = Date.now() - (days - 1) * 24 * 60 * 60 * 1000;
        const isInWindow = (value?: string) => {
          const timestamp = value ? new Date(value).getTime() : Number.NaN;
          return Number.isFinite(timestamp) && timestamp >= cutoff;
        };
        const commits = ctx.commits.filter((commit) => isInWindow(commit.date));
        const pullRequests = ctx.pullRequests.filter((pr) => isInWindow(pr.updated_at || pr.created_at));
        const totalAdditions = commits.reduce((a, b) => a + b.additions, 0);
        const totalDeletions = commits.reduce((a, b) => a + b.deletions, 0);
        return {
          windowDays: days,
          totalCommits: commits.length,
          totalAdditions,
          totalDeletions,
          totalPRs: pullRequests.length,
          openIssues: ctx.issues.filter((i) => i.state === 'open').length,
        };
      },
    });
  }

  public static registerTool(tool: RegisteredTool): void {
    this.tools.set(tool.name, tool);
  }

  public static getTool(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  public static getAllTools(): RegisteredTool[] {
    this.initialize();
    return Array.from(this.tools.values());
  }

  public static async executeTool(
    name: string,
    args: Record<string, any>,
    context: ToolExecutionContext
  ): Promise<any> {
    this.initialize();
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`'${name}' aracı Araç Kayıt Defteri'nde (ToolRegistry) kayıtlı değildir.`);
    }
    return await tool.execute(args, context);
  }
}
