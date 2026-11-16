import { callGeminiWithRetry } from '../gemini.js';
import { formatTrNumber } from '../../src/utils/formatters.js';
import { ACTIVITY_WINDOW_DAYS, MS_PER_DAY, RISK_LEVEL_ORDER, RISK_SEVERITY_WEIGHT, TREE_ENTRY_LIMIT } from '../constants.js';
import { isConventionalCommitHeader } from './commitClassifier.js';
import {
  Repository,
  CommitMetric,
  FileHotspot,
  EngineeringRisk,
  EngineeringHealthScore,
  TodayBriefItem,
  GitHubUser,
  RepoAiReview,
  DeveloperPersona,
  HotspotRefactorRecommendation,
} from '../../src/types.js';
import { describeRiskScope, formatMeasuredHealthDimensions } from '../../src/constants.js';
import { commitTouchesFile } from '../metrics/hotspotEngine.js';
import { Type } from '@google/genai';

interface GeminiBriefItem {
  priority?: 'HIGH' | 'MEDIUM' | 'LOW';
  title?: string;
  description?: string;
  relatedRepo?: string;
  actionable?: boolean;
  evidenceSummary?: string;
}

interface GeminiRoadmapItem {
  title?: string;
  description?: string;
  priority?: 'HIGH' | 'MEDIUM' | 'LOW';
}

/**
 * Modele ait bir diziyi yalnızca gerçekten metin olan öğelerle sınırlar.
 * Eksik alan `[]` olur: boş liste "model bu başlıkta bir şey bildirmedi"
 * anlamına gelir ve uydurulmuş maddelerden her zaman daha dürüsttür.
 */
function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

/**
 * Model yanıtı kullanılamadığında (boş gövde ya da doğrulanamayan içerik)
 * zincirin o modelde DURMAMASI için hata fırlatılır.
 *
 * `callGeminiWithRetry` geri çağrının dönüş değerini olduğu gibi dışarı verir:
 * `return null` "bu model başarısız oldu" demek değil, "hiçbir model
 * denenmesin" demektir — zincirin kalanı (bkz. GEMINI_MODEL_CHAIN) sessizce
 * atlanır. Boş yanıtı kalıcı hata sayıp sıradaki modele geçen sözleşme
 * `throw`dur (bkz. gemini.generateGeminiText); bu yardımcı aynı sözleşmeyi tek
 * yerde tutar. Mesaj `isTransientGeminiError` kalıplarının hiçbiriyle
 * eşleşmediği için kalıcı hata sayılır: geri çekilme beklemesi olmadan sıradaki
 * model denenir.
 */
function unusableModelResponse(model: string, scope: string): Error {
  return new Error(`Gemini ${model} yanıtı ${scope} için kullanılamadı.`);
}

/** Doğrulanmış yol haritası adımı (tüm alanları dolu). */
type RoadmapItem = { title: string; description: string; priority: 'HIGH' | 'MEDIUM' | 'LOW' };

/**
 * İnceleme istemine yazılan azami kritik dosya sayısı.
 *
 * Hotspot listesi ciddiyet sırasına göre gelir (bkz. HotspotEngine), bu yüzden
 * ilk N kayıt en kritik dosyalardır. Sınır olmadan, çok dosyalı bir depo
 * istemi şişirir ve modelin asıl mimari değerlendirmesi seyrekleşir.
 */
const PROMPT_HOTSPOT_LIMIT = 15;

/**
 * Bir riskin günlük bülten maddesine yazılacak önceliği.
 *
 * Tek kaynak: bu eşikleme iki maddede (en kritik risk ve ikincil risk)
 * kopyalanmıştı ve kopyalar ayrışmıştı — ikincil madde yalnızca `HIGH`ı
 * yükseltiyor, ikinci bir CRITICAL riski "ORTA" diye yayınlıyordu. Aynı
 * ölçekte iki farklı sonuç, bültenin kendi içinde tutarsız olması demektir.
 */
function riskBriefPriority(severity: EngineeringRisk['severity']): 'HIGH' | 'MEDIUM' {
  return severity === 'CRITICAL' || severity === 'HIGH' ? 'HIGH' : 'MEDIUM';
}

/** Yol haritası dizisini yalnızca başlığı olan, geçerli öncelikli öğelerle sınırlar. */
function toRoadmapArray(value: unknown): RoadmapItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is GeminiRoadmapItem => typeof item === 'object' && item !== null)
    .filter((item) => typeof item.title === 'string' && item.title.trim().length > 0)
    .map((item) => ({
      title: item.title as string,
      description: typeof item.description === 'string' ? item.description : '',
      priority: item.priority === 'HIGH' || item.priority === 'LOW' ? item.priority : 'MEDIUM',
    }));
}

/**
 * Analiz edilen commit'lerin tarihlerinden en yoğun çalışma penceresini
 * (4 saatlik kova) ölçülen bir etikete çevirir.
 *
 * Kaynak olarak GitHub punch-card telemetrisi DEĞİL, commit tarihleri
 * kullanılır. İki nedeni var: (1) punch-card ucu saatleri committer'ın yerel
 * saatine göre döndürür, bu yüzden "UTC" etiketiyle birlikte kullanılamaz;
 * commit tarihi ise gerçek UTC saatini taşır. (2) punch-card deposu seçimden
 * bağımsız olarak bir kez çekilip birleştirilir, dolayısıyla bir depo seçimden
 * çıkarıldığında eski kapsamı saymaya devam ederdi; commit listesi ise seçimle
 * birlikte filtrelendiği için ölçüm her zaman gösterilen kapsamla aynıdır.
 *
 * Veri yoksa tahmin ÜRETİLMEZ; ölçümün yapılamadığı açıkça yazılır.
 */
function deriveDominantWorkingHours(commits: CommitMetric[]): string {
  const hours: number[] = [];
  for (const commit of commits) {
    const timestamp = new Date(commit.date);
    if (Number.isFinite(timestamp.getTime())) {
      hours.push(timestamp.getUTCHours());
    }
  }

  if (hours.length === 0) {
    return 'Telemetri yetersiz (commit tarihi yok)';
  }

  // Saatler 4 saatlik pencerelere indirgenir ve en yoğun pencere seçilir.
  const bucketCounts = new Map<number, number>();
  for (const hour of hours) {
    const bucketStart = Math.floor(hour / 4) * 4;
    bucketCounts.set(bucketStart, (bucketCounts.get(bucketStart) || 0) + 1);
  }

  let busiestStart = 0;
  let busiestCount = -1;
  for (const [bucketStart, count] of bucketCounts) {
    if (count > busiestCount) {
      busiestStart = bucketStart;
      busiestCount = count;
    }
  }

  const clockHour = (value: number) => `${String(value % 24).padStart(2, '0')}:00`;
  const share = Math.round((busiestCount / hours.length) * 100);
  return `${clockHour(busiestStart)}-${clockHour(busiestStart + 4)} (UTC) · commit'lerin %${share}'i`;
}

/**
 * Mühendislik içgörüleri ve günlük özet bültenlerini üreten yapay zeka ve dinamik telemetri motoru
 */
export class InsightsEngine {
  /**
   * Gemini sentezi ve dinamik telemetriye dayalı Günün Mühendislik Özeti maddelerini üretir.
   *
   * `reposWithTelemetry`, commit telemetrisi bulunan depoların (küçük harfli)
   * adlarını taşır. "En istikrarlı depo" gibi karşılaştırmalı ifadeler yalnızca
   * bu küme üzerinden kurulur; aksi halde hiç incelenmemiş bir depo 0 risk
   * üretip veri yokluğunu başarı gibi gösterirdi.
   */
  public static async generateDailyBrief(
    repositories: Repository[],
    hotspots: FileHotspot[],
    risks: EngineeringRisk[],
    healthScore: EngineeringHealthScore,
    reposWithTelemetry: ReadonlySet<string>
  ): Promise<TodayBriefItem[]> {
    if (!healthScore.hasData) {
      return [
        {
          id: 'brief_no_data',
          priority: 'MEDIUM',
          title: 'GitHub telemetrisi bekleniyor',
          description: 'Günlük mühendislik bülteni oluşturmak için önce GitHub hesabınızı bağlayıp depoları eşitleyin.',
          relatedRepo: repositories[0]?.name || 'Sistem',
          actionable: true,
          evidenceSummary: 'Henüz doğrulanmış commit, PR veya issue kaydı bulunmuyor.',
        },
      ];
    }

    // 1. Gerçek telemetri metriklerinden doğrudan türetilen dinamik özet maddeleri oluştur
    const dynamicBriefItems: TodayBriefItem[] = [];

    // "En kritik risk", ciddiyet sırasına göre seçilir. RiskEngine riskleri yapı
    // sırasına göre döndürür (önce hotspot, sonra teslimat, teknik borç...), bu
    // yüzden `risks[0]` en ciddi risk DEĞİLDİR: aynı blokta birden çok hotspot
    // riski üretildiğinde ilk kayıt HIGH olurken sonraki CRITICAL olabilir ve
    // brifing başlığı yanlış riski "en kritik" diye sunardı. Sıralama kararlıdır
    // (eşit ciddiyette yapı sırası korunur), ölçek tek kaynaktan gelir
    // (RISK_LEVEL_ORDER); eksik/bozuk bir seviye NaN üretmesin diye 0'a düşülür.
    const orderedRisks = [...risks].sort(
      (a, b) => (RISK_LEVEL_ORDER[b.severity] ?? 0) - (RISK_LEVEL_ORDER[a.severity] ?? 0),
    );

    // En kritik risk maddesi
    if (orderedRisks.length > 0) {
      const topRisk = orderedRisks[0];
      dynamicBriefItems.push({
        id: `brief_risk_${topRisk.id}`,
        priority: riskBriefPriority(topRisk.severity),
        title: topRisk.title,
        description: topRisk.summary,
        relatedRepo: describeRiskScope(topRisk),
        actionable: true,
        evidenceSummary: topRisk.evidence[0] ? `${topRisk.evidence[0].metric}: ${topRisk.evidence[0].value}` : `Güven Skoru: %${topRisk.confidence}`,
      });
    }

    // En öncelikli Sıcak Nokta (Hotspot) maddesi
    if (hotspots.length > 0) {
      const topHotspot = hotspots[0];
      const fileName = (topHotspot.path && typeof topHotspot.path === 'string') ? (topHotspot.path.split('/').pop() || topHotspot.path) : 'modül';
      dynamicBriefItems.push({
        id: `brief_hotspot_${topHotspot.repo_name}_${fileName}`,
        priority: topHotspot.risk_level === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
        title: `${topHotspot.repo_name} deposunda kritik kod dosyası: ${fileName}`,
        description: `${topHotspot.path} dosyası ${topHotspot.modifications_count} kez değiştirildi ve ${topHotspot.bug_fix_commits_count} hata düzeltmesi içeriyor (${formatTrNumber(topHotspot.code_churn)} satır kod dalgalanması).`,
        relatedRepo: topHotspot.repo_name,
        actionable: true,
        evidenceSummary: `${topHotspot.modifications_count} commit, ${topHotspot.bug_fix_commits_count} hata düzeltmesi, ${topHotspot.code_churn} satır kod dalgalanması.`,
      });
    }

    // İkinci Sıcak Nokta veya İkincil Risk
    if (hotspots.length > 1) {
      const secondHotspot = hotspots[1];
      const fileName = (secondHotspot.path && typeof secondHotspot.path === 'string') ? (secondHotspot.path.split('/').pop() || secondHotspot.path) : 'modül';
      dynamicBriefItems.push({
        id: `brief_hotspot_${secondHotspot.repo_name}_${fileName}`,
        priority: 'MEDIUM',
        title: `${secondHotspot.repo_name}/${fileName} üzerinde tekrarlayan kod dalgalanması`,
        description: `${secondHotspot.path} dosyası ${secondHotspot.contributors_count} geliştirici tarafından ${secondHotspot.modifications_count} kez güncellendi.`,
        relatedRepo: secondHotspot.repo_name,
        actionable: true,
        evidenceSummary: `${secondHotspot.contributors_count} geliştirici tarafından ${secondHotspot.modifications_count} commit.`,
      });
    } else if (orderedRisks.length > 1) {
      const secondRisk = orderedRisks[1];
      dynamicBriefItems.push({
        id: `brief_risk_${secondRisk.id}`,
        priority: riskBriefPriority(secondRisk.severity),
        title: secondRisk.title,
        description: secondRisk.summary,
        relatedRepo: describeRiskScope(secondRisk),
        actionable: true,
        evidenceSummary: secondRisk.evidence[0] ? `${secondRisk.evidence[0].metric}: ${secondRisk.evidence[0].value}` : `Güven Skoru: %${secondRisk.confidence}`,
      });
    }

    // Sağlık Skoru / Mimari Başarı Maddesi
    // Depo başına risk maruziyeti, risk sayısına ek olarak ciddiyetle de
    // ağırlıklandırılır: tek bir CRITICAL risk, üç LOW riskten daha ağır bir
    // maruziyettir ve salt sayım bunu kaçırırdı. Adlar küçük harfe indirgenerek
    // eşlenir, böylece büyük/küçük harf farkı sayımı sıfırlamaz.
    const exposureByRepo = new Map<string, { weighted: number; count: number; critical: number }>();
    for (const risk of risks) {
      if (!risk.affectedRepository) continue;
      const key = risk.affectedRepository.toLowerCase();
      const entry = exposureByRepo.get(key) || { weighted: 0, count: 0, critical: 0 };
      entry.weighted += RISK_SEVERITY_WEIGHT[risk.severity] ?? 1;
      entry.count += 1;
      if (risk.severity === 'CRITICAL') entry.critical += 1;
      exposureByRepo.set(key, entry);
    }

    // Yalnızca telemetrisi olan depolar yarışır: hiç commit'i incelenmemiş bir
    // depo tanım gereği 0 risk üretir ve aksi halde "en istikrarlı" seçilirdi.
    const stableCandidates = repositories.filter((repo) =>
      reposWithTelemetry.has(repo.name.toLowerCase()),
    );
    const mostStableRepo = stableCandidates.sort((a, b) => {
      const exposureDiff =
        (exposureByRepo.get(a.name.toLowerCase())?.weighted || 0) -
        (exposureByRepo.get(b.name.toLowerCase())?.weighted || 0);
      return exposureDiff !== 0 ? exposureDiff : a.name.localeCompare(b.name);
    })[0];

    if (mostStableRepo) {
      const exposure = exposureByRepo.get(mostStableRepo.name.toLowerCase());
      const stableRepoRiskCount = exposure?.count || 0;
      const criticalRiskCount = exposure?.critical || 0;
      const severityDetail = criticalRiskCount > 0
        ? ` (${criticalRiskCount} tanesi kritik)`
        : '';
      // Ölçüt metinde AÇIKÇA söylenir ve kanıt, ölçütün bileşenleridir.
      // Sıralama ciddiyet ağırlıklı maruziyete göre yapılırken kanıt olarak
      // yalnızca sayıyı basmak, 1 kritik riskli depoyu 3 düşük riskli depodan
      // "istikrarlı" ilan ederken ekranda 3 risk gösterirdi; okuyucu için
      // sayı iddiayı desteklemez, hatta çelişir görünürdü. Ağırlıklı toplam ise
      // kullanıcının doğrulayamayacağı sentetik bir puandır, bu yüzden kanıt
      // olarak değil, ölçütün adı olarak metne girer.
      dynamicBriefItems.push({
        id: `brief_opp_${mostStableRepo.id}`,
        priority: 'OPPORTUNITY',
        title: `${mostStableRepo.name} deposu en düşük risk maruziyetinde`,
        description: `${mostStableRepo.name} deposu, telemetrisi incelenen ${stableCandidates.length} depo arasında en düşük risk maruziyetine sahip. Maruziyet, risklerin ciddiyet ağırlığıyla toplanmasıyla ölçülür; bu depoda ${stableRepoRiskCount} tespit edilmiş mühendislik riski var${severityDetail}. Depolar genelindeki sağlık skoru ${healthScore.overallScore}/100 olarak hesaplandı.`,
        relatedRepo: mostStableRepo.name,
        actionable: false,
        evidenceSummary: `${mostStableRepo.name} için tespit edilen risk sayısı: ${stableRepoRiskCount}${severityDetail}; sıralama ciddiyet ağırlıklı maruziyete göredir. Genel sağlık skoru: ${healthScore.overallScore}/100 (${healthScore.grade}).`,
      });
    }

    // Yeterli dinamik madde üretilemediğinde (ör. dar telemetri) brifing,
    // tümüyle ÖLÇÜLMÜŞ genel sağlık maddesiyle tamamlanır. Bu TEK bir maddedir;
    // sayıyı dörtlemek için ölçümsüz dolgu maddeleri üretmek "hiçbir sahte veri
    // yok" kuralını çiğnerdi (bkz. README).
    if (dynamicBriefItems.length < 4) {
      dynamicBriefItems.push({
        id: `brief_health_global`,
        priority: healthScore.overallScore < 70 ? 'HIGH' : 'MEDIUM',
        title: `Genel mühendislik sağlığı ${healthScore.overallScore}/100 olarak hesaplandı`,
        // Genel skor ölçülmüş boyutlardan hesaplandığı için her zaman
        // ölçülmüş bir değerdir; boyut dökümü de aynı kurala uyar ve YALNIZCA
        // ölçülmüş boyutlardan kurulur. `dimensions` sözlüğü ölçülmemiş boyut
        // için de 0 taşır; süzgeçsiz yazım (bu madde tam olarak dar telemetrili
        // kapsamlarda üretildiği için) "Kod Sağlığı: 0" gibi ölçüm yokluğunu
        // ölçülmüş sıfır gibi gösteren bir satır basardı (bkz. src/constants.ts
        // -> formatMeasuredHealthDimensions).
        description: formatMeasuredHealthDimensions(
          healthScore,
          ['codeHealth', 'delivery', 'documentation'],
          'Bu kapsamda ölçülebilen bir sağlık boyutu bulunmuyor.',
        ),
        relatedRepo: repositories[0]?.name || 'Sistem',
        actionable: healthScore.overallScore < 75,
        evidenceSummary: `Genel skor ${healthScore.overallScore}/100, Seviye: ${healthScore.grade}.`,
      });
    }

    // Portföy geneli riskler tek bir depoya atfedilemez: bu kayıtlarda
    // `affectedRepository` boştur (bkz. RiskEngine). Kapsam etiketiyle
    // anılırlar; ham alan yazılırsa istem "': <başlık>'" gibi sahipsiz bir
    // satır taşır ve model riski kapsamsız sentezler.
    const riskScopeSummary = risks.map((r) => `${describeRiskScope(r)}: ${r.title}`).join('; ');

    // 2. Gemini Yapay Zekası ile Türkçe Özet Sentezi (Model Zinciri)
    const prompt = `GÖREV: Aşağıdaki mühendislik telemetri verilerini analiz ederek Türkçe bir mühendislik bülteni oluştur.
KESİNLİKLE UYULMASI GEREKEN KURALLAR:
1. TÜM metinler (title, description, evidenceSummary) İSTİSNASIZ %100 TÜRKÇE olmalıdır.
2. ASLA İngilizce başlık yazma!
   - YANLIŞ: "High change volatility & bug concentration in service.ts"
   - DOĞRU: "service.ts dosyasında yüksek değişim oynaklığı ve hata yoğunluğu"
   - YANLIŞ: "Code hotspot in Repo: file.ts"
   - DOĞRU: "Repo deposunda kritik kod dosyası: file.ts"
   - YANLIŞ: "Recurring churn in Repo/file.ts"
   - DOĞRU: "Repo/file.ts üzerinde tekrarlayan kod dalgalanması"
   - YANLIŞ: "Exemplary engineering hygiene in Repo"
   - DOĞRU: "Repo deposunda örnek mühendislik disiplini"
3. Çıktıyı aşağıdaki JSON şemasına uygun 4 maddelik bir dizi olarak döndür:
[
  {
    "priority": "HIGH" | "MEDIUM" | "LOW" | "OPPORTUNITY",
    "title": "Türkçe başlık",
    "description": "Türkçe açıklama",
    "relatedRepo": "DepoAdı",
    "actionable": true,
    "evidenceSummary": "Türkçe kanıt özeti"
  }
]

Veriler:
Genel Sağlık Skoru: ${healthScore.overallScore}
Öne Çıkan Kritik Dosyalar: ${hotspots.slice(0, 3).map((h) => `${h.repo_name}/${h.path} (${h.modifications_count} değişiklik, ${h.code_churn} satır)`).join(', ')}
Aktif Riskler: ${riskScopeSummary}
`;

    const aiResult = await callGeminiWithRetry(async (gemini, model, signal, thinkingConfig) => {
      const response = await gemini.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          abortSignal: signal,
          ...(thinkingConfig ? { thinkingConfig } : {}),
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                priority: { type: Type.STRING },
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                relatedRepo: { type: Type.STRING },
                actionable: { type: Type.BOOLEAN },
                evidenceSummary: { type: Type.STRING },
              },
              required: ['priority', 'title', 'description', 'relatedRepo', 'actionable', 'evidenceSummary'],
            },
          },
        },
      });

      if (response.text) {
        const parsed = JSON.parse(response.text.trim());
        if (Array.isArray(parsed) && parsed.length > 0) {
          return (parsed as GeminiBriefItem[]).map((item, idx: number) => ({
            id: `brief_ai_${idx}_${Date.now()}`,
            priority: item.priority || 'MEDIUM',
            title: item.title || 'Mühendislik Güncellemesi',
            description: item.description || '',
            relatedRepo: item.relatedRepo || 'Genel',
            actionable: item.actionable ?? true,
            evidenceSummary: item.evidenceSummary || '',
          }));
        }
      }
      throw unusableModelResponse(model, 'günlük brifing maddeleri');
    }, 1, undefined, undefined, { task: 'brief_persona' });

    if (aiResult && aiResult.length > 0) {
      return aiResult;
    }

    return dynamicBriefItems;
  }

  /**
   * Belirli bir GitHub deposu için Yapay Zeka (Gemini) Kod & Mimari İncelemesi gerçekleştirir.
   *
   * Yapay zeka katmanı yanıt üretemezse `null` döner. Bilinçli olarak bir
   * şablon/ varsayılan inceleme DÖNDÜRÜLMEZ: uydurulmuş bir kalite skoru ve
   * genel geçer maddeler, gerçek bir ölçüm gibi sunulduğunda kullanıcıyı
   * yanıltır. Çağıran katman `null` durumunu açık bir hata olarak raporlar.
   */
  public static async reviewRepository(
    repo: Repository,
    commits: CommitMetric[],
    hotspots: FileHotspot[],
    fileTree: string[] = []
  ): Promise<RepoAiReview | null> {
    const repoCommits = commits.filter(c => c.repo_name.toLowerCase() === repo.name.toLowerCase());
    const repoHotspots = hotspots.filter(h => h.repo_name.toLowerCase() === repo.name.toLowerCase());

    const prompt = `Sen Kıdemli Yazılım Mimarı ve Kod Kalitesi Liderisin (Staff Principal Architect).
Aşağıdaki GitHub deposunun telemetrisini ve geliştirme geçmişini inceleyerek Türkçe, kapsamlı ve uygulanabilir bir "AI Depo Kod & Mimari İnceleme Raporu" oluştur.

DEPO AYRINTILARI:
- Depo Adı: ${repo.name} (${repo.full_name})
- Birincil Dil: ${repo.language}
- Açıklama: ${repo.description}
- Yıldız: ${repo.stargazers_count}, Fork: ${repo.forks_count}
${repo.latest_ci_run ? `- CI/CD Durumu: ${repo.latest_ci_run.name} (${repo.latest_ci_run.conclusion || repo.latest_ci_run.status})` : ''}
${repo.latest_release ? `- En Son Sürüm: ${repo.latest_release.tag_name} (${repo.latest_release.published_at.slice(0, 10)})` : ''}
${repo.languages && Object.keys(repo.languages).length > 0 ? `- Diller (Hacim): ${Object.entries(repo.languages).map(([l, b]) => `${l} (${Math.round(b / 1024)} KB)`).join(', ')}` : ''}
- Son Güncelleme: ${repo.updated_at}
- Analiz Edilen Commit Hacmi: ${repoCommits.length} commit
- Tespit Edilen Kritik Dosyalar: ${repoHotspots.slice(0, PROMPT_HOTSPOT_LIMIT).map(h => `${h.path} (${h.modifications_count} değişiklik, ${h.code_churn} satır)`).join(', ') || 'Temiz (Kritik dosya yok)'}
${fileTree.length > 0 ? `- Proje Dosya ve Klasör Hiyerarşisi (Ağaç Görünümü):\n${fileTree.slice(0, TREE_ENTRY_LIMIT).map(f => `  • ${f}`).join('\n')}` : ''}
- Son Commit Mesajları:
${repoCommits.slice(0, 12).map(c => `- ${c.message} (+${c.additions}/-${c.deletions})`).join('\n') || '- Doğrudan commit kaydı bulunamadı'}

İSTENEN FORMAT (YALNIZCA GEÇERLİ JSON):
{
  "repoName": "${repo.name}",
  "architectureOverview": "Deponun teknoloji yığını, kod organizasyonu ve genel mühendislik olgunluğu hakkında 2-3 cümlelik Türkçe profesyonel değerlendirme.",
  "codeQualityScore": 86,
  "strengths": [
    "Güçlü mimari yön 1",
    "Güçlü yön 2",
    "Güçlü yön 3"
  ],
  "technicalDebts": [
    "Gözlemlenen teknik borç veya geliştirme fırsatı 1",
    "Alan 2"
  ],
  "securityObservations": [
    "Güvenlik, API anahtarı hijyeni veya bağımlılık gözlemi 1",
    "Gözlem 2"
  ],
  "recommendedRoadmap": [
    { "title": "Öncelikli Mimari Adım", "description": "Detaylı açıklama", "priority": "HIGH" },
    { "title": "İkinci Adım", "description": "Detaylı açıklama", "priority": "MEDIUM" },
    { "title": "Uzun Vadeli İyileştirme", "description": "Detaylı açıklama", "priority": "LOW" }
  ]
}`;

    /**
     * Model `architectureOverview` alanını boş bırakırsa kullanılacak özet.
     * Cümledeki her değer ölçülmüş telemetriden gelir; uydurulmuş bir anlatım
     * veya varsayılan bir kalite skoru içermez.
     */
    const telemetryOverview =
      `${repo.name} deposu ${repo.language} diliyle geliştirilmiş olup incelenen dönemde ` +
      `${repoCommits.length} commit içermektedir.`;

    try {
      const result = await callGeminiWithRetry(async (gemini, model, signal, thinkingConfig) => {
        const response = await gemini.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            abortSignal: signal,
            ...(thinkingConfig ? { thinkingConfig } : {}),
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                repoName: { type: Type.STRING },
                architectureOverview: { type: Type.STRING },
                codeQualityScore: { type: Type.INTEGER },
                strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
                technicalDebts: { type: Type.ARRAY, items: { type: Type.STRING } },
                securityObservations: { type: Type.ARRAY, items: { type: Type.STRING } },
                recommendedRoadmap: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      description: { type: Type.STRING },
                      priority: { type: Type.STRING },
                    },
                    required: ['title', 'description', 'priority'],
                  },
                },
              },
              // Alanlar zorunlu tutulur: eksik bir yanıt tahminle doldurulmaz
              // (bkz. aşağıdaki kalite skoru doğrulaması).
              required: [
                'repoName',
                'architectureOverview',
                'codeQualityScore',
                'strengths',
                'technicalDebts',
                'securityObservations',
                'recommendedRoadmap',
              ],
            },
          },
        });
        if (!response.text) throw unusableModelResponse(model, `${repo.name} incelemesi`);

        const parsed = JSON.parse(response.text.trim());
        // Kalite skoru ölçülemediyse inceleme bütünüyle kullanılamaz sayılır:
        // eksik bir ölçümü tahminle doldurmak (`|| 85` gibi) kullanıcıya
        // gerçekmiş gibi görünen uydurma bir puan gösterirdi.
        //
        // Model sayıyı metin olarak da dönebilir; bu yüzden boş olmayan sayısal
        // metin kabul edilir. Doğrudan `Number(...)` kullanılmaz: `Number(null)`
        // ve `Number('')` sonlu 0 döndürdüğü için eksik alan "0/100" olarak
        // yayınlanırdı (ölçülmemiş depo, sıfır puanlı sanılırdı).
        const rawCodeQuality = parsed.codeQualityScore;
        const rawScore =
          typeof rawCodeQuality === 'number'
            ? rawCodeQuality
            : typeof rawCodeQuality === 'string' && rawCodeQuality.trim() !== ''
              ? Number(rawCodeQuality)
              : Number.NaN;
        if (!Number.isFinite(rawScore)) {
          throw unusableModelResponse(model, `${repo.name} incelemesi (geçerli kalite skoru yok)`);
        }

        return {
          repoName: repo.name,
          architectureOverview:
            typeof parsed.architectureOverview === 'string' && parsed.architectureOverview.trim()
              ? parsed.architectureOverview
              : telemetryOverview,
          codeQualityScore: Math.min(100, Math.max(0, Math.round(rawScore))),
          strengths: toStringArray(parsed.strengths),
          technicalDebts: toStringArray(parsed.technicalDebts),
          securityObservations: toStringArray(parsed.securityObservations),
          recommendedRoadmap: toRoadmapArray(parsed.recommendedRoadmap),
          reviewedAt: new Date().toISOString(),
        };
      }, 1, undefined, undefined, { task: 'repo_review' });

      return result;
    } catch (e) {
      console.warn(`[DevControl AI] ${repo.name} için yapay zeka inceleme üretilemedi:`, e);
      return null;
    }
  }

  /**
   * Kullanıcının GitHub telemetrisine göre "Geliştirici Profili & Üretkenlik Karnesi" üretir.
   *
   * Yapay zeka anlatımı üretilemezse profil, doğrudan ölçülen telemetriden
   * türetilen deterministik sürümle döner (bkz. `telemetryPersona`) — asla
   * uydurulmuş bir saat, oran veya skorla değil.
   */
  public static async generateDeveloperPersona(
    user: GitHubUser,
    repositories: Repository[],
    commits: CommitMetric[]
  ): Promise<DeveloperPersona> {
    const langCounts: Record<string, number> = {};
    repositories.forEach(r => {
      if (r.language) {
        langCounts[r.language] = (langCounts[r.language] || 0) + 1;
      }
    });
    const totalWithLang = Object.values(langCounts).reduce((a, b) => a + b, 0) || 1;
    const primaryLanguages = Object.entries(langCounts)
      .map(([name, count]) => ({ name, percentage: Math.round((count / totalWithLang) * 100) }))
      .sort((a, b) => b.percentage - a.percentage)
      .slice(0, 5);

    const bugFixCount = commits.filter(c => c.is_bug_fix).length;
    const bugFixRate = commits.length > 0 ? Math.round((bugFixCount / commits.length) * 100) : 0;

    // Haftalık pencerenin commit sayısı, çağıranın hangi kümeyi geçtiğinden
    // bağımsız olarak tarihlerden ölçülür; etiket ile ölçüm her zaman aynı şeyi
    // anlatır (pencere tek kaynaktan: ACTIVITY_WINDOW_DAYS).
    const sevenDaysAgo = Date.now() - ACTIVITY_WINDOW_DAYS * MS_PER_DAY;
    const weeklyCommits = commits.filter((c) => {
      const timestamp = new Date(c.date).getTime();
      return Number.isFinite(timestamp) && timestamp >= sevenDaysAgo;
    });

    // Ölçüt: Konvansiyonel Commits **başlık biçimi** (bkz. isConventionalCommitHeader).
    // `ai_category` bu iş için kullanılamaz: kural tabanlı ön sınıflandırma her
    // commit'e bir kategori atadığı için oran yapısal olarak her zaman %100
    // çıkardı — yani ölçüm değil, sabit bir değer.
    const conventionalHeaderCount = commits.filter((commit) =>
      isConventionalCommitHeader(commit.message),
    ).length;

    // Ölçülecek commit yoksa oran hesaplanamaz: "%0 hijyen" demek yanlış bir
    // ölçüm olurdu, bu yüzden ölçülemediği açıkça yazılır.
    const conventionalCommitHygiene = commits.length === 0
      ? 'Analiz edilecek commit yok'
      : `%${Math.round((conventionalHeaderCount / commits.length) * 100)} konvansiyonel commit formatı (${conventionalHeaderCount}/${commits.length})`;

    const dominantLanguage = primaryLanguages[0]?.name;

    /**
     * Yapay zeka katmanı kullanılamadığında gösterilen profil. Cümledeki tüm
     * değerler ölçülmüş telemetriden gelir; uydurulmuş bir saat, oran veya
     * başlık içermez. Üretken alanlar (güçlü yönler / tavsiyeler) boş bırakılır
     * — kanıt olmadan övgü veya tavsiye yazmak yanıltıcı olurdu.
     */
    const telemetryPersona: DeveloperPersona = {
      personaTitle: dominantLanguage ? `${dominantLanguage} Geliştirici Profili` : 'Çok Dilli Geliştirici Profili',
      summary:
        `${user.name || user.login}, analiz kapsamındaki ${repositories.length} depoda son ${ACTIVITY_WINDOW_DAYS} günde ` +
        `${weeklyCommits.length} commit üretti` +
        (dominantLanguage ? ` ve ağırlıklı olarak ${dominantLanguage} ile çalışıyor` : '') +
        '. Bu profil, yapay zeka anlatımı olmadan doğrudan telemetriden türetilmiştir.',
      primaryLanguages,
      productivityMetrics: {
        weeklyCommitFrequency: weeklyCommits.length,
        dominantWorkingHours: deriveDominantWorkingHours(commits),
        conventionalCommitHygiene,
      },
      superpowers: [],
      growthAreas: [],
      analyzedAt: new Date().toISOString(),
    };

    // Analiz edilecek commit yoksa model HİÇ çağrılmaz. Sıfır telemetri
    // üzerinden unvan, özet ve "süper güç" yazdırmak, ölçülmemiş bir profili
    // ölçüm gibi sunmanın en kolay yoludur; bu durumda doğrudan ölçülen
    // deterministik profil döner (boş seçimde de aynı yol izlenir).
    if (commits.length === 0) {
      console.log('[DevControl AI] Analiz edilecek commit yok; geliştirici profili ölçülen telemetriden döndürülüyor.');
      return telemetryPersona;
    }

    try {
      const prompt = `Sen Kıdemli Mühendislik Yöneticisisin (Staff Engineering Manager).
Aşağıdaki doğrulanmış geliştirici telemetrisini inceleyerek profesyonel, motive edici ve isabetli bir "Yapay Zeka Geliştirici Profili (Developer Persona)" oluştur.

GELİŞTİRİCİ VERİLERİ:
- İsim: ${user.name} (@${user.login})
- Biyografi: ${user.bio || 'Yazılım Geliştirici'}
- Toplam Kişisel Depoları: ${repositories.length} depo
- Dil Dağılımı: ${primaryLanguages.map(l => `${l.name}: %${l.percentage}`).join(', ') || 'Bilinmiyor'}
- Son ${ACTIVITY_WINDOW_DAYS} Günde Üretilen Commit Sayısı: ${weeklyCommits.length}
- Analiz Edilen Commitlerde Hata Düzeltme Oranı: %${bugFixRate}
- Konvansiyonel Commit Formatı Oranı: ${conventionalCommitHygiene}
- En Yoğun Çalışma Penceresi (commit tarihleri, UTC): ${telemetryPersona.productivityMetrics.dominantWorkingHours}
- Tipik Commit Başlıkları:
${commits.slice(0, 15).map(c => `- ${c.message}`).join('\n') || '- Doğrudan commit bulunmuyor'}

İSTENEN FORMAT (YALNIZCA GEÇERLİ JSON):
{
  "personaTitle": "Örn: Modern Full-Stack Mimarı & Sistem Mühendisi",
  "summary": "Geliştiricinin güçlü teknik kaslarını, üretim temposunu ve uzmanlık alanını özetleyen 2-3 cümlelik Türkçe paragraf.",
  "superpowers": [
    "Süper Güç 1 (YALNIZCA yukarıdaki telemetriyle kanıtlanabilir bir tespit)",
    "Süper Güç 2",
    "Süper Güç 3"
  ],
  "growthAreas": [
    "Gelişim Alanı 1 (telemetriden çıkan somut mühendislik tavsiyesi)",
    "Gelişim Alanı 2"
  ]
}

ÖNEMLİ: Yalnızca anlatı alanlarını (personaTitle, summary, superpowers,
growthAreas) üret. Ölçüm alanları (dil dağılımı, üretkenlik metrikleri) zaten
telemetriden alındığı için senden istenmez; tahmin veya varsayılan değer üretme.`;

      const aiPersona = await callGeminiWithRetry(async (gemini, model, signal, thinkingConfig) => {
        const response = await gemini.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            abortSignal: signal,
            ...(thinkingConfig ? { thinkingConfig } : {}),
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                personaTitle: { type: Type.STRING },
                summary: { type: Type.STRING },
                superpowers: { type: Type.ARRAY, items: { type: Type.STRING } },
                growthAreas: { type: Type.ARRAY, items: { type: Type.STRING } }
              },
              required: ['personaTitle', 'summary', 'superpowers', 'growthAreas']
            }
          },
        });
        if (!response.text) throw unusableModelResponse(model, 'geliştirici profili');

        const parsed = JSON.parse(response.text.trim());

        return {
          personaTitle:
            typeof parsed.personaTitle === 'string' && parsed.personaTitle.trim()
              ? parsed.personaTitle
              : telemetryPersona.personaTitle,
          summary:
            typeof parsed.summary === 'string' && parsed.summary.trim()
              ? parsed.summary
              : telemetryPersona.summary,
          // Ölçüm alanları modelden DEĞİL, telemetriden alınır (bkz. aşağıdaki
          // productivityMetrics). Dil dağılımı da bir ölçümdür: model farklı bir
          // liste döndürürse (ör. depolarda hiç olmayan bir dil ve keyfi bir
          // yüzde) kullanıcıya ölçüm gibi sunulurdu, bu yüzden dil listesi de
          // doğrudan `repo.language` sayımından gelir.
          primaryLanguages,
          productivityMetrics: {
            // Ölçüm alanları modelden DEĞİL, telemetriden alınır: model bir
            // sayı/oran uydurursa kullanıcıya yanlış bir ölçüm gösterilirdi.
            weeklyCommitFrequency: telemetryPersona.productivityMetrics.weeklyCommitFrequency,
            dominantWorkingHours: telemetryPersona.productivityMetrics.dominantWorkingHours,
            conventionalCommitHygiene: telemetryPersona.productivityMetrics.conventionalCommitHygiene,
          },
          superpowers: toStringArray(parsed.superpowers),
          growthAreas: toStringArray(parsed.growthAreas),
          analyzedAt: new Date().toISOString(),
        };
      }, 1, undefined, undefined, { task: 'brief_persona' });

      return aiPersona || telemetryPersona;
    } catch (e) {
      console.warn('[DevControl AI] Geliştirici profili üretilirken hata:', e);
      return telemetryPersona;
    }
  }

  /**
   * Sıcak nokta dosyaları için somut kod refactoring önerisi ve tasarım deseni üretir.
   *
   * Bu uç tamamen yapay zeka çıktısına dayanır: anti-pattern teşhisi, tasarım
   * deseni seçimi ve örnek kod yalnızca model tarafından üretilebilir. Bu
   * yüzden yapay zeka kullanılamadığında `null` döner ve çağıran bunu açık bir
   * hata olarak raporlar — şablon bir "teşhis" ve uydurma bir kazanım yüzdesi
   * göstermek kullanıcıyı yanıltırdı.
   */
  public static async suggestHotspotRefactoring(
    hotspot: FileHotspot,
    commits: CommitMetric[]
  ): Promise<HotspotRefactorRecommendation | null> {
    // Dosyaya dokunan commit'ler, hotspot motorunun KENDİ eşleştirme kuralıyla
    // seçilir (bkz. commitTouchesFile): `affected_files` listesine bakan elle
    // yazılmış bir filtre, `files` dizisi dolu olan commit'leri kaçırır ve
    // hotspot'un "şu kadar commit değiştirdi" ölçümüyle çelişen bir commit
    // örneklemi üretirdi (ör. "yakın commit mesajı yok").
    const relevantCommits = commits.filter((commit) =>
      commitTouchesFile(commit, hotspot.repo_name, hotspot.path),
    );

    try {
      const prompt = `Sen Kıdemli Yazılım Refactoring Uzmanısın.
Aşağıda çok sık değişen ve hata içeren kritik kod dosyası (hotspot) için Türkçe somut bir yeniden yapılandırma (refactor) planı üret.

DOSYA BİLGİSİ:
- Dosya: ${hotspot.path} (Depo: ${hotspot.repo_name})
- Dil: ${hotspot.language}
- Değişiklik Sıklığı: ${hotspot.modifications_count} commit
- Kod Dalgalanması: ${hotspot.code_churn} satır
- Hata Düzeltme Sayısı: ${hotspot.bug_fix_commits_count} commit
- Dosyayı Değiştiren Commit Örnekleri:
${relevantCommits.slice(0, 5).map(c => `- ${c.message}`).join('\n') || '- Yakın commit mesajı yok'}

İSTENEN FORMAT (YALNIZCA GEÇERLİ JSON):
{
  "filePath": "${hotspot.path}",
  "repoName": "${hotspot.repo_name}",
  "antiPatternsDetected": [
    "Anti-Pattern 1 (Örn: Tanrı Nesnesi / Aşırı Sorumluluk)",
    "Anti-Pattern 2"
  ],
  "proposedDesignPattern": "Önerilen Tasarım Deseni veya Mimari Prensip (Örn: Strategy Pattern, Facade Pattern, Hook Extraction)",
  "refactorSteps": [
    "Adım 1: Somut ve uygulanabilir",
    "Adım 2",
    "Adım 3"
  ],
  "sampleCodeSnippet": "// TypeScript/JavaScript ile örnek arayüz veya ayrıştırma kodu...",
  "expectedImpact": "Beklenen fayda ve regresyon azalması özeti"
}`;

      const aiRec = await callGeminiWithRetry(async (gemini, model, signal, thinkingConfig) => {
        const response = await gemini.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            abortSignal: signal,
            ...(thinkingConfig ? { thinkingConfig } : {}),
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                filePath: { type: Type.STRING },
                repoName: { type: Type.STRING },
                antiPatternsDetected: { type: Type.ARRAY, items: { type: Type.STRING } },
                proposedDesignPattern: { type: Type.STRING },
                refactorSteps: { type: Type.ARRAY, items: { type: Type.STRING } },
                sampleCodeSnippet: { type: Type.STRING },
                expectedImpact: { type: Type.STRING },
              },
              required: [
                'antiPatternsDetected',
                'proposedDesignPattern',
                'refactorSteps',
                'expectedImpact',
              ],
            },
          },
        });
        if (!response.text) throw unusableModelResponse(model, `${hotspot.path} refactor önerisi`);

        const parsed = JSON.parse(response.text.trim());
        const refactorSteps = toStringArray(parsed.refactorSteps);
        const proposedDesignPattern =
          typeof parsed.proposedDesignPattern === 'string' ? parsed.proposedDesignPattern.trim() : '';
        // Beklenen etki kartın tek gövde metnidir; boş ya da metin olmayan bir
        // değer kartı gerekçesiz bırakır, bu yüzden ölçüt adımlarla aynıdır.
        const expectedImpact =
          typeof parsed.expectedImpact === 'string' ? parsed.expectedImpact.trim() : '';

        // Öneri, somut adımları, bir tasarım yönü ve beklenen etkisi olmadan
        // kullanılamaz; eksik bir yanıtı şablonla doldurmak yerine üretilemediği
        // bildirilir.
        if (refactorSteps.length === 0 || !proposedDesignPattern || !expectedImpact) {
          throw unusableModelResponse(model, `${hotspot.path} refactor planı (eksik alanlar)`);
        }

        return {
          filePath: hotspot.path,
          repoName: hotspot.repo_name,
          antiPatternsDetected: toStringArray(parsed.antiPatternsDetected),
          proposedDesignPattern,
          refactorSteps,
          sampleCodeSnippet:
            typeof parsed.sampleCodeSnippet === 'string' && parsed.sampleCodeSnippet.trim()
              ? parsed.sampleCodeSnippet
              : undefined,
          expectedImpact,
        };
      }, 1, undefined, undefined, { task: 'hotspot_refactor' });

      return aiRec;
    } catch (e) {
      console.warn('[DevControl AI] Hotspot refactoring önerisi üretilirken hata:', e);
      return null;
    }
  }
}
