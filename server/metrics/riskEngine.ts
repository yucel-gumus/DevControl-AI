import { CommitMetric, PullRequestMetric, IssueMetric, Repository, FileHotspot, EngineeringRisk } from '../../src/types.js';

export class RiskEngine {
  /**
   * Destekleyici kanıtlarla birlikte mühendislik risklerini deterministik olarak hesaplar
   */
  public static analyzeRisks(
    _repositories: Repository[],
    _commits: CommitMetric[],
    prs: PullRequestMetric[],
    issues: IssueMetric[],
    hotspots: FileHotspot[]
  ): EngineeringRisk[] {
    const risks: EngineeringRisk[] = [];

    // 1. Kritik Sıcak Nokta Riski
    const criticalHotspots = hotspots.filter(h => h.risk_level === 'CRITICAL' || h.risk_level === 'HIGH');
    criticalHotspots.slice(0, 2).forEach((hotspot, idx) => {
      const fileName = (hotspot.path && typeof hotspot.path === 'string') ? (hotspot.path.split('/').pop() || hotspot.path) : 'modül';
      risks.push({
        id: `risk_hotspot_${idx}_${hotspot.repo_name}`,
        title: `${fileName} dosyasında yüksek değişim oynaklığı ve hata yoğunluğu`,
        severity: hotspot.risk_level === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
        category: 'CODE_HOTSPOT',
        affectedRepository: hotspot.repo_name,
        repo_name: hotspot.repo_name,
        affectedFiles: [hotspot.path],
        summary: `${hotspot.path} modülü sürekli değişiklik ve hata düzeltmesi yaşamakta olup, yüksek yapısal bağımlılık veya kararsız gereksinim sınırlarına işaret etmektedir.`,
        evidence: [
          {
            metric: 'Yakın Tarihli Değişiklikler',
            value: `${hotspot.modifications_count} commit`,
            baseline: 'Ortalama: Dosya başına 4 commit',
            description: `Dosya son 30 günde ${hotspot.modifications_count} farklı commit ile değiştirildi.`,
          },
          {
            metric: 'Hata Düzeltme Sayısı',
            value: `${hotspot.bug_fix_commits_count} düzeltme`,
            description: `${hotspot.bug_fix_commits_count} commit doğrudan hata veya güvenlik düzeltmesi hedefliydi.`,
          },
          {
            metric: 'Kod Dalgalanması (Churn)',
            value: `${hotspot.code_churn.toLocaleString()} satır`,
            description: `Yüksek satır ekleme/silme oranı, kararlı genişletmeler yerine sürekli değişen mantığı göstermektedir.`,
          },
          {
            metric: 'Eşzamanlı Geliştirici',
            value: `${hotspot.contributors_count} geliştirici`,
            description: `Çoklu geliştirici düzenlemeleri birleştirme çakışması ve regresyon olasılığını artırır.`,
          },
        ],
        confidence: hotspot.confidence ?? 0,
        recommendedAction: hotspot.recommendation,
        firstDetected: hotspot.last_modified,
        status: 'OPEN',
      });
    });

    // 2. Teslimat Darboğazı / Durgun PR Riski
    const stalePRs = prs.filter((p) => p.state === 'open' && Boolean(p.is_stale));
    if (stalePRs.length > 0) {
      const topStale = stalePRs[0];
      const createdTime = new Date(topStale.created_at).getTime();
      const openAgeHours = Number.isFinite(createdTime)
        ? Math.max(0, (Date.now() - createdTime) / (1000 * 60 * 60))
        : 0;
      const openAgeDays = Math.max(1, Math.round(openAgeHours / 24));
      risks.push({
        id: `risk_delivery_stale_pr`,
        title: `Teslimat Darboğazı: İnceleme bekleyen ${stalePRs.length} uzun süreli açık Çekme İsteği (PR)`,
        severity: 'HIGH',
        category: 'DELIVERY_BOTTLENECK',
        affectedRepository: topStale.repo_name,
        repo_name: topStale.repo_name,
        summary: `PR #${topStale.number} ("${topStale.title.substring(0, 45)}...") yaklaşık ${openAgeDays} gündür açık kalarak birleştirme çürümesi ve dal ayrışması riski oluşturuyor.`,
        evidence: [
          {
            metric: 'Açık Kalma Süresi',
            value: `${openAgeDays} gün`,
            baseline: 'Hedef: < 3 gün',
            description: `Takımın standart inceleme dönüş süresi eşiğini aşıyor.`,
          },
          {
            metric: 'Değişen Satır Sayısı',
            value: `+${topStale.additions} / -${topStale.deletions}`,
            description: `Büyük PR boyutu inceleme yorgunluğu yaratır ve hata kaçırma oranını artırır.`,
          },
          {
            metric: 'Durgun PR Hacmi',
            value: `${stalePRs.length} açık PR`,
            description: `Konsensüs veya entegrasyon olmadan askıda bekleyen birden fazla paralel dal.`,
          },
        ],
        confidence: 89,
        recommendedAction: 'Büyük PR\'ları özellik bayraklarıyla desteklenen daha küçük incelenebilir parçalara (<300 satır) bölün ve eşli inceleme atayın.',
        firstDetected: topStale.created_at,
        status: 'OPEN',
      });
    }

    // 3. Dokümantasyon Boşluğu Riski
    const docIssues = issues.filter(i => i.state === 'open' && i.labels.some((label) => {
      const normalizedLabel = label.toLowerCase();
      return normalizedLabel === 'documentation' || normalizedLabel === 'technical-debt';
    }));
    if (docIssues.length > 0) {
      const targetIssue = docIssues[0];
      risks.push({
        id: `risk_doc_drift`,
        title: `${targetIssue.repo_name} Deposunda Dokümantasyon ve Mimari Şema Kayması`,
        severity: 'MEDIUM',
        category: 'DOCUMENTATION_GAP',
        affectedRepository: targetIssue.repo_name,
        repo_name: targetIssue.repo_name,
        summary: `Depoda güncel dağıtım planları, mimari şema dokümantasyonu ve API sözleşmeleri eksiktir.`,
        evidence: [
          {
            metric: 'Dokümantasyon / Teknik Borç Sorunları',
            value: `${docIssues.length} açık kayıt`,
            baseline: 'Hedef: 0 açık kayıt',
            description: 'GitHub kayıtlarında dokümantasyon veya teknik borç etiketi bulunan sorunlar.',
          },
          {
            metric: 'Açık Dokümantasyon Sorunu',
            value: `#${targetIssue.number}: ${targetIssue.title.substring(0, 40)}`,
            description: 'Depo yöneticileri tarafından açıkça teknik borç olarak etiketlendi.',
          },
        ],
        confidence: 84,
        recommendedAction: 'CI/CD boru hattında otomatik OpenAPI ve Markdown üretimini kurun ve yeni servis dağıtımlarından önce mimari ADR zorunluluğu getirin.',
        firstDetected: targetIssue.created_at,
        status: 'OPEN',
      });
    }

    // 4. Durgun Sorunlar / Teknik Borç Birikimi Riski
    const staleIssues = issues.filter(i => i.state === 'open' && i.is_stale);
    if (staleIssues.length > 0) {
      risks.push({
        id: `risk_issue_backlog`,
        title: `Çözülmemiş Teknik Borç Birikimi (${staleIssues.length} geciken madde)`,
        severity: 'LOW',
        category: 'TECHNICAL_DEBT',
        affectedRepository: staleIssues[0].repo_name,
        repo_name: staleIssues[0].repo_name,
        summary: `Backlog maddeleri ve mimari refactoring talepleri standart önceliklendirme sürelerinin ötesine uzamış durumdadır.`,
        evidence: [
          {
            metric: 'Durgun Sorun Sayısı',
            value: `${staleIssues.length} madde`,
            baseline: 'Hedef: 0 durgun madde',
            description: '>14 gündür aktif commit veya yorum almayan sorunlar.',
          },
        ],
        confidence: 82,
        recommendedAction: 'Haftalık 15 dakikalık değerlendirme oturumu düzenleyerek eskiyen sorunları ya kapatın ya da aktif sprint hedeflerine planlayın.',
        firstDetected: staleIssues[0].created_at,
        status: 'OPEN',
      });
    }

    return risks;
  }
}
