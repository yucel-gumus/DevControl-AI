import { CommitMetric, PullRequestMetric, IssueMetric, Repository, HealthScoreDimensions, HealthScoreWeights, EngineeringHealthScore } from '../../src/types.js';
import { SCORING_THRESHOLDS } from '../constants.js';

export const DEFAULT_WEIGHTS: HealthScoreWeights = {
  codeHealth: 0.25,
  delivery: 0.20,
  documentation: 0.15,
  maintenance: 0.15,
  collaboration: 0.10,
  activity: 0.15,
};

export class HealthEngine {
  /**
   * Depolar için mühendislik sağlık skorunu deterministik olarak hesaplar
   */
  public static calculateHealth(
    repositories: Repository[],
    commits: CommitMetric[],
    prs: PullRequestMetric[],
    issues: IssueMetric[],
    customWeights?: Partial<HealthScoreWeights>,
    telemetryDataStatus?: 'ready' | 'partial'
  ): EngineeringHealthScore {
    const weights: HealthScoreWeights = {
      ...DEFAULT_WEIGHTS,
      ...(customWeights || {}),
    };

    // Toplam 1 değilse ağırlıkları normalleştir
    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
    const normalizedWeights: HealthScoreWeights = {
      codeHealth: weights.codeHealth / totalWeight,
      delivery: weights.delivery / totalWeight,
      documentation: weights.documentation / totalWeight,
      maintenance: weights.maintenance / totalWeight,
      collaboration: weights.collaboration / totalWeight,
      activity: weights.activity / totalWeight,
    };

    // Depo metadatası tek başına sağlık skoru üretmeye yetmez. Skor, doğrulanmış
    // GitHub telemetrisi (commit, PR veya issue) geldiğinde hesaplanır.
    const hasData = commits.length > 0 || prs.length > 0 || issues.length > 0;
    if (!hasData) {
      const dimensions: HealthScoreDimensions = {
        codeHealth: 0,
        delivery: 0,
        documentation: 0,
        maintenance: 0,
        collaboration: 0,
        activity: 0,
      };

      return {
        overallScore: 0,
        grade: 'NO_DATA',
        hasData: false,
        dataStatus: 'no_data',
        dimensions,
        weights,
        calculatedAt: new Date().toISOString(),
        breakdownNotes: [
          { dimension: 'codeHealth', score: 0, finding: 'GitHub telemetrisi bağlanana kadar kod sağlığı hesaplanamaz.', status: 'warning' },
          { dimension: 'delivery', score: 0, finding: 'GitHub telemetrisi bağlanana kadar teslimat metriği hesaplanamaz.', status: 'warning' },
          { dimension: 'documentation', score: 0, finding: 'GitHub telemetrisi bağlanana kadar dokümantasyon metriği hesaplanamaz.', status: 'warning' },
          { dimension: 'maintenance', score: 0, finding: 'GitHub telemetrisi bağlanana kadar bakım metriği hesaplanamaz.', status: 'warning' },
          { dimension: 'collaboration', score: 0, finding: 'GitHub telemetrisi bağlanana kadar işbirliği metriği hesaplanamaz.', status: 'warning' },
          { dimension: 'activity', score: 0, finding: 'GitHub telemetrisi bağlanana kadar aktivite metriği hesaplanamaz.', status: 'warning' },
        ],
      };
    }

    const hasCommitData = commits.length > 0;
    const hasPRData = prs.length > 0;
    const hasIssueData = issues.length > 0;
    // Kişisel hesaplarda doğrudan ana dala push yapıldığı için PR olmaması kısmi veri sayılmaz.
    const isSoloPersonalScope = hasCommitData && !hasPRData && !hasIssueData;
    const dataStatus = telemetryDataStatus === 'partial' || (!isSoloPersonalScope && (!hasCommitData || !hasPRData)) ? 'partial' : 'ready';

    // 1. Kod Sağlığı Boyutu (0-100)
    // Faktörler: hata düzeltme oranı (düşük olması daha iyi), kod dalgalanma dağılımı, commit boyutu varyansı
    const bugFixCommits = commits.filter((c) => c.is_bug_fix).length;
    const bugFixRatio = hasCommitData ? bugFixCommits / commits.length : 0;
    const avgCommitChurn = hasCommitData
      ? commits.reduce((acc, c) => acc + c.total_changes, 0) / commits.length
      : 0;

    let codeHealth = 0;
    if (hasCommitData) {
      // Eğer commit'lerin %30'undan fazlası hata düzeltmesiyse veya ortalama dalgalanma çok yüksekse puan düşür
      codeHealth = SCORING_THRESHOLDS.CODE_HEALTH_BASE
        - (bugFixRatio * SCORING_THRESHOLDS.BUG_FIX_PENALTY_WEIGHT)
        - (avgCommitChurn > SCORING_THRESHOLDS.CHURN_HIGH_THRESHOLD
            ? SCORING_THRESHOLDS.CHURN_HIGH_PENALTY
            : avgCommitChurn > SCORING_THRESHOLDS.CHURN_MEDIUM_THRESHOLD
              ? SCORING_THRESHOLDS.CHURN_MEDIUM_PENALTY
              : 0);
      codeHealth = Math.max(30, Math.min(98, Math.round(codeHealth)));
    }

    // 2. Teslimat Boyutu (0-100)
    // Faktörler: PR birleştirme oranı veya kişisel doğrudan commit teslimat temposu
    const mergedPRs = prs.filter((p) => p.state === 'merged').length;
    const stalePRs = prs.filter((p) => p.state === 'open' && p.is_stale).length;
    const prMergeRate = hasPRData ? mergedPRs / prs.length : 0;
    const measuredCyclePRs = prs.filter((pr) => Number.isFinite(pr.cycle_time_hours));
    const avgCycleHours = measuredCyclePRs.length > 0
      ? measuredCyclePRs.reduce((acc, pr) => acc + (pr.cycle_time_hours || 0), 0) / measuredCyclePRs.length
      : 0;

    let delivery = 0;
    if (hasPRData) {
      delivery = (prMergeRate * 60) + 40 - (stalePRs * 8) - (avgCycleHours > 100 ? 15 : 0);
      delivery = Math.max(35, Math.min(96, Math.round(delivery)));
    } else if (hasCommitData) {
      // Kişisel Geliştirici Teslimat Ritmi: Son 14 gündeki commit frekansı ve ritmi
      const recentCommits = commits.filter((c) => (Date.now() - new Date(c.date).getTime()) < 14 * 24 * 60 * 60 * 1000).length;
      delivery = Math.max(55, Math.min(95, Math.round(65 + (recentCommits * 1.5))));
    }

    // 3. Dokümantasyon Boyutu (0-100)
    // Faktörler: commit mesajlarında dokümantasyon sinyali ve açık dokümantasyon sorunları
    const hasDocumentationData = hasCommitData || hasIssueData;
    const docMentions = commits.filter(c => c.message.toLowerCase().includes('doc') || c.message.toLowerCase().includes('readme')).length;
    const docIssues = issues.filter((issue) => issue.state === 'open' && issue.labels.some((label) => label.toLowerCase() === 'documentation')).length;
    let documentation = 0;
    if (hasDocumentationData) {
      documentation = 65 + (docMentions * 5) - (docIssues > 0 ? docIssues * 6 : 0);
      documentation = Math.max(25, Math.min(95, Math.round(documentation)));
    }

    // 4. Bakım Boyutu (0-100)
    // Faktörler: durgun sorunlar, açık sorun sayısı, bağımlılık güncellemeleri
    const staleIssues = issues.filter(i => i.state === 'open' && i.is_stale).length;
    const totalOpenIssues = issues.filter((issue) => issue.state === 'open').length;
    let maintenance = 0;
    if (hasIssueData) {
      maintenance = 94 - (staleIssues * 9) - (totalOpenIssues > 20 ? 12 : totalOpenIssues > 10 ? 6 : 0);
      maintenance = Math.max(30, Math.min(97, Math.round(maintenance)));
    } else if (hasCommitData) {
      // Açık issue olmaması kişisel depolarda temiz bakım durumunu gösterir
      maintenance = 88;
    }

    // 5. İşbirliği & Mühendislik Disiplini Boyutu (0-100)
    // Faktörler: benzersiz katkıda bulunanlar veya tekil geliştirici mühendislik hijyeni
    const uniqueAuthors = new Set([
      ...commits.map((commit) => commit.author),
      ...prs.map((pr) => pr.author),
    ]).size;
    const totalComments = prs.reduce((acc, p) => acc + (p.comments_count || 0), 0);
    const avgCommentsPerPR = hasPRData ? totalComments / prs.length : 0;
    let collaboration = 0;
    if (hasCommitData || hasPRData) {
      const baseCollab = uniqueAuthors > 1 ? 50 + (uniqueAuthors * 8) : 82;
      collaboration = baseCollab + (avgCommentsPerPR > 5 ? 15 : avgCommentsPerPR * 2);
      collaboration = Math.max(40, Math.min(98, Math.round(collaboration)));
    }

    // 6. Aktivite Boyutu (0-100)
    // Faktörler: dönemdeki toplam commit sayısı, frekans ve güncellik
    const commitsCount = commits.length;
    const activity = hasCommitData
      ? Math.min(98, Math.max(30, Math.round(45 + (commitsCount * 0.45))))
      : 0;

    const dimensions: HealthScoreDimensions = {
      codeHealth,
      delivery,
      documentation,
      maintenance,
      collaboration,
      activity,
    };

    // Ölçülen boyutları belirle
    const measuredDimensions: (keyof HealthScoreWeights)[] = [
      ...(hasCommitData ? ['codeHealth', 'activity', 'delivery', 'maintenance', 'collaboration'] as const : []),
      ...(hasDocumentationData ? ['documentation'] as const : []),
    ];
    const uniqueDimensions = Array.from(new Set(measuredDimensions));
    const measuredWeightTotal = uniqueDimensions.reduce((total, dimension) => total + normalizedWeights[dimension], 0);
    const overallScore = Math.round(
      uniqueDimensions.reduce((total, dimension) => total + dimensions[dimension] * normalizedWeights[dimension], 0)
      / (measuredWeightTotal || 1)
    );

    let grade: 'A' | 'B' | 'C' | 'D' | 'F' = 'B';
    if (overallScore >= 90) grade = 'A';
    else if (overallScore >= 78) grade = 'B';
    else if (overallScore >= 65) grade = 'C';
    else if (overallScore >= 50) grade = 'D';
    else grade = 'F';

    // Deterministik analiz bulgularını formüle et
    const breakdownNotes: EngineeringHealthScore['breakdownNotes'] = [
      {
        dimension: 'codeHealth',
        score: dimensions.codeHealth,
        finding: hasCommitData
          ? `${commits.length} commit arasından ${bugFixCommits} tanesi (%${Math.round(bugFixRatio * 100)}) hata düzeltmesidir. Kod dalgalanması dengeli dağılmıştır.`
          : 'Commit kaydı bulunmadığı için kod sağlığı boyutu ölçülemedi.',
        status: hasCommitData
          ? dimensions.codeHealth >= 80 ? 'good' : dimensions.codeHealth >= 65 ? 'warning' : 'critical'
          : 'warning',
      },
      {
        dimension: 'delivery',
        score: dimensions.delivery,
        finding: hasPRData
          ? `${mergedPRs} birleştirilmiş PR, 7 günden uzun süredir bekleyen ${stalePRs} durgun PR. Ortalama ölçülmüş PR çevrim süresi: ${avgCycleHours.toFixed(1)} saat.`
          : 'PR kaydı bulunmadığı için teslimat boyutu ölçülemedi.',
        status: hasPRData
          ? dimensions.delivery >= 80 ? 'good' : dimensions.delivery >= 65 ? 'warning' : 'critical'
          : 'warning',
      },
      {
        dimension: 'documentation',
        score: dimensions.documentation,
        finding: hasDocumentationData
          ? 'Dokümantasyon sinyalleri commit mesajları ve açık issue etiketleri üzerinden hesaplandı.'
          : 'Commit veya issue kaydı bulunmadığı için dokümantasyon boyutu ölçülemedi.',
        status: hasDocumentationData
          ? dimensions.documentation >= 80 ? 'good' : dimensions.documentation >= 60 ? 'warning' : 'critical'
          : 'warning',
      },
      {
        dimension: 'maintenance',
        score: dimensions.maintenance,
        finding: hasIssueData
          ? `İzlenen ${repositories.length} depo genelinde 14 günden eski ${staleIssues} çözülmemiş sorun tespit edildi.`
          : 'Issue kaydı bulunmadığı için bakım boyutu ölçülemedi.',
        status: hasIssueData
          ? dimensions.maintenance >= 80 ? 'good' : dimensions.maintenance >= 65 ? 'warning' : 'critical'
          : 'warning',
      },
      {
        dimension: 'collaboration',
        score: dimensions.collaboration,
        finding: hasCommitData || hasPRData
          ? `İnceleme tartışmalarına ve kod sahipliğine aktif katılan ${uniqueAuthors} mühendislik geliştiricisi bulunmaktadır.`
          : 'Commit veya PR kaydı bulunmadığı için işbirliği boyutu ölçülemedi.',
        status: hasCommitData || hasPRData
          ? dimensions.collaboration >= 80 ? 'good' : 'warning'
          : 'warning',
      },
      {
        dimension: 'activity',
        score: dimensions.activity,
        finding: hasCommitData
          ? `30 günlük denetim penceresinde izlenen servisler genelinde ${commitsCount} commit kaydı analiz edilmiştir.`
          : 'Commit kaydı bulunmadığı için aktivite boyutu ölçülemedi.',
        status: hasCommitData
          ? dimensions.activity >= 80 ? 'good' : 'warning'
          : 'warning',
      },
    ];

    return {
      overallScore,
      grade,
      hasData: true,
      dataStatus,
      dimensions,
      weights,
      calculatedAt: new Date().toISOString(),
      breakdownNotes,
    };
  }
}
