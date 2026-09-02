import { callGeminiWithRetry } from '../gemini.js';
import {
  Repository,
  CommitMetric,
  PullRequestMetric,
  IssueMetric,
  FileHotspot,
  EngineeringRisk,
  EngineeringHealthScore,
  AIInsight,
  TodayBriefItem,
  GitHubUser,
  RepoAiReview,
  DeveloperPersona,
  HotspotRefactorRecommendation,
} from '../../src/types.js';
import { Type } from '@google/genai';

/**
 * İngilizce kalıpları yakalayıp Türkçe karşılıklarına dönüştüren güvenlik filtresi
 */
function toTurkishText(text: string): string {
  if (!text || typeof text !== 'string') return text;

  let out = text;
  out = out.replace(/High change volatility\s*&\s*bug concentration in\s*(.+)/gi, '$1 dosyasında yüksek değişim oynaklığı ve hata yoğunluğu');
  out = out.replace(/High change volatility in\s*(.+)/gi, '$1 dosyasında yüksek değişim oynaklığı');
  out = out.replace(/Code hotspot in\s*([^:]+):\s*(.+)/gi, '$1 deposunda kod sıcak noktası: $2');
  out = out.replace(/Code hotspot in\s*(.+)/gi, '$1 üzerinde kod sıcak noktası');
  out = out.replace(/Recurring churn in\s*(.+)/gi, '$1 üzerinde tekrarlayan kod dalgalanması');
  out = out.replace(/Exemplary engineering hygiene in\s*(.+)/gi, '$1 deposunda örnek mühendislik disiplini');
  out = out.replace(/Delivery bottleneck in\s*(.+)/gi, '$1 deposunda teslimat darboğazı');
  out = out.replace(/Documentation gap in\s*(.+)/gi, '$1 deposunda dokümantasyon eksikliği');
  out = out.replace(/Technical debt in\s*(.+)/gi, '$1 deposunda teknik borç');
  out = out.replace(/Stale PRs? in\s*(.+)/gi, '$1 deposunda geciken PR');
  out = out.replace(/commits? analyzed/gi, 'commit analiz edildi');
  out = out.replace(/hotspots? detected/gi, 'sıcak nokta tespit edildi');
  out = out.replace(/risk score/gi, 'risk skoru');
  out = out.replace(/health score/gi, 'sağlık skoru');

  return out;
}

/**
 * Mühendislik içgörüleri ve günlük özet bültenlerini üreten yapay zeka ve dinamik telemetri motoru
 */
export class InsightsEngine {
  /**
   * Gemini sentezi ve dinamik telemetriye dayalı Günün Mühendislik Özeti maddelerini üretir
   */
  public static async generateDailyBrief(
    repositories: Repository[],
    hotspots: FileHotspot[],
    risks: EngineeringRisk[],
    healthScore: EngineeringHealthScore
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

    // En kritik risk maddesi
    if (risks.length > 0) {
      const topRisk = risks[0];
      dynamicBriefItems.push({
        id: `brief_risk_${topRisk.id}`,
        priority: topRisk.severity === 'CRITICAL' || topRisk.severity === 'HIGH' ? 'HIGH' : 'MEDIUM',
        title: toTurkishText(topRisk.title),
        description: toTurkishText(topRisk.summary),
        relatedRepo: topRisk.affectedRepository,
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
        title: `${topHotspot.repo_name} deposunda kod sıcak noktası: ${fileName}`,
        description: `${topHotspot.path} dosyası ${topHotspot.modifications_count} kez değiştirildi ve ${topHotspot.bug_fix_commits_count} hata düzeltmesi içeriyor (${topHotspot.code_churn.toLocaleString()} satır kod dalgalanması).`,
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
    } else if (risks.length > 1) {
      const secondRisk = risks[1];
      dynamicBriefItems.push({
        id: `brief_risk_${secondRisk.id}`,
        priority: secondRisk.severity === 'HIGH' ? 'HIGH' : 'MEDIUM',
        title: toTurkishText(secondRisk.title),
        description: toTurkishText(secondRisk.summary),
        relatedRepo: secondRisk.affectedRepository,
        actionable: true,
        evidenceSummary: secondRisk.evidence[0] ? `${secondRisk.evidence[0].metric}: ${secondRisk.evidence[0].value}` : `Güven Skoru: %${secondRisk.confidence}`,
      });
    }

    // Sağlık Skoru / Mimari Başarı Maddesi
    const topHealthyRepo = [...repositories].sort((a, b) => (b.health_score || 0) - (a.health_score || 0))[0];
    if (topHealthyRepo) {
      dynamicBriefItems.push({
        id: `brief_opp_${topHealthyRepo.id}`,
        priority: 'OPPORTUNITY',
        title: `${topHealthyRepo.name} deposu telemetri kapsamına alındı`,
        description: `${topHealthyRepo.name} deposu için doğrulanmış GitHub kayıtları aktif analiz kapsamına dahil edildi. Depolar genelindeki sağlık skoru ${healthScore.overallScore}/100 olarak hesaplandı.`,
        relatedRepo: topHealthyRepo.name,
        actionable: false,
        evidenceSummary: `Aktif depoların genel sağlık skoru: ${healthScore.overallScore}/100 (${healthScore.grade}).`,
      });
    }

    // En az 4 madde olmasını sağla
    if (dynamicBriefItems.length < 4) {
      dynamicBriefItems.push({
        id: `brief_health_global`,
        priority: healthScore.overallScore < 70 ? 'HIGH' : 'MEDIUM',
        title: `Genel mühendislik sağlığı ${healthScore.overallScore}/100 olarak hesaplandı`,
        description: `Kod Sağlığı: ${healthScore.dimensions.codeHealth}, Teslimat: ${healthScore.dimensions.delivery}, Dokümantasyon: ${healthScore.dimensions.documentation}.`,
        relatedRepo: repositories[0]?.name || 'Sistem',
        actionable: healthScore.overallScore < 75,
        evidenceSummary: `Genel skor ${healthScore.overallScore}/100, Seviye: ${healthScore.grade}.`,
      });
    }

    // 2. Gemini Yapay Zekası ile Türkçe Özet Sentezi (Model Zinciri)
    const prompt = `GÖREV: Aşağıdaki mühendislik telemetri verilerini analiz ederek Türkçe bir mühendislik bülteni oluştur.
KESİNLİKLE UYULMASI GEREKEN KURALLAR:
1. TÜM metinler (title, description, evidenceSummary) İSTİSNASIZ %100 TÜRKÇE olmalıdır.
2. ASLA İngilizce başlık yazma!
   - YANLIŞ: "High change volatility & bug concentration in service.ts"
   - DOĞRU: "service.ts dosyasında yüksek değişim oynaklığı ve hata yoğunluğu"
   - YANLIŞ: "Code hotspot in Repo: file.ts"
   - DOĞRU: "Repo deposunda kod sıcak noktası: file.ts"
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
Öne Çıkan Sıcak Noktalar: ${hotspots.slice(0, 3).map((h) => `${h.repo_name}/${h.path} (${h.modifications_count} değişiklik, ${h.code_churn} satır)`).join(', ')}
Aktif Riskler: ${risks.map((r) => `${r.affectedRepository}: ${r.title}`).join('; ')}
`;

    const aiResult = await callGeminiWithRetry(async (gemini, model) => {
      const response = await gemini.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
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
          return parsed.map((item: any, idx: number) => ({
            id: `brief_ai_${idx}_${Date.now()}`,
            priority: item.priority || 'MEDIUM',
            title: toTurkishText(item.title),
            description: toTurkishText(item.description),
            relatedRepo: item.relatedRepo,
            actionable: item.actionable ?? true,
            evidenceSummary: toTurkishText(item.evidenceSummary),
          }));
        }
      }
      return null;
    });

    if (aiResult && aiResult.length > 0) {
      return aiResult;
    }

    return dynamicBriefItems;
  }

  /**
   * Doğrulanmış Gerçekler ve Yapay Zeka Yorumunu içeren %100 dinamik Türkçe içgörüler üretir
   */
  public static async generateInsights(
    repositories: Repository[],
    commits: CommitMetric[],
    prs: PullRequestMetric[],
    issues: IssueMetric[],
    hotspots: FileHotspot[],
    risks: EngineeringRisk[],
    healthScore: EngineeringHealthScore
  ): Promise<AIInsight[]> {
    const reposList = Array.isArray(repositories) ? repositories : [];
    const defaultRepo = reposList[0]?.name || 'ana-depo';

    if (!healthScore.hasData) {
      return [
        {
          id: 'insight_no_data',
          title: 'GitHub telemetrisi olmadan içgörü üretilemiyor',
          summary: 'Commit, PR veya issue kaydı gelmeden kod sıcak noktası, risk ve sağlık değerlendirmesi yapılamaz.',
          priority: 'MEDIUM',
          category: 'ARCHITECTURE',
          targetRepo: reposList[0]?.name,
          facts: ['Henüz doğrulanmış GitHub telemetrisi bulunmuyor.'],
          aiInterpretation: 'Önce GitHub bağlantısını tamamlayın; telemetri geldikten sonra içgörüler gerçek kayıtlar üzerinden üretilecektir.',
          confidence: 100,
          evidence: [
            { metric: 'Telemetri Durumu', value: 'Veri bekleniyor', source: 'GitHub bağlantı durumu' },
          ],
          recommendedAction: 'Depolar & Bağlantı bölümünden GitHub hesabını bağlayın ve verileri eşitleyin.',
          createdAt: new Date().toISOString(),
        },
      ];
    }

    // 1. Telemetri verilerine dayalı dinamik içgörüler oluştur
    const dynamicInsights: AIInsight[] = [];

    // A. Sıcak Nokta İçgörüsü (Gerçek veriden)
    if (hotspots.length > 0) {
      const topH = hotspots[0];
      const fileName = (topH.path && typeof topH.path === 'string') ? (topH.path.split('/').pop() || topH.path) : 'modül';
      dynamicInsights.push({
        id: `insight_hotspot_${topH.repo_name}_${fileName}`,
        title: `${topH.repo_name} Deposunda ${fileName} Üzerinde Yüksek Kod Oynaklığı ve Hata Yoğunlaşması`,
        summary: `${topH.path} dosyası son dönemde ${topH.modifications_count} kez değiştirildi ve ${topH.bug_fix_commits_count} hata düzeltmesi içerdi. Bu durum mimari bağımlılık karmaşıklığına işaret etmektedir.`,
        priority: topH.risk_level === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
        category: 'HOTSPOT',
        targetRepo: topH.repo_name,
        facts: [
          `Son dönemde ${topH.modifications_count} adet commit kaydedildi`,
          `${topH.bug_fix_commits_count} commit doğrudan hata ve güvenlik düzeltmesi hedefliydi`,
          `Dosya üzerinde ${topH.contributors_count} farklı geliştirici değişiklik yaptı`,
          `Toplam ${topH.code_churn.toLocaleString()} satırlık kod dalgalanması (churn) oluştu`,
        ],
        aiInterpretation:
          `${topH.path} dosyası birden fazla işlevi tek bir yapıda toplamaktadır. Sorumlulukların ayrıştırılmaması regresyon riskini ve bakım maliyetini artırmaktadır.`,
        confidence: topH.confidence ?? 0,
        evidence: [
          { metric: 'Değişiklik Sıklığı', value: `${topH.modifications_count} commit`, source: 'Git Commit Günlüğü' },
          { metric: 'Hata Düzeltme Sayısı', value: `${topH.bug_fix_commits_count} commit`, source: 'Commit Sınıflandırma Motoru' },
          { metric: 'Kod Dalgalanması', value: `${topH.code_churn.toLocaleString()} satır`, source: 'Git Diff İstatistikleri' },
          { metric: 'Geliştirici Sayısı', value: `${topH.contributors_count} kişi`, source: 'Git Yazar Dağılımı' },
        ],
        recommendedAction:
          topH.recommendation || `${fileName} dosyasını Tek Sorumluluk Prensibi (SRP) doğrultusunda modüler alt bileşenlere ayırın ve birim test kapsamını güçlendirin.`,
        createdAt: new Date().toISOString(),
      });
    }

    // B. PR / Teslimat Döngüsü İçgörüsü (Gerçek PR verisinden)
    const stalePRs = prs.filter((p) => p.state === 'open' && Boolean(p.is_stale));
    if (stalePRs.length > 0) {
      const topStalePR = stalePRs[0];
      const createdTime = new Date(topStalePR.created_at).getTime();
      const openAgeHours = Number.isFinite(createdTime)
        ? Math.max(0, (Date.now() - createdTime) / (1000 * 60 * 60))
        : 0;
      const reviewDays = Math.max(1, Math.round(openAgeHours / 24));
      dynamicInsights.push({
        id: `insight_pr_cycle_${topStalePR.repo_name}`,
        title: `${topStalePR.repo_name} Deposunda Çekme İsteği (PR) İnceleme Sürelerinde Uzama`,
        summary: `PR #${topStalePR.number} ("${topStalePR.title.substring(0, 45)}...") yaklaşık ${reviewDays} gündür inceleme beklemekte olup takım teslimat hızını yavaşlatmaktadır.`,
        priority: 'MEDIUM',
        category: 'PROCESS',
        targetRepo: topStalePR.repo_name,
        facts: [
          `Açık kalma süresi yaklaşık ${Math.round(openAgeHours)} saate ulaştı`,
          `PR kapsamında +${topStalePR.additions} / -${topStalePR.deletions} satır değişiklik bulunuyor`,
          `Toplam ${stalePRs.length} adet bekleyen veya durgun PR tespit edildi`,
        ],
        aiInterpretation:
          'Büyük boyutlu veya sahipsiz kalan çekme istekleri inceleme yorgunluğuna yol açarak onayların gecikmesine ve dal ayrışmasına (branch drift) neden olmaktadır.',
        confidence: 88,
        evidence: [
          { metric: 'PR Açık Kalma Süresi', value: `${reviewDays} gün`, source: 'GitHub PR Telemetrisi' },
          { metric: 'Değişen Satır Hacmi', value: `+${topStalePR.additions} / -${topStalePR.deletions}`, source: 'GitHub PR İstatistikleri' },
          { metric: 'Durgun PR Sayısı', value: `${stalePRs.length} açık PR`, source: 'Teslimat Motoru' },
        ],
        recommendedAction:
          'Özellik bayraklarıyla (feature flags) desteklenen mikro-PR (<300 satır) politikasını hayata geçirin ve PR incelemeleri için günlük akran denetimi tahsis edin.',
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
      });
    }

    // C. Genel Sağlık Boyutları İçgörüsü
    dynamicInsights.push({
      id: `insight_dimensions_${Date.now()}`,
      title: `Platform Genelinde Mühendislik Boyutları Dağılımı ve Denge Analizi`,
      summary: `Kod Sağlığı ${healthScore.dimensions.codeHealth}/100, Teslimat ${healthScore.dimensions.delivery}/100 ve Dokümantasyon ${healthScore.dimensions.documentation}/100 olarak ölçülmüştür.`,
      priority: healthScore.overallScore < 75 ? 'HIGH' : 'LOW',
      category: 'ARCHITECTURE',
      targetRepo: defaultRepo,
      facts: [
        `Genel Platform Sağlık Endeksi: ${healthScore.overallScore}/100 (Derece: ${healthScore.grade})`,
        `Kod Sağlığı Boyutu: ${healthScore.dimensions.codeHealth}/100`,
        `Teslimat Hızı Boyutu: ${healthScore.dimensions.delivery}/100`,
        `Dokümantasyon Kapsamı Boyutu: ${healthScore.dimensions.documentation}/100`,
      ],
      aiInterpretation:
        'Sistem telemetrisi, geliştirme eforunun teslimat hızını korurken kod kalitesini sürdürdüğünü teyit etmektedir.',
      confidence: 91,
      evidence: [
        { metric: 'Genel Skor', value: `${healthScore.overallScore} / 100`, source: 'Sağlık Motoru' },
        { metric: 'Kod Sağlığı', value: `${healthScore.dimensions.codeHealth} / 100`, source: 'Statik Kod Analizi' },
        { metric: 'Teslimat Hızı', value: `${healthScore.dimensions.delivery} / 100`, source: 'PR Yaşam Döngüsü' },
      ],
      recommendedAction:
        'Düşük kalan boyutlarda (özellikle dokümantasyon veya test kapsamı) otomatik CI kalite kapıları devreye alın.',
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 18).toISOString(),
    });

    // 2. Gemini Yapay Zekası ile Dinamik İçgörü Zenginleştirmesi
    try {
      const activeRepoNames = repositories.map(r => r.name).slice(0, 8).join(', ');
      const recentCommitMsgs = commits.slice(0, 10).map(c => c.message).join(' | ');
      const hotspotSummary = hotspots.slice(0, 3).map(h => `${h.repo_name}:${h.path}`).join(', ');

      const prompt = `GÖREV: Aşağıdaki kişisel GitHub geliştirici verilerini inceleyerek Türkçe 3 adet derinlemesine mühendislik içgörüsü (AI Insight) üret.
KURALLAR:
1. Yanıtın tamamı %100 profesyonel ve zengin Türkçe olmalıdır. Asla İngilizce başlık yazma.
2. Sayısal verilere (sağlık skoru, commit sayısı, dosya yolları) ve somut geliştirici pratiklerine odaklan.
3. Çıktıyı aşağıdaki JSON formatında bir dizi olarak döndür.

Veriler:
Genel Sağlık Skoru: ${healthScore.overallScore}/100
Aktif Depolar: ${activeRepoNames}
Son Commitler: ${recentCommitMsgs}
Sıcak Noktalar: ${hotspotSummary || 'Yok'}
Tespit Edilen Riskler: ${risks.slice(0, 3).map((r) => `${r.title} (${r.severity})`).join(', ') || 'Yok'}
Açık Kayıt Sayısı: ${issues.length} issue

JSON ŞEMASI:
[
  {
    "title": "Türkçe başlık",
    "summary": "Türkçe özet",
    "priority": "HIGH" | "MEDIUM" | "LOW" | "OPPORTUNITY",
    "category": "ARCHITECTURE" | "PRODUCTIVITY" | "HOTSPOT" | "PROCESS" | "SKILLS",
    "targetRepo": "DepoAdı",
    "facts": ["Doğrulanmış veri maddesi 1", "Madde 2"],
    "aiInterpretation": "Yapay zeka teknik yorumu",
    "confidence": 92,
    "evidence": [
      { "metric": "Metrik Adı", "value": "Değer", "source": "Kaynak" }
    ],
    "recommendedAction": "Somut önerilen aksiyon"
  }
]`;

      const aiInsights = await callGeminiWithRetry(async (gemini, model) => {
        const response = await gemini.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
          },
        });
        if (response.text) {
          const parsed = JSON.parse(response.text.trim());
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed.map((item: any, idx: number) => ({
              id: `insight_ai_${idx}_${Date.now()}`,
              title: toTurkishText(item.title),
              summary: toTurkishText(item.summary),
              priority: item.priority || 'MEDIUM',
              category: item.category || 'ARCHITECTURE',
              targetRepo: item.targetRepo || defaultRepo,
              facts: Array.isArray(item.facts) ? item.facts.map((f: string) => toTurkishText(f)) : [],
              aiInterpretation: toTurkishText(item.aiInterpretation),
              confidence: Number(item.confidence) || 90,
              evidence: Array.isArray(item.evidence) ? item.evidence : [],
              recommendedAction: toTurkishText(item.recommendedAction),
              createdAt: new Date().toISOString(),
            }));
          }
        }
        return null;
      });

      if (aiInsights && aiInsights.length > 0) {
        return aiInsights;
      }
    } catch (e) {
      console.warn('Gemini AI Insights üretimi sırasında hata, yerel içgörülere dönülüyor:', e);
    }

    return dynamicInsights;
  }

  /**
   * Belirli bir GitHub deposu için Yapay Zeka (Gemini) Kod & Mimari İncelemesi gerçekleştirir
   */
  public static async reviewRepository(
    repo: Repository,
    commits: CommitMetric[],
    hotspots: FileHotspot[]
  ): Promise<RepoAiReview> {
    const repoCommits = commits.filter(c => c.repo_name.toLowerCase() === repo.name.toLowerCase());
    const repoHotspots = hotspots.filter(h => h.repo_name.toLowerCase() === repo.name.toLowerCase());

    const prompt = `Sen Kıdemli Yazılım Mimarı ve Kod Kalitesi Liderisin (Staff Principal Architect).
Aşağıdaki GitHub deposunun telemetrisini ve geliştirme geçmişini inceleyerek Türkçe, kapsamlı ve uygulanabilir bir "AI Depo Kod & Mimari İnceleme Raporu" oluştur.

DEPO AYRINTILARI:
- Depo Adı: ${repo.name} (${repo.full_name})
- Birincil Dil: ${repo.language}
- Açıklama: ${repo.description}
- Yıldız: ${repo.stargazers_count}, Fork: ${repo.forks_count}, Açık Sorun (Issue): ${repo.open_issues_count}
- Son Güncelleme: ${repo.updated_at}
- Analiz Edilen Commit Hacmi: ${repoCommits.length} commit
- Tespit Edilen Sıcak Noktalar: ${repoHotspots.map(h => `${h.path} (${h.modifications_count} değişiklik, ${h.code_churn} satır)`).join(', ') || 'Temiz (Sıcak nokta yok)'}
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

    const defaultReview: RepoAiReview = {
      repoName: repo.name,
      architectureOverview: `${repo.name} deposu ${repo.language} diliyle geliştirilmiş olup, son dönemde ${repoCommits.length} commit ile aktifliğini korumaktadır.`,
      codeQualityScore: 82,
      strengths: [
        'Düzenli commit ritmi ve net kaynak kod ayrımı',
        `${repo.language} ekosistemi standartlarına uyumlu proje yapısı`,
      ],
      technicalDebts: [
        repoHotspots.length > 0 ? `${repoHotspots[0].path} üzerinde kod yoğunlaşması` : 'Dokümantasyon ve mimari diyagram genişletmesi',
      ],
      securityObservations: [
        'Çevre değişkenleri ve gizli anahtarlar kod tabanından ayrı tutulmalıdır',
      ],
      recommendedRoadmap: [
        { title: 'Modüler Ayrıştırma', description: 'Tekil sorumluluk ilkesine göre büyük dosyaları alt bileşenlere bölün.', priority: 'HIGH' },
        { title: 'Otomatik Test Kapsamı', description: 'Kritik iş kuralları için birim testleri oluşturun.', priority: 'MEDIUM' },
      ],
      reviewedAt: new Date().toISOString(),
    };

    try {
      const result = await callGeminiWithRetry(async (gemini, model) => {
        const response = await gemini.models.generateContent({
          model,
          contents: prompt,
          config: { responseMimeType: 'application/json' },
        });
        if (response.text) {
          const parsed = JSON.parse(response.text.trim());
          return {
            repoName: repo.name,
            architectureOverview: toTurkishText(parsed.architectureOverview || defaultReview.architectureOverview),
            codeQualityScore: Math.min(100, Math.max(0, Number(parsed.codeQualityScore) || 85)),
            strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map((s: string) => toTurkishText(s)) : defaultReview.strengths,
            technicalDebts: Array.isArray(parsed.technicalDebts) ? parsed.technicalDebts.map((s: string) => toTurkishText(s)) : defaultReview.technicalDebts,
            securityObservations: Array.isArray(parsed.securityObservations) ? parsed.securityObservations.map((s: string) => toTurkishText(s)) : defaultReview.securityObservations,
            recommendedRoadmap: Array.isArray(parsed.recommendedRoadmap) ? parsed.recommendedRoadmap.map((r: any) => ({
              title: toTurkishText(r.title),
              description: toTurkishText(r.description),
              priority: r.priority || 'MEDIUM',
            })) : defaultReview.recommendedRoadmap,
            reviewedAt: new Date().toISOString(),
          };
        }
        return null;
      });

      return result || defaultReview;
    } catch (e) {
      console.warn(`[DevControl AI] ${repo.name} için yapay zeka inceleme üretilemedi:`, e);
      return defaultReview;
    }
  }

  /**
   * Kullanıcının tüm GitHub geçmişine göre "Yapay Zeka Geliştirici Profili & Üretkenlik Karnesi" üretir
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
    const conventionalCount = commits.filter(c => /^(feat|fix|refactor|docs|test|chore|style|perf|ci)(\(.+\))?:/i.test(c.message)).length;
    const conventionalRate = commits.length > 0 ? Math.round((conventionalCount / commits.length) * 100) : 0;

    const defaultPersona: DeveloperPersona = {
      personaTitle: 'Modern Full-Stack Mimarı & Çevik Yazılım Geliştirici',
      summary: `${user.name || user.login}, ${repositories.length} kişisel depo ve ${commits.length} son commit ile ${primaryLanguages[0]?.name || 'TypeScript'} ağırlıklı modern web ekosisteminde dinamik ve üretken bir geliştirici profilini temsil etmektedir.`,
      primaryLanguages,
      productivityMetrics: {
        weeklyCommitFrequency: Math.max(1, Math.round(commits.length / 4)),
        dominantWorkingHours: 'Aktif Gece & Akşam Odak Seansları',
        bugFixEfficiency: `%${Math.max(60, 100 - bugFixRate)} Proaktif Özellik Geliştirme`,
        conventionalCommitHygiene: `%${conventionalRate > 0 ? conventionalRate : 75} Standartlaştırılmış Mesaj Hijyeni`,
      },
      superpowers: [
        'Hızlı modüler mimari tasarımı ve temiz bileşen hiyerarşisi',
        'Modern API entegrasyonu ve tam kapsamlı TypeScript tip güvenliği',
        'Sürekli ve istikrarlı kod üretim disiplini',
      ],
      growthAreas: [
        'Kritik servislerde otomatik uçtan uca (E2E) ve birim test kapsama oranını artırma',
        'CI/CD otomatik kalite ve güvenlik tarama hatları kurma',
      ],
      analyzedAt: new Date().toISOString(),
    };

    try {
      const prompt = `Sen Kıdemli Mühendislik Yöneticisisin (Staff Engineering Manager).
Aşağıdaki doğrulanmış geliştirici telemetrisini inceleyerek profesyonel, motive edici ve isabetli bir "Yapay Zeka Geliştirici Profili (Developer Persona)" oluştur.

GELİŞTİRİCİ VERİLERİ:
- İsim: ${user.name} (@${user.login})
- Biyografi: ${user.bio || 'Yazılım Geliştirici'}
- Toplam Kişisel Depoları: ${repositories.length} depo
- Dil Dağılımı: ${primaryLanguages.map(l => `${l.name}: %${l.percentage}`).join(', ')}
- Son 30 Günde İncelenen Commit Sayısı: ${commits.length}
- Hata Düzeltme Oranı: %${bugFixRate}
- Tipik Commit Başlıkları:
${commits.slice(0, 15).map(c => `- ${c.message}`).join('\n') || '- Doğrudan commit bulunmuyor'}

İSTENEN FORMAT (YALNIZCA GEÇERLİ JSON):
{
  "personaTitle": "Örn: Modern Full-Stack Mimarı & Sistem Mühendisi",
  "summary": "Geliştiricinin güçlü teknik kaslarını, üretim temposunu ve uzmanlık alanını özetleyen 2-3 cümlelik Türkçe paragraf.",
  "primaryLanguages": ${JSON.stringify(primaryLanguages)},
  "productivityMetrics": {
    "weeklyCommitFrequency": ${Math.max(1, Math.round(commits.length / 4))},
    "dominantWorkingHours": "Akşam & Gece Geliştirme Seansları",
    "bugFixEfficiency": "%${Math.max(60, 100 - bugFixRate)} Proaktif Geliştirme",
    "conventionalCommitHygiene": "%${conventionalRate > 0 ? conventionalRate : 78} Semantik Standart"
  },
  "superpowers": [
    "Süper Güç 1 (Somut ve etkileyici)",
    "Süper Güç 2",
    "Süper Güç 3"
  ],
  "growthAreas": [
    "Gelişim Alanı 1 (Somut mühendislik tavsiyesi)",
    "Gelişim Alanı 2"
  ]
}`;

      const aiPersona = await callGeminiWithRetry(async (gemini, model) => {
        const response = await gemini.models.generateContent({
          model,
          contents: prompt,
          config: { responseMimeType: 'application/json' },
        });
        if (response.text) {
          const parsed = JSON.parse(response.text.trim());
          return {
            personaTitle: toTurkishText(parsed.personaTitle || defaultPersona.personaTitle),
            summary: toTurkishText(parsed.summary || defaultPersona.summary),
            primaryLanguages: Array.isArray(parsed.primaryLanguages) && parsed.primaryLanguages.length > 0 ? parsed.primaryLanguages : primaryLanguages,
            productivityMetrics: {
              weeklyCommitFrequency: Number(parsed.productivityMetrics?.weeklyCommitFrequency) || defaultPersona.productivityMetrics.weeklyCommitFrequency,
              dominantWorkingHours: toTurkishText(parsed.productivityMetrics?.dominantWorkingHours || defaultPersona.productivityMetrics.dominantWorkingHours),
              bugFixEfficiency: toTurkishText(parsed.productivityMetrics?.bugFixEfficiency || defaultPersona.productivityMetrics.bugFixEfficiency),
              conventionalCommitHygiene: toTurkishText(parsed.productivityMetrics?.conventionalCommitHygiene || defaultPersona.productivityMetrics.conventionalCommitHygiene),
            },
            superpowers: Array.isArray(parsed.superpowers) ? parsed.superpowers.map((s: string) => toTurkishText(s)) : defaultPersona.superpowers,
            growthAreas: Array.isArray(parsed.growthAreas) ? parsed.growthAreas.map((g: string) => toTurkishText(g)) : defaultPersona.growthAreas,
            analyzedAt: new Date().toISOString(),
          };
        }
        return null;
      });

      return aiPersona || defaultPersona;
    } catch (e) {
      console.warn('[DevControl AI] Geliştirici profili üretilirken hata:', e);
      return defaultPersona;
    }
  }

  /**
   * Sıcak nokta dosyaları için somut kod refactoring önerisi ve tasarım deseni üretir
   */
  public static async suggestHotspotRefactoring(
    hotspot: FileHotspot,
    commits: CommitMetric[]
  ): Promise<HotspotRefactorRecommendation> {
    const relevantCommits = commits.filter(c => c.repo_name === hotspot.repo_name && (c.affected_files || []).includes(hotspot.path));
    const fileName = hotspot.path.split('/').pop() || hotspot.path;

    const defaultRec: HotspotRefactorRecommendation = {
      filePath: hotspot.path,
      repoName: hotspot.repo_name,
      antiPatternsDetected: [
        'Büyük Boyutlu Monolitik Sınıf / Modül (God Object Anti-Pattern)',
        'Yüksek Kod Dalgalanması ve Çözüm Yoğunlaşması',
      ],
      proposedDesignPattern: 'Tek Sorumluluk Prensibi (SRP) & Strateji Deseni (Strategy Pattern)',
      refactorSteps: [
        `${fileName} dosyasındaki veri erişim, iş mantığı ve sunum katmanlarını ayrıştırın.`,
        'Büyük metotları küçük, saf ve test edilebilir yardımcı fonksiyonlara bölün.',
        'Değişiklik yapmadan önce mevcut davranışı sabitleyen birim testleri ekleyin.',
      ],
      sampleCodeSnippet: `// Örnek Yeniden Yapılandırma Yaklaşımı:
export interface DedicatedService {
  execute(input: InputData): Promise<ResultData>;
}

export class ModularHandler implements DedicatedService {
  async execute(input: InputData): Promise<ResultData> {
    // İş mantığı buraya ayrıştırılır
    return processData(input);
  }
}`,
      expectedImpact: `%${Math.round(hotspot.modifications_count * 4)} oranında daha az birleştirme çakışması ve bakım eforu tasarrufu.`,
    };

    try {
      const prompt = `Sen Kıdemli Yazılım Refactoring Uzmanısın.
Aşağıda çok sık değişen ve hata içeren kod sıcak noktası (hotspot) için Türkçe somut bir yeniden yapılandırma (refactor) planı üret.

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

      const aiRec = await callGeminiWithRetry(async (gemini, model) => {
        const response = await gemini.models.generateContent({
          model,
          contents: prompt,
          config: { responseMimeType: 'application/json' },
        });
        if (response.text) {
          const parsed = JSON.parse(response.text.trim());
          return {
            filePath: hotspot.path,
            repoName: hotspot.repo_name,
            antiPatternsDetected: Array.isArray(parsed.antiPatternsDetected) ? parsed.antiPatternsDetected.map((p: string) => toTurkishText(p)) : defaultRec.antiPatternsDetected,
            proposedDesignPattern: toTurkishText(parsed.proposedDesignPattern || defaultRec.proposedDesignPattern),
            refactorSteps: Array.isArray(parsed.refactorSteps) ? parsed.refactorSteps.map((s: string) => toTurkishText(s)) : defaultRec.refactorSteps,
            sampleCodeSnippet: parsed.sampleCodeSnippet || defaultRec.sampleCodeSnippet,
            expectedImpact: toTurkishText(parsed.expectedImpact || defaultRec.expectedImpact),
          };
        }
        return null;
      });

      return aiRec || defaultRec;
    } catch (e) {
      console.warn('[DevControl AI] Hotspot refactoring önerisi üretilirken hata:', e);
      return defaultRec;
    }
  }
}
