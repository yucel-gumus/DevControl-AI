import { Repository, CommitMetric, PullRequestMetric, IssueMetric, FileHotspot, EngineeringRisk, EngineeringHealthScore } from '../src/types.js';
import { HealthEngine } from './metrics/healthEngine.js';
import { HotspotEngine } from './metrics/hotspotEngine.js';
import { RiskEngine } from './metrics/riskEngine.js';
import { RISK_LEVEL_ORDER } from './constants.js';
import { riskMatchesRepo } from '../src/constants.js';

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
  execute: (args: Record<string, any>, context: ToolExecutionContext) => Promise<any> | any;
}

/** Liste döndüren araçların varsayılan ve azami kayıt sınırı. */
const DEFAULT_RECORD_LIMIT = 20;
const MAX_RECORD_LIMIT = 100;

/**
 * Araç çıktısındaki kayıt sayısını güvenli aralığa çeker.
 *
 * Araç sonuçları olduğu gibi model istemine konur (`aracSonuclari`); sınırsız
 * bir liste istemi şişirip modelin asıl sorudan sapmasına yol açar. Bu yüzden
 * her liste aracı sınırı kendisi uygular.
 *
 * Geçersiz girdi (sayı olmayan, sonsuz, sıfır veya negatif) **varsayılana**
 * düşer, sıfıra değil: `Number(null)` ve `Number('')` 0 döndüğü için tip
 * kontrolü olmadan `limit: null` "hiç kayıt isteme" gibi davranır, araç boş
 * liste döndürür ve model doğrulanmış telemetri varken "kayıt bulunamadı"
 * diye yanıt verirdi. Üst sınırı aşan değer üst sınıra indirgenir.
 */
function clampRecordLimit(requested: unknown): number {
  if (typeof requested !== 'number' || !Number.isFinite(requested) || requested < 1) {
    return DEFAULT_RECORD_LIMIT;
  }
  return Math.min(MAX_RECORD_LIMIT, Math.floor(requested));
}

export class ToolRegistry {
  private static tools: Map<string, RegisteredTool> = new Map();

  public static initialize(): void {
    if (this.tools.size > 0) return;

    this.registerTool({
      name: 'get_repository',
      description: 'Belirli bir depo için derinlemesine ayrıntıları ve mimari özeti getirir.',
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
      execute: (args, ctx) => {
        let results = ctx.commits;
        if (args.repo_name) {
          results = results.filter((c) => c.repo_name.toLowerCase() === args.repo_name.toLowerCase());
        }
        if (args.is_bug_fix !== undefined) {
          results = results.filter((c) => c.is_bug_fix === args.is_bug_fix);
        }
        if (args.category) {
          results = results.filter((c) => c.ai_category === args.category);
        }
        return results.slice(0, clampRecordLimit(args.limit));
      },
    });

    this.registerTool({
      name: 'list_pull_requests',
      description: 'Durgun durum, durum veya depoya göre filtrelenmiş çekme isteklerini (PR) listeler.',
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
        return prs.slice(0, clampRecordLimit(args.limit));
      },
    });

    this.registerTool({
      name: 'get_hotspots',
      description: 'Kod dalgalanması, değişiklik hızı ve risk derecelerine sahip kritik kod dosyalarını (hotspot) getirir.',
      execute: (args, ctx) => {
        let spots = ctx.hotspots || HotspotEngine.analyzeHotspots(ctx.commits);
        if (args.repo_name) {
          spots = spots.filter((h) => h.repo_name.toLowerCase() === args.repo_name.toLowerCase());
        }
        if (args.min_risk) {
          // Eşik ETİKETİ doğrulanır (tek kaynak: RISK_LEVEL_ORDER'ın kendi
          // anahtarları). İki sessiz hata böylece kapanır: tanınmayan bir etiket
          // (`|| 1` ile LOW'a düşerdi) filtre uygulanmış GİBİ görünürken hiçbir
          // şeyi süzmez; prototip üyesi bir anahtar (ör. 'constructor') ise sayı
          // yerine fonksiyon döndürüp karşılaştırmayı bozar ve liste boşalır.
          // Geçersiz etiket artık AÇIKÇA bildirilir: adım izde başarısız olarak
          // görünür (bkz. AnalysisTraceStep) — sessiz bir yanlış sonuç yerine.
          const minVal = (Object.keys(RISK_LEVEL_ORDER) as EngineeringRisk['severity'][])
            .includes(args.min_risk)
            ? RISK_LEVEL_ORDER[args.min_risk as EngineeringRisk['severity']]
            : null;
          if (minVal === null) {
            throw new Error(
              `Geçersiz min_risk değeri: '${String(args.min_risk)}'. Geçerli değerler: ${Object.keys(RISK_LEVEL_ORDER).join(', ')}.`,
            );
          }
          spots = spots.filter((h) => (RISK_LEVEL_ORDER[h.risk_level] || 1) >= minVal);
        }
        // Hotspot listesi ciddiyet sırasına göre gelir (bkz. HotspotEngine),
        // bu yüzden ilk N kayıt en kritik dosyalardır.
        return spots.slice(0, clampRecordLimit(args.limit));
      },
    });

    this.registerTool({
      name: 'get_engineering_risks',
      description: 'Destekleyici ölçülen kanıtlar ve güven puanlarıyla tespit edilen mühendislik risklerini getirir.',
      execute: (args, ctx) => {
        const spots = ctx.hotspots || HotspotEngine.analyzeHotspots(ctx.commits);
        let risks = ctx.risks || RiskEngine.analyzeRisks(ctx.repositories, ctx.commits, ctx.pullRequests, ctx.issues, spots);
        if (args.repo_name) {
          // Tek kaynak: karşılaştırma kuralı (kapsam çözümü, portföy geneli
          // dışlaması, `repo_name` yedeği) riskMatchesRepo'da tanımlıdır; burada
          // kopyalanan sürüm `affectedRepository` boş olan kayıtlarda çökerdi.
          risks = risks.filter((r) => riskMatchesRepo(r, args.repo_name));
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
      execute: (_args, ctx) => {
        return ctx.healthScore || HealthEngine.calculateHealth(ctx.repositories, ctx.commits, ctx.pullRequests, ctx.issues);
      },
    });

  }

  public static registerTool(tool: RegisteredTool): void {
    this.tools.set(tool.name, tool);
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
