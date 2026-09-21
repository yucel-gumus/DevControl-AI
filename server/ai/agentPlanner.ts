import { ToolRegistry, ToolExecutionContext } from '../toolRegistry.js';
import { generateGeminiText } from '../gemini.js';
import { HealthEngine } from '../metrics/healthEngine.js';
import { AskAiMessage, AnalysisTrace, AnalysisTraceStep, FileHotspot, Repository } from '../../src/types.js';
import {
  RepositoryRiskLevel,
  deriveRepositoryRiskLevel,
  describeRiskScope,
  formatMeasuredHealthDimensions,
  groupHotspotsByRepo,
  riskMatchesRepo,
} from '../../src/constants.js';
import { callTypeSafeSystemOne, isTypeSafeConfigured } from '../typesafe.js';
import { commitFileEntries } from '../utils/commitFiles.js';
import {
  TYPESAFE_INTENT_CONFIDENCE_THRESHOLD,
  TYPESAFE_DIRECT_METRIC_NOUL_THRESHOLD,
  TYPESAFE_FACT_ALIGNMENT_THRESHOLD,
  TYPESAFE_INTENT_TIMEOUT_MS,
  TYPESAFE_INTENT_MAX_ATTEMPTS,
  TYPESAFE_FACT_CHECK_TIMEOUT_MS,
  TYPESAFE_FACT_CHECK_MAX_ATTEMPTS,
  STALE_PR_THRESHOLD_DAYS,
} from '../constants.js';

export interface AgentExecutionResult {
  message: AskAiMessage;
  trace: AnalysisTrace;
}

/**
 * Aciliyet sorusunun seviyeleri (düşükten yükseğe). Tek kaynak: hem TypeSafe
 * sorusunun `criteria` listesi hem iz ekranındaki "x/2.0" ölçek etiketi bu
 * diziden türetilir. Ayrıca yanıt doğrulaması `score` üst sınırını bu listenin
 * uzunluğundan alır (bkz. typesafe.toScoreAnswer): `score`, seviye ekseninde
 * bir konumdur (0..n-1), 0..1 oranı değil.
 */
const URGENCY_LEVELS = [
  'Standart bilgi talebi',
  'Önemli inceleme veya teşhis',
  'Kritik sistem riski veya anında müdahale gereksinimi',
];

/** Aciliyet ölçeğindeki en yüksek seviye numarası (0..n-1). */
const URGENCY_TOP_LEVEL = URGENCY_LEVELS.length - 1;

/**
 * Hotspot kaydında tutulan ÖLÇÜM alanları.
 *
 * `evidence` ve `recommendation` alanları ölçüm değil, aynı sayıların
 * şablonlanmış sunumudur (bkz. HotspotEngine.deriveRiskLevel ve
 * deriveRecommendation): kayıt başına ~800 bayt düzyazı taşırlar ve 20 kayıtta
 * istemi ~16 KB şişirirler. Kalan alanlar ölçülen sayıların tamamını korur.
 */
const HOTSPOT_MEASUREMENT_FIELDS = [
  'path',
  'repo_name',
  'language',
  'modifications_count',
  'contributors_count',
  'code_churn',
  'avg_churn_per_commit',
  'bug_fix_commits_count',
  'risk_level',
  'confidence',
  'last_modified',
] as const;

/**
 * Araç sonuçlarının TEK kanıt projeksiyonu.
 *
 * Aynı nesne iki tüketiciye gider: sentez istemi (`aracSonuclari`) ve TypeSafe
 * kanıt doğrulayıcısı (`olculenProjeksiyon.aracSonuclari`). Doğrulayıcıya ayrı,
 * daha yoksul bir kopya vermek — canlı çağrıda görüldüğü gibi — onu yapısal
 * olarak yanıltır: cevap commit ayrıntılarını ölçülen kayıtlardan alırken
 * doğrulayıcı yalnızca özet olguları gördüğü için DOĞRU bir yanıtı "%15 uyumlu"
 * sayabiliyordu. Tek projeksiyon, "doğrulayıcı sentezleyicinin gördüğü kanıtı
 * görür" ilkesini yapı gereği garanti eder.
 *
 * Araçlar tam kayıtları döner: bir commit kaydı dosya listesi (`files`), dosya
 * adları ve yapay zeka gerekçesiyle birlikte ~2 KB tutar ve `list_commits` 20
 * kayda kadar döner. Kırpılan alanlar sorunun cevabında kullanılmaz: dosya
 * bazlı ayrıntı zaten `get_hotspots` sonucunda ve deterministik kanıt adımında
 * ölçülür (aşağıda ham `toolResults` üzerinden), kategori/güven alanları ise
 * commit kaydında kalır. Yani projeksiyon ölçülen kanıtı değiştirmez.
 */
function buildEvidenceProjection(toolResults: Record<string, any>): Record<string, any> {
  const projection: Record<string, any> = {};
  for (const [name, result] of Object.entries(toolResults)) {
    if (!Array.isArray(result)) {
      projection[name] = result;
    } else if (name === 'list_commits') {
      projection[name] = result.map(
        ({ files, affected_files, ai_reasoning, author_avatar, ...essential }) => essential,
      );
    } else if (name === 'get_hotspots') {
      projection[name] = result.map((hotspot: FileHotspot) => {
        const measured: Record<string, any> = {};
        for (const field of HOTSPOT_MEASUREMENT_FIELDS) {
          if (hotspot?.[field] !== undefined) measured[field] = hotspot[field];
        }
        return measured;
      });
    } else {
      projection[name] = result;
    }
  }
  return projection;
}

/** Araç planındaki tek bir girdi: araç adı ve isteğe bağlı argüman politikası. */
interface ToolPlanItem {
  name: string;
  /** true ise araç, eşleşen depoya `repo_name` ile daraltılır. */
  scoped?: boolean;
  /** Depo bağlamından bağımsız olarak her zaman eklenen argümanlar. */
  extraArgs?: Record<string, any>;
}

/**
 * Araç planını somut `{ name, args }` çağrılarına dönüştürür.
 * `repoName` verilmezse `scoped` girdiler argümansız (genel) çalışır.
 */
function materializeToolPlan(
  plan: ToolPlanItem[],
  repoName?: string,
): { name: string; args: Record<string, any> }[] {
  return plan.map((tool) => ({
    name: tool.name,
    args: {
      ...(tool.scoped && repoName ? { repo_name: repoName } : {}),
      ...(tool.extraArgs || {}),
    },
  }));
}

/**
 * Bir araç çıktısındaki kayıt (varlık) sayısını döndürür.
 * Diziler eleman sayısıyla, nesneler tek kayıtla sayılır: bir nesnenin
 * anahtarlarını saymak, tek bir sağlık skoru nesnesini onlarca "veri noktası"
 * gibi göstererek kullanıcıya yanıltıcı bir hacim raporlardı.
 */
function countAnalyzedRecords(result: unknown): number {
  if (Array.isArray(result)) return result.length;
  if (result !== null && typeof result === 'object') return 1;
  return 0;
}

/**
 * Niyet -> araç eşlemesi. `scoped: true` araçlar eşleşen depoya daraltılır,
 * `extraArgs` her durumda eklenir. Tabloda karşılığı olmayan bir niyet etiketi
 * (model yeni bir etiket üretirse veya güven eşiğin altındaysa) aşağıdaki tam
 * telemetri planına düşer — sessizce boş plana değil.
 *
 * Modül düzeyindedir: tablo sabittir, her soru için yeniden kurulmaz ve
 * içerik tek kaynakta okunur.
 */
const INTENT_TOOL_PLAN: Record<string, ToolPlanItem[]> = {
  hotspots: [{ name: 'get_hotspots', scoped: true }],
  risks: [{ name: 'get_engineering_risks', scoped: true }, { name: 'get_health_breakdown' }],
  commits: [{ name: 'list_commits', scoped: true, extraArgs: { limit: 30 } }],
  pull_requests: [{ name: 'list_pull_requests', scoped: true, extraArgs: { state: 'all', limit: 30 } }],
  health: [{ name: 'get_health_breakdown' }, { name: 'get_engineering_risks', scoped: true }],
};

/**
 * Bu liste yalnızca "hedef depo var, niyet tanınmadı" dalında kullanılır;
 * bu yüzden dört araç da `scoped: true` olmak zorundadır. Aksi hâlde soru
 * belirli bir depoyu adlandırdığı hâlde araçlar argümansız çalışır ve
 * başka depoların commit/risk kayıtları o depoya atfedilir.
 */
const FALLBACK_TOOLS_SCOPED: ToolPlanItem[] = [
  { name: 'list_commits', scoped: true, extraArgs: { limit: 30 } },
  { name: 'list_pull_requests', scoped: true, extraArgs: { state: 'all', limit: 30 } },
  { name: 'get_hotspots', scoped: true },
  { name: 'get_engineering_risks', scoped: true },
];

/** Hedef depo yoksa hiçbir araç daraltılamaz; bu liste bilinçli olarak genel. */
const FALLBACK_TOOLS_GLOBAL: ToolPlanItem[] = [
  { name: 'get_health_breakdown' },
  { name: 'get_engineering_risks' },
  { name: 'get_hotspots' },
  { name: 'list_commits', extraArgs: { limit: 30 } },
  { name: 'list_pull_requests', extraArgs: { state: 'all', limit: 30 } },
];

export class AgentPlanner {
  /**
   * Niyet Analizi -> Araç Yürütme -> Veri Projeksiyonu -> Gemini Sentezi -> Kanıt Yanıtı sürecini yönetir
   */
  public static async answerQuestion(
    question: string,
    context: ToolExecutionContext
  ): Promise<AgentExecutionResult> {
    const startTime = Date.now();
    const traceSteps: AnalysisTraceStep[] = [];
    const toolsUsed: string[] = [];
    let dataPointsAnalyzed = 0;

    // Adım 1: Soruyu Anlama ve Niyet Sınıflandırma
    const step1Start = Date.now();
    const lowerQ = question.toLowerCase();

    // Sorguda belirli bir depo ismi geçiyor mu tespit et (kelime sınırları ile hatalı pozitifleri önle)
    const matchedRepo = context.repositories.find((r) => {
      const rName = r.name.toLowerCase().trim();
      if (!rName) return false;
      const escaped = rName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const spaced = escaped.replace(/[-_]/g, '[-_\\s]');
      const pattern = new RegExp(`(^|[^a-z0-9_-])${spaced}([^a-z0-9_-]|$)`, 'i');
      return pattern.test(lowerQ);
    });
    const matchedRepoCommits = matchedRepo
      ? context.commits.filter((commit) => commit.repo_name.toLowerCase() === matchedRepo.name.toLowerCase())
      : [];
    const matchedRepoPullRequests = matchedRepo
      ? context.pullRequests.filter((pr) => pr.repo_name.toLowerCase() === matchedRepo.name.toLowerCase())
      : [];
    const matchedRepoIssues = matchedRepo
      ? context.issues.filter((issue) => issue.repo_name.toLowerCase() === matchedRepo.name.toLowerCase())
      : [];
    const matchedRepoHealth = matchedRepo
      ? HealthEngine.calculateHealth([matchedRepo], matchedRepoCommits, matchedRepoPullRequests, matchedRepoIssues)
      : null;

    // Depo adı -> hotspot listesi, BİR kez gruplanır (O(hotspot)); her depo için
    // tüm listeyi yeniden taramak O(depo × hotspot) maliyeti üretirdi.
    const hotspotsByRepo = groupHotspotsByRepo(context.hotspots || []);

    /**
     * Sınıflandırmaya GİRDİ VEREN depolar: en az bir commit'i dosya listesi
     * taşıyan depolar. Ölçüt "commit'i var" DEĞİL "commit'i dosya listesi
     * taşıyor"dur: detay isteği düşen bir commit dosya listesi olmadan
     * kaydedilir (bkz. githubService -> commitDetailFailures) ve o depo için
     * hiçbir dosya sınıflandırılmamış olur — commit'i var diye ölçülmüş sayılan
     * böyle bir depo, boş hotspot sepetiyle 'HEALTHY' ("ölçüldü, riskli dosya
     * yok") görünürdü. Dosya listesi çıkarımı tek kaynaktan okunur
     * (server/utils/commitFiles.ts), böylece ölçüt sınıflandırıcının gördüğü
     * girdinin aynısıdır.
     *
     * Ölçüt portföy geneli DEĞİL depo bazındadır: `context.hotspots` yalnızca
     * eşiği geçen dosyaları taşır (bkz. HotspotEngine), bu yüzden listesi boş
     * olan bir depo "hiç sınıflandırılmadı" değil "sınıflandırıldı, eşiği geçen
     * dosya yok" demektir.
     */
    const reposWithClassifiedFiles = new Set(
      context.commits
        .filter((commit) => commitFileEntries(commit).length > 0)
        .map((commit) => commit.repo_name),
    );

    /**
     * Deponun risk seviyesi; depo için ÖLÇÜM yoksa `undefined` döner.
     *
     * Boş liste ile ölçümün hiç yapılmamış olması ayrı durumlardır: birincisi
     * "ölçüldü, yüksek riskli dosya yok" (HEALTHY) demektir, ikincisi ise
     * bilinmeyen bir seviyeyi "sağlıklı" diye bildirmek olurdu. Bu yüzden
     * ölçüm yokken alan istemden tamamen çıkarılır (JSON'da tanımsız alan yer
     * kaplamaz) ve olgu satırı bu durumu "Ölçüm yok" diye yazar; süren bir
     * hesabı çağrıştıran "hesaplanıyor" ifadesi kullanılmaz (ölçüm yokluğu,
     * tamamlanmış bir projeksiyonda süren bir hesap gibi okunurdu). Ayrımı
     * kuran tek koşul, deponun sınıflandırmaya dosya vermiş olmasıdır
     * (bkz. reposWithClassifiedFiles).
     */
    const repoRiskLevel = (repoName: string): RepositoryRiskLevel | undefined =>
      reposWithClassifiedFiles.has(repoName)
        ? deriveRepositoryRiskLevel(hotspotsByRepo.get(repoName) || [])
        : undefined;

    traceSteps.push({
      step: 'Soruyu anlama ve niyet sınıflandırma',
      status: 'completed',
      details: matchedRepo
        ? `Sorguda "${matchedRepo.name}" deposu hedeflendi; ${matchedRepoCommits.length} commit, ${matchedRepoPullRequests.length} PR ve ${matchedRepoIssues.length} issue eşleştirildi.`
        : `Sorguda belirli bir depo hedefi bulunamadı; ${context.repositories.length} izlenen depo genelinde analiz yürütüldü.`,
      durationMs: Date.now() - step1Start,
    });

    // Adım 2: TypeSafe AI ile Niyet Analizi ve Akıllı Araç Seçimi
    const planStart = Date.now();
    let typeSafeIntent: string | null = null;
    let typeSafeConfidence: number | null = null;
    let typeSafeUrgency: number | null = null;
    let typeSafeDirectMetric = false;

    if (isTypeSafeConfigured()) {
      const tsStart = Date.now();
      const systemOneResult = await callTypeSafeSystemOne({
        state: {
          question,
          hedefDepo: matchedRepo ? matchedRepo.name : null,
          izlenenDepolar: context.repositories.map((r) => r.name),
        },
        questions: {
          intent: {
            type: 'choice',
            instructions: 'Bu geliştirici sorusu GitHub telemetrisinde hangi analiz alanını hedefliyor?',
            criteria: {
              hotspots: 'Sık değişen dosyalar, kod dalgalanması (churn), karmaşık/hata alan kodlar',
              risks: 'Mühendislik riskleri, durgun PR, teknik borç, kalite düşüşü',
              commits: 'Commit geçmişi, geliştirici aktivitesi, commit ritmi ve frekansı',
              pull_requests: 'PR durumları, inceleme süreleri, açık/kapalı PR analizi',
              health: 'Mühendislik sağlık skoru, genel repo performansı ve teslimat ritmi',
              general: 'Genel bir soru, birden fazla alanı kapsayan veya kapsamlı özet talebi',
            },
          },
          is_direct_metric: {
            type: 'noul',
            instructions: 'Kullanıcı açık uçlu danışmanlık yerine tek bir somut sayı/metrik veya liste mi istiyor?',
          },
          urgency: {
            type: 'score',
            instructions: 'Sorunun aciliyet ve kritiklik seviyesi nedir?',
            criteria: URGENCY_LEVELS,
          },
        },
        // Niyet yönlendirmesi gecikmeye duyarlı bir hızlandırmadır: tek denemeyle sınırlanır.
        timeoutMs: TYPESAFE_INTENT_TIMEOUT_MS,
        maxAttempts: TYPESAFE_INTENT_MAX_ATTEMPTS,
      });

      if (systemOneResult && systemOneResult.answers) {
        const intentAns = systemOneResult.answers['intent'];
        const directAns = systemOneResult.answers['is_direct_metric'];
        const urgencyAns = systemOneResult.answers['urgency'];

        if (intentAns && intentAns.type === 'choice') {
          typeSafeIntent = intentAns.choice;
          // Doğrulama tek kaynakta yapılır (bkz. typesafe.toChoiceAnswer):
          // aralık dışı/eksik güven oradan `null` olarak gelir, burada ikinci
          // bir kontrol kopyası tutulmaz.
          typeSafeConfidence = intentAns.confidence;
        }
        // `noul` ve `score` yanıtları kendi DEĞER eşikleriyle süzülür; güven
        // alanı okunmadan bırakılırsa düşük güvenli bir sinyal de istemi
        // biçimlendirir (bkz. routingNotes) ve README'nin "düşük güvenli
        // yönlendirmeler yok sayılır" sözü tutulmamış olur. `noul` yanıtı güven
        // alanı taşımaz (bkz. NoulAnswer), `score` taşır (bkz. ScoreAnswer):
        // ikisi de bu yüzden aynı eşikten geçer.
        if (directAns && directAns.type === 'noul') {
          typeSafeDirectMetric = directAns.noul >= TYPESAFE_DIRECT_METRIC_NOUL_THRESHOLD;
        }
        if (urgencyAns && urgencyAns.type === 'score') {
          const urgencyConfident =
            urgencyAns.confidence !== null && urgencyAns.confidence >= TYPESAFE_INTENT_CONFIDENCE_THRESHOLD;
          typeSafeUrgency = urgencyConfident && Number.isFinite(urgencyAns.score) ? urgencyAns.score : null;
        }

        const confidenceLabel = typeSafeConfidence !== null
          ? `%${Math.round(typeSafeConfidence * 100)}`
          : 'belirtilmedi';

        traceSteps.push({
          step: `TypeSafe System One (${systemOneResult.model}) Niyet Yönlendirmesi`,
          status: 'completed',
          details: `Niyet: "${typeSafeIntent ?? 'belirlenemedi'}" (Güven: ${confidenceLabel}), Doğrudan Metrik: ${typeSafeDirectMetric ? 'Evet' : 'Hayır'}${typeSafeUrgency !== null ? `, Aciliyet: ${typeSafeUrgency.toFixed(1)}/${URGENCY_TOP_LEVEL.toFixed(1)}` : ''}`,
          durationMs: Date.now() - tsStart,
        });
      }
    }

    const selectedTools: { name: string; args: Record<string, any> }[] = [];

    // Hedefe yönelik araç seçimi (TypeSafe kararına göre optimize edildi).
    // Anahtar model tarafından üretildiği için düz indeksleme yeterli değildir:
    // 'constructor' gibi bir etiket Object.prototype üyesini döndürüp plan
    // malzemesini çökertir (`.map is not a function`). Bu yüzden yalnızca
    // tabloda gerçekten tanımlı anahtarlar kabul edilir.
    const intentPlan: ToolPlanItem[] | undefined =
      typeSafeIntent &&
      (typeSafeConfidence ?? 0) >= TYPESAFE_INTENT_CONFIDENCE_THRESHOLD &&
      Object.prototype.hasOwnProperty.call(INTENT_TOOL_PLAN, typeSafeIntent)
        ? INTENT_TOOL_PLAN[typeSafeIntent]
        : undefined;

    if (matchedRepo) {
      selectedTools.push({ name: 'get_repository', args: { repo_name: matchedRepo.name } });
    }

    if (intentPlan) {
      selectedTools.push(...materializeToolPlan(intentPlan, matchedRepo?.name));
    } else if (matchedRepo) {
      // Tanınmayan/eksik niyet + hedef depo: çok boyutlu depo telemetrisi
      selectedTools.push(...materializeToolPlan(FALLBACK_TOOLS_SCOPED, matchedRepo.name));
    } else {
      // Tanınmayan/eksik niyet + hedef depo yok: çok boyutlu genel telemetri
      selectedTools.push(...materializeToolPlan(FALLBACK_TOOLS_GLOBAL));
    }

    const planDuration = Date.now() - planStart;
    traceSteps.push({
      step: 'Sorgu planı formüle etme ve araç seçimi',
      status: 'completed',
      details: `${selectedTools.length} hedefe yönelik araç seçildi: [${selectedTools.map((t) => t.name).join(', ')}]`,
      durationMs: planDuration,
    });

    // Adım 3: Araç Yürütme ve Veri Getirme
    const toolResults: Record<string, any> = {};
    for (const toolCall of selectedTools) {
      const stepStart = Date.now();
      toolsUsed.push(toolCall.name);
      try {
        const result = await ToolRegistry.executeTool(toolCall.name, toolCall.args, context);
        toolResults[toolCall.name] = result;
        // Projeksiyona giren gerçek kayıt sayısı sayılır (uydurma çarpan yok).
        dataPointsAnalyzed += countAnalyzedRecords(result);
        traceSteps.push({
          step: `'${toolCall.name}' aracı yürütüldü`,
          status: 'completed',
          details: `Sorgu filtreleriyle eşleşen yapılandırılmış veri kayıtları getirildi`,
          durationMs: Date.now() - stepStart,
          tool: toolCall.name,
        });
      } catch (err: unknown) {
        traceSteps.push({
          step: `'${toolCall.name}' aracı başarısız oldu`,
          status: 'failed',
          details: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - stepStart,
          tool: toolCall.name,
        });
      }
    }

    // Adım 4: Veri Projeksiyonu
    const projectionStart = Date.now();
    // Kanıt projeksiyonu bir kez üretilir; hem isteme hem kanıt doğrulayıcısına
    // aynı nesne gider (bkz. buildEvidenceProjection).
    const evidenceProjection = buildEvidenceProjection(toolResults);
    const compactProjection = {
      sorgu: question,
      hedefDepo: matchedRepo
        ? {
            ad: matchedRepo.name,
            saglikSkoru: matchedRepoHealth?.hasData ? matchedRepoHealth.overallScore : null,
            riskSeviyesi: repoRiskLevel(matchedRepo.name),
            dil: matchedRepo.language,
            forkSayisi: matchedRepo.forks_count,
            yildizSayisi: matchedRepo.stargazers_count,
            sonGuncelleme: matchedRepo.updated_at,
          }
        : null,
      izlenenDepolar: context.repositories.map((r) => ({
        ad: r.name,
        riskSeviyesi: repoRiskLevel(r.name),
        dil: r.language,
        forkSayisi: r.forks_count,
        yildizSayisi: r.stargazers_count,
      })),
      telemetriDurumu: context.healthScore?.dataStatus || 'no_data',
      aracSonuclari: evidenceProjection,
    };
    dataPointsAnalyzed += context.repositories.length;

    traceSteps.push({
      step: 'Veri projeksiyonu ve kanıt sinyalleri çıkarma',
      status: 'completed',
      details: `${dataPointsAnalyzed} adet telemetri kaydı bağlam gösterimine yansıtıldı`,
      durationMs: Date.now() - projectionStart,
    });

    // Adım 5: Gemini Mühendislik Analistini Çağırma
    const synthesisStart = Date.now();
    let assistantText = '';
    // Yanıtı yapay zekanın mı ürettiği, yoksa deterministik telemetri özeti mi
    // olduğu burada tutulur: kanıt doğrulama kapısı yalnızca üretilmiş metni
    // denetlemelidir (bkz. Adım 6).
    let aiSynthesisUsed = false;
    const facts: string[] = [];
    let interpretation = '';
    const recommendedActions: string[] = [];
    const evidenceItems: { metric: string; value: string | number; source: string }[] = [];
    const hasTelemetry = Boolean(
      context.healthScore?.hasData &&
      (context.commits.length > 0 || context.pullRequests.length > 0 || context.issues.length > 0)
    );
    const queryHasTelemetry = hasTelemetry && (!matchedRepo || Boolean(matchedRepoHealth?.hasData));

    /**
     * TypeSafe karar sinyallerinin isteme taşınması.
     *
     * Sinyaller iz ekranında zaten görünür, ancak iz bir teşhis yüzeyidir:
     * yanıtın biçimini etkilemedikleri sürece üretilen ölçüm değil, süs olurlar.
     * Aktarım deterministiktir ve eşiklere bağlıdır — `noul` doğrudan metrik
     * olasılığı eşiği geçmiyorsa (bkz. TYPESAFE_DIRECT_METRIC_NOUL_THRESHOLD)
     * veya aciliyet, seviye ekseninde (bkz. URGENCY_LEVELS) en üst seviyeye
     * yuvarlanmıyorsa satır eklenmez.
     */
    const routingNotes: string[] = [];
    if (typeSafeDirectMetric) {
      routingNotes.push('Soru, tek bir somut metrik/liste talebi olarak sınıflandırıldı — YAPI 1 uygulanır (önce net cevap, uzun yol haritası yok).');
    }
    if (typeSafeUrgency !== null && Math.round(typeSafeUrgency) >= URGENCY_TOP_LEVEL) {
      routingNotes.push('Aciliyet sinyali en üst seviyede — yanıt en kritik bulgu ve ilk müdahale adımıyla başlar.');
    }

    const prompt = `Sen KENSAI, DevControl AI'ın kanıta dayalı ve deterministik gerçeklere dayanan Üst Düzey Yapay Zeka Mühendislik Zekası Analistisin (Senior Staff Engineering Intelligence Analyst).

GÖREV:
Kullanıcının sorusunu YALNIZCA sağlanan doğrulanmış depo ve telemetri verilerini kullanarak eksiksiz ve derinlemesine yanıtla.

TEMEL PRENSİPLER:
1. Kesinlikle kullanıcının sorduğu spesifik konuya veya depoya odaklan (örneğin kullanıcı "${matchedRepo ? matchedRepo.name : question}" hakkında sormuşsa doğrudan o deponun verilerini değerlendir).
2. Asla uydurma veri, hayali dosya isimleri veya temelsiz iddialar üretme.
3. Sayısal ölçümleri (commit sayıları, kod dalgalanması satırları, PR durumları, sağlık skorları) kanıt olarak vurgula.
4. DİL: Yanıtının tamamı %100 profesyonel, akıcı, zengin ve TÜRKÇE olmalıdır. Asla İngilizce başlık veya kalıp kullanma.

YAPI VE FORMAT YÖNERGESİ:
1. SPESİFİK METRİK VEYA TEKİL SORULAR İÇİN (Örn: "kaç commit var?", "hangi diller?", "sağlık puanı kaç?", "en son commit ne zaman?", "kaç issue var?"):
   - Yanıtına DOĞRUDAN, NET ve KESİN olarak sorunun cevabını vererek başla (Örn: "**\`${matchedRepo ? matchedRepo.name : 'depo'}\` deposunda doğrulanmış X commit bulunmaktadır.**").
   - Ardından ilgili telemetri kanıtlarını (tarihleri, commit mesajları, yazarları vb.) düzenli bir liste veya maddeleme halinde sun.
   - Kullanıcı genel bir analiz istemediği sürece gereksiz yere uzun yol haritası veya genel mimari nutuk yazma; odaklı, net ve kanıta dayalı kal.

2. GENEL ANALİZ VEYA MİMARİ DEĞERLENDİRME İSTEYEN SORULAR İÇİN (Örn: "kodları analiz et", "riskleri incele", "sağlık durumu nasıl?", "depoyu değerlendir"):
   - Yanıtını aşağıdaki 4 bölümlü zengin Markdown yapısıyla kurgula:
     ### 🏛️ Mimari Sağlık ve Durum Analizi
     ### 📊 Doğrulanmış Telemetri Kanıtları
     ### ⚠️ Risk Değerlendirmesi & Kritik Dosyalar
     ### 🛠️ Önerilen Mühendislik Yol Haritası

KULLANICI SORUSU: "${question}"
${routingNotes.length > 0 ? `\nTYPESAFE KARAR SINYALLERİ (System One):\n${routingNotes.map((note) => `- ${note}`).join('\n')}\n` : ''}
SAĞLANAN YAPILANDIRILMIŞ TELEMETRİ VERİLERİ:
${JSON.stringify(compactProjection, null, 2)}`;

    if (!queryHasTelemetry) {
      assistantText = matchedRepo
        ? `### 📡 \`${matchedRepo.name}\` için GitHub Telemetrisi Bekleniyor\n\n\`${matchedRepo.name}\` deposu bağlı olsa da analiz penceresinde bu depoya ait doğrulanmış commit, PR veya issue kaydı bulunmuyor. Sağlık skoru ve risk analizi üretmek için lütfen GitHub verilerini yeniden eşitleyin.`
        : `### 📡 GitHub Telemetrisi Bekleniyor\n\nHenüz doğrulanmış GitHub commit veya PR verisi bulunmuyor. Sağlık skoru, kritik dosya ve risk analizi üretmek için lütfen **Depolar & Bağlantı** bölümünden GitHub hesabınızı bağlayın ve verileri eşitleyin.`;
    } else {
      const aiAnswer = await generateGeminiText(prompt);
      aiSynthesisUsed = Boolean(aiAnswer);
      if (aiAnswer) {
        assistantText = aiAnswer;
      } else {
        assistantText = AgentPlanner.generateTelemetryFallback(context, matchedRepo);
      }
    }

    // Hedef depoya veya genel sonuçlara göre olguları ve kanıtları topla
    if (matchedRepo && matchedRepoHealth?.hasData) {
      // Ölçülemeyen risk seviyesi "hesaplanıyor" diye yazılmaz: bu, tamamlanmış
      // bir projeksiyonda süren bir hesap varmış gibi okunur. Ölçüm yokluğu
      // ölçüm yokluğu olarak bildirilir (karşılaştırma: aynı durumda
      // compactProjection alanı hiç taşımaz).
      facts.push(`${matchedRepo.name} deposu: Sağlık Skoru ${matchedRepoHealth.overallScore}/100, Risk Seviyesi: ${repoRiskLevel(matchedRepo.name) || 'Ölçüm yok'}, Dil: ${matchedRepo.language}.`);
      evidenceItems.push({
        metric: `${matchedRepo.name} Sağlık Skoru`,
        value: `${matchedRepoHealth.overallScore} / 100`,
        source: `Doğrulanmış GitHub Telemetrisi / ${matchedRepo.name}`,
      });
      evidenceItems.push({
        metric: 'Yıldız & Fork Sayısı (Stars / Forks)',
        value: `${matchedRepo.stargazers_count} Yıldız · ${matchedRepo.forks_count} Fork`,
        source: `GitHub API / ${matchedRepo.name}`,
      });
    } else if (matchedRepo && hasTelemetry) {
      facts.push(`${matchedRepo.name} deposu için analiz penceresinde doğrulanmış commit veya PR kaydı bulunamadı.`);
    }

    if (toolResults['get_hotspots']) {
      let hotspotsList = toolResults['get_hotspots'] as any[];
      if (matchedRepo) {
        const repoHotspots = hotspotsList.filter((h) => h.repo_name.toLowerCase() === matchedRepo.name.toLowerCase());
        if (repoHotspots.length > 0) hotspotsList = repoHotspots;
      }
      const topHotspots = hotspotsList.slice(0, 3);
      topHotspots.forEach((h) => {
        const fileName = (h.path && typeof h.path === 'string') ? (h.path.split('/').pop() || h.path) : 'modül';
        facts.push(`${h.repo_name}/${h.path} kritik dosyası: ${h.modifications_count} değişiklik, ${h.bug_fix_commits_count} hata düzeltmesi, ${h.code_churn} satır dalgalanma.`);
        evidenceItems.push({
          metric: `${fileName} Dalgalanması`,
          value: `${h.code_churn} satır (${h.modifications_count} commit)`,
          source: `Git Commit Günlüğü / ${h.repo_name}`,
        });
      });
    }

    if (toolResults['get_engineering_risks']) {
      let risksList = toolResults['get_engineering_risks'] as any[];
      if (matchedRepo) {
        const repoRisks = risksList.filter((r) => riskMatchesRepo(r, matchedRepo.name));
        if (repoRisks.length > 0) risksList = repoRisks;
      }
      const risks = risksList.slice(0, 2);
      risks.forEach((r) => {
        // Portföy geneli riskler tek bir depoya atfedilemez; kapsam etiketiyle
        // anılırlar (aksi halde olgu satırı boş bir depo adıyla başlardı).
        const scopeName = describeRiskScope(r);
        facts.push(`${scopeName} üzerinde [${r.severity}] seviyesinde risk tespit edildi: ${r.title}`);
        recommendedActions.push(r.recommendedAction);
        evidenceItems.push({
          metric: `${scopeName} Riski (${r.category})`,
          value: `Seviye: ${r.severity} (Güven: %${r.confidence})`,
          source: 'Deterministik Risk Motoru',
        });
      });
    }

    if (toolResults['get_health_breakdown']?.hasData) {
      const h = toolResults['get_health_breakdown'];
      // Boyut dökümü YALNIZCA ölçülmüş boyutlardan kurulur: `dimensions`
      // sözlüğü ölçülmemiş bir boyut için de 0 taşır ve süzgeçsiz yazım, hiç
      // hesaplanmamış bir boyutu "0" diye hem kullanıcıya hem TypeSafe olgu
      // denetimine KANIT olarak verirdi; denetim de uydurma sıfırı doğrulanmış
      // telemetri sayardı (bkz. src/constants.ts ->
      // formatMeasuredHealthDimensions).
      const dimensionSummary = formatMeasuredHealthDimensions(
        h,
        ['codeHealth', 'delivery', 'documentation'],
        'boyut skorları ölçülemedi',
      );
      facts.push(`Genel Mühendislik Sağlığı: ${h.overallScore}/100 (${dimensionSummary}).`);
      evidenceItems.push({
        metric: 'Genel Sağlık Skoru',
        value: `${h.overallScore} / 100`,
        source: 'Mühendislik Sağlık Motoru',
      });
    }

    interpretation = !hasTelemetry
      ? 'Henüz doğrulanmış GitHub telemetrisi bulunmadığı için mühendislik yorumu üretilmedi.'
      : matchedRepo && matchedRepoHealth?.hasData
        ? `${matchedRepo.name} deposu için yorum, analiz penceresinde bulunan doğrulanmış commit, PR ve issue kayıtları üzerinden oluşturuldu.`
        : 'Analiz, seçili depoların doğrulanmış commit, PR ve issue kayıtları üzerinden oluşturuldu.';

    if (recommendedActions.length === 0) {
      if (hasTelemetry) {
        recommendedActions.push('Birleştirme çakışmalarını ve regresyon riskini azaltmak için yüksek dalgalanmaya sahip dosyaları refaktör edin.');
        // Eşik metne gömülmez: `is_stale` bayrağı bu sabitle işaretlenir (bkz.
        // githubService); ayrı yazılan bir sayı sabitle ayrıştığında öneri,
        // ölçülen "durgun PR" kümesinden başka bir kümeyi tarif ederdi.
        recommendedActions.push(`Teslimat hızını artırmak için ${STALE_PR_THRESHOLD_DAYS} günden uzun süre açık kalan çekme isteklerini (PR) incelemeye alın.`);
      } else {
        recommendedActions.push('Depolar & Bağlantı bölümünden GitHub hesabını bağlayın ve verileri eşitleyin.');
      }
    }

    const synthesisDurationMs = Date.now() - synthesisStart;

    // Sentez adımı, doğrulamadan ÖNCE çalıştığı için iz adımı da burada
    // kaydedilir; aksi halde iz listesi çalışma sırasının tersini gösterirdi.
    traceSteps.push({
      step: 'Kanıta dayalı mühendislik zekası sentezleme',
      status: 'completed',
      details: `${(synthesisDurationMs / 1000).toFixed(2)} saniyede doğrulanabilir kaynaklarla çok noktalı olgusal analiz üretildi`,
      durationMs: synthesisDurationMs,
    });

    // Adım 6: TypeSafe AI ile Halüsinasyon & Kanıt Doğrulama (Back-Gate Fact-Check)
    //
    // Kapı YALNIZCA yapay zekanın ürettiği metni denetler: `aiSynthesisUsed`
    // false ise (Gemini erişilemedi ya da telemetri yok) yanıt deterministik
    // telemetri özetidir — halüsinasyon üretemeyecek bir metni ücretli bir
    // çağrıyla "doğrulamak" ölçüm katmadığı gibi, gereksiz uyarı riski taşır.
    // `aiSynthesisUsed` zaten telemetri bulunmasını gerektirir (yapay zeka dalı
    // yalnızca `queryHasTelemetry` iken çalışır), bu yüzden `hasTelemetry` ek
    // koşulu burada tekrarlanmaz.
    let factCheckNotice: string | null = null;
    if (isTypeSafeConfigured() && aiSynthesisUsed && facts.length > 0) {
      const verifyStart = Date.now();
      try {
        const verifyResult = await callTypeSafeSystemOne({
          state: {
            // Kanıtların TAMAMI gönderilir. Dizinin üst sınırı yapı gereği
            // sınırlıdır (en çok 1 hedef depo + 3 hotspot + 2 risk + 1 sağlık
            // satırı), fakat eski `slice(0, 4)` çağrısı risk ve sağlık
            // kanıtlarını kesiyordu: model, hakkında kanıt görmediği bir konuda
            // yazdığı için DOĞRU yanıtlar "uyumsuz" damgası yiyebiliyordu.
            telemetriKanitlari: facts,
            // Sentezleyicinin gördüğü projeksiyonun AYNISI (hedef depo üst
            // verisi, izlenen depolar ve kırpılmış araç sonuçları). Yalnızca
            // özet olguları göndermek doğrulayıcıyı yapısal olarak yanıltıyordu:
            // cevap commit düzeyinde ayrıntı ya da depo üst verisi (yıldız,
            // fork, dil) içerdiğinde bu değerler doğrulayıcının gördüğü hiçbir
            // alanda bulunmuyor ve DOĞRU yanıt "uyumsuz" damgası yiyordu.
            olculenProjeksiyon: compactProjection,
            // Cevabın tamamı denetlenir. 4000 karakter sınırı yalnızca kaçak bir
            // cevabın denetim maliyetini sınırlar; tipik bir yanıt bu sınırın
            // altında kaldığı için eksiksiz denetlenir (1000 karakterlik eski
            // sınır, yanıtın üçte ikisini denetim dışı bırakıyordu).
            yapayZekaCevabi: assistantText.substring(0, 4000),
          },
          questions: {
            is_factually_aligned: {
              type: 'noul',
              instructions: 'Yapay zeka asistanının cevabı (`yapayZekaCevabi`); doğrulanmış özet telemetri kanıtları (`telemetriKanitlari`) ve sentezleyiciye verilen ölçüm projeksiyonu (`olculenProjeksiyon`: hedefDepo, izlenenDepolar, telemetriDurumu ve aracSonuclari içindeki commit/PR/hotspot/risk/sağlık kayıtları) ile uyumlu mu ve bariz bir halüsinasyon/çelişki içermiyor mu? Cevaptaki her sayısal iddia ve dosya/commit/depo atfı bu iki kaynaktan doğrulanabiliyorsa uyumludur.',
            },
          },
          // Kanıt kapısı olduğu için bir kez yeniden denenir, ancak toplam gecikmeyi sınırlı tutar.
          timeoutMs: TYPESAFE_FACT_CHECK_TIMEOUT_MS,
          maxAttempts: TYPESAFE_FACT_CHECK_MAX_ATTEMPTS,
        });

        if (verifyResult?.answers?.['is_factually_aligned']?.type === 'noul') {
          const alignmentScore = verifyResult.answers['is_factually_aligned'].noul;
          const isPassed = alignmentScore >= TYPESAFE_FACT_ALIGNMENT_THRESHOLD;
          if (!isPassed) {
            // Bu metin YALNIZCA doğrulama başarısız olduğunda üretilir; bu yüzden
            // başarısızlığı açıkça bildirir (eski metin "geçti" diyerek başarısız
            // bir kontrolü başarılı gibi gösteriyordu).
            factCheckNotice = `Bu yanıt TypeSafe AI kanıt doğrulamasından %${Math.round(alignmentScore * 100)} uyumluluk skoruyla geçemedi (eşik: %${Math.round(TYPESAFE_FACT_ALIGNMENT_THRESHOLD * 100)}) ve olgusal sapma riski taşıyor. Lütfen aşağıdaki doğrulanmış kanıt satırlarını esas alın.`;
          }
          traceSteps.push({
            step: `TypeSafe AI Kanıt & Halüsinasyon Doğrulaması (${verifyResult.model})`,
            status: isPassed ? 'completed' : 'failed',
            details: `Telemetri kanıt uyumluluk skoru: %${Math.round(alignmentScore * 100)} (${isPassed ? 'Doğrulandı - Olgusal Olarak Tutarlı' : 'Uyarı: Olası Yorum Sapması Tespit Edildi'})`,
            durationMs: Date.now() - verifyStart,
          });
        }
      } catch (err: unknown) {
        console.warn('[TypeSafe AI] Doğrulama adımı atlandı:', err instanceof Error ? err.message : String(err));
      }
    }

    // Doğrulama başarısızsa uyarı, kullanıcının gördüğü yanıtın ve yorumun içine işlenir.
    if (factCheckNotice) {
      assistantText = `${assistantText}\n\n> ⚠️ **Kanıt Doğrulama Uyarısı:** ${factCheckNotice}`;
      interpretation = `${interpretation} ${factCheckNotice}`;
    }

    const durationSeconds = Number(((Date.now() - startTime) / 1000).toFixed(2));

    const trace: AnalysisTrace = {
      id: `trace_${Date.now()}`,
      query: question,
      timestamp: new Date().toISOString(),
      steps: traceSteps,
      toolsUsed,
      dataPointsAnalyzed,
      durationSeconds: Math.max(0.5, durationSeconds),
      completed: true,
    };

    const message: AskAiMessage = {
      id: `msg_${Date.now()}`,
      role: 'assistant',
      content: assistantText,
      timestamp: new Date().toISOString(),
      facts,
      interpretation,
      evidence: evidenceItems,
      recommendedActions,
      trace,
    };

    return { message, trace };
  }

  /**
   * Gemini servisine erişilemediğinde ham ve doğrulanmış telemetri verilerini şeffaf bir şekilde sunar
   */
  private static generateTelemetryFallback(
    context: ToolExecutionContext,
    matchedRepo?: Repository
  ): string {
    const topHotspots = context.hotspots || [];
    const topRisks = context.risks || [];
    const health = context.healthScore;

    if (matchedRepo) {
      const repoCommits = context.commits.filter((c) => c.repo_name.toLowerCase() === matchedRepo.name.toLowerCase());
      const repoHotspots = topHotspots.filter((h) => h.repo_name.toLowerCase() === matchedRepo.name.toLowerCase());
      const repoRisks = topRisks.filter((r) => riskMatchesRepo(r, matchedRepo.name));
      const repoPRs = context.pullRequests.filter((p) => p.repo_name.toLowerCase() === matchedRepo.name.toLowerCase());

      const criticalHotspots = repoHotspots.slice(0, 4);
      const hotspotListStr = criticalHotspots.length > 0
        ? criticalHotspots.map((h) => `\`${h.path}\` (${h.modifications_count} değişiklik, ${h.code_churn} satır dalgalanma)`).join(', ')
        : 'Kritik dosya tespit edilmedi.';

      return `### 📡 Doğrulanmış Telemetri Kaydı: \`${matchedRepo.name}\`
*(Yapay zeka analiz motoruna şu anda ulaşılamadı. Depodan çekilen güncel telemetri kayıtları aşağıda listelenmiştir.)*

• **İncelenen Commit Hacmi:** ${repoCommits.length} commit
• **Çekme İstekleri (PR):** ${repoPRs.length} PR (${repoPRs.filter((p) => p.state === 'open').length} açık)
• **Yıldız & Fork Sayısı:** ${matchedRepo.stargazers_count} Yıldız · ${matchedRepo.forks_count} Fork
• **Öne Çıkan Kritik Dosyalar (İlk ${criticalHotspots.length}):** ${hotspotListStr}
• **Aktif Riskler:** ${repoRisks.length > 0 ? repoRisks.map((r) => `[${r.severity}] ${r.title}`).join('; ') : 'Aktif risk bulunmuyor.'}`;
    }

    const criticalGlobalHotspots = topHotspots.slice(0, 4);
    return `### 📡 Doğrulanmış Sistem Telemetri Kaydı
*(Yapay zeka analiz motoruna şu anda ulaşılamadı. Doğrudan ölçülen sistem telemetri kayıtları aşağıda listelenmiştir.)*

• **Genel Sağlık Skoru:** ${health?.hasData ? `${health.overallScore} / 100 (${health.grade})` : 'Ölçüm yok'}
• **Toplam İncelenen Commit:** ${context.commits.length} commit
• **Öne Çıkan Kritik Dosyalar (İlk ${criticalGlobalHotspots.length}):** ${criticalGlobalHotspots.length > 0 ? criticalGlobalHotspots.map((h) => `\`${h.repo_name}/${h.path}\` (${h.code_churn} satır)`).join(', ') : 'Tespit edilmedi'}
• **Aktif Mühendislik Riski:** ${topRisks.length} adet`;
  }
}
