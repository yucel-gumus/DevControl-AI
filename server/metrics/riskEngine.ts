import { CommitMetric, PullRequestMetric, IssueMetric, Repository, FileHotspot, EngineeringRisk } from '../../src/types.js';
import { formatTrNumber } from '../../src/utils/formatters.js';
import { MS_PER_HOUR, STALE_ISSUE_THRESHOLD_DAYS } from '../constants.js';

export class RiskEngine {
  /**
   * Destekleyici kanıtlarla birlikte mühendislik risklerini deterministik olarak hesaplar
   */
  public static analyzeRisks(
    repositories: Repository[],
    commits: CommitMetric[],
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
            value: `${formatTrNumber(hotspot.code_churn)} satır`,
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
    //
    // KAPSAM: Bu risk TEK bir PR'ı (en uzun süredir açık olanı) ölçer ve o
    // PR'ın deposuna yazılır — depo bazlı sorgularda görünmesi doğrudur.
    // Durgun PR SAYISI ise tüm seçili depolar üzerinden ölçülür; sayıyı başlığa
    // ya da depo bazlı bir kanıt satırına "bu deponun" sayısı gibi yazmak,
    // sayaçla atfı çelişen bir ölçüm üretirdi (bkz. 3./4./5. risklerdeki aynı
    // kural). Bu yüzden portföy sayısı yalnızca kapsamı metrik adında ve
    // açıklamasında açıkça belirtilen bir kanıt satırında verilir.
    const stalePRs = prs.filter((p) => p.state === 'open' && Boolean(p.is_stale));
    if (stalePRs.length > 0) {
      const topStale = stalePRs[0];
      const createdTime = new Date(topStale.created_at).getTime();
      const openAgeHours = Number.isFinite(createdTime)
        ? Math.max(0, (Date.now() - createdTime) / MS_PER_HOUR)
        : 0;
      const openAgeDays = Math.max(1, Math.round(openAgeHours / 24));
      risks.push({
        id: `risk_delivery_stale_pr`,
        title: `Teslimat Darboğazı: #${topStale.number} numaralı PR ${openAgeDays} gündür inceleme bekliyor`,
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
            metric: 'Durgun PR Hacmi (tüm seçili depolar)',
            value: `${stalePRs.length} açık PR`,
            description: `Tüm seçili depolar genelinde askıda bekleyen durgun PR sayısı; bu kayıt yalnızca #${topStale.number} için açık kalma süresini ve boyutunu ölçer.`,
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
      // Kanıt satırı `${docIssues.length} açık kayıt` derken kapsam PORTFÖY
      // GENELİDİR (tüm seçili depoların issue'ları taranır); riski
      // `docIssues[0]`'ın deposuna yazmak, sayaçla çelişen uydurma bir atıf
      // üretir ve depo bazlı risk sorguları onu gerçek sanar. Kapsam, aynı
      // düzeltmenin uygulandığı 5. risk bloğuyla aynı biçimde işaretlenir.
      risks.push({
        id: `risk_doc_drift`,
        title: `Dokümantasyon ve Mimari Şema Kayması (${docIssues.length} açık kayıt)`,
        severity: 'MEDIUM',
        category: 'DOCUMENTATION_GAP',
        affectedRepository: '',
        repo_name: '',
        scope: 'portfolio',
        summary: `Güncel dağıtım planları, mimari şema dokümantasyonu ve API sözleşmeleri eksiktir.`,
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
        // Durgun madde sayısı tüm seçili depolar üzerinden ölçülür; başlık ve
        // kanıt sayacı portföy geneli olduğu hâlde risk `staleIssues[0]`'ın
        // deposuna yazılıyordu (bkz. 3. ve 5. risklerdeki aynı düzeltme).
        affectedRepository: '',
        repo_name: '',
        scope: 'portfolio',
        summary: `Backlog maddeleri ve mimari refactoring talepleri standart önceliklendirme sürelerinin ötesine uzamış durumdadır.`,
        evidence: [
          {
            metric: 'Durgun Sorun Sayısı',
            value: `${staleIssues.length} madde`,
            baseline: 'Hedef: 0 durgun madde',
            description: `>${STALE_ISSUE_THRESHOLD_DAYS} gündür aktif commit veya yorum almayan sorunlar.`,
          },
        ],
        confidence: 82,
        recommendedAction: 'Haftalık 15 dakikalık değerlendirme oturumu düzenleyerek eskiyen sorunları ya kapatın ya da aktif sprint hedeflerine planlayın.',
        firstDetected: staleIssues[0].created_at,
        status: 'OPEN',
      });
    }

    // 5. Yüksek Hata Düzeltme Regresyon Riski (High Bug-Fix Churn Risk)
    const bugFixCommits = commits.filter((c) => c.is_bug_fix);
    const bugFixRatio = commits.length > 0 ? bugFixCommits.length / commits.length : 0;
    if (commits.length >= 10 && bugFixRatio >= 0.35) {
      // Bu oran PORTFÖY GENELİDİR: tüm seçili depoların commit'leri üzerinden
      // hesaplanır, tek bir depoya ait değildir. Depo adı yazmak (eskiden
      // sıralamadaki ilk depo yazılıyordu) riski rastgele bir deponun üzerine
      // yıkar; "en istikrarlı depo" karşılaştırması ve depo bazlı risk
      // sorguları da bu uydurma atfı gerçek sanır. Kapsam açıkça işaretlenir.
      risks.push({
        id: 'risk_bugfix_regression_surge',
        title: `Yüksek Hata Düzeltme Yoğunluğu (%${Math.round(bugFixRatio * 100)} Hata Oranı)`,
        severity: 'HIGH',
        category: 'QUALITY_REGRESSION',
        affectedRepository: '',
        repo_name: '',
        scope: 'portfolio',
        summary: `Son commit akışının %${Math.round(bugFixRatio * 100)}'lik kısmı hata düzeltmelerinden oluşuyor. Bu durum son değişikliklerde regresyon yaşandığına işaret etmektedir.`,
        evidence: [
          {
            metric: 'Hata Düzeltme Oranı',
            value: `%${Math.round(bugFixRatio * 100)} (${bugFixCommits.length} / ${commits.length} commit)`,
            baseline: 'Hedef: < %20',
            description: 'Yüksek hata düzeltme oranı kod tabanında stabilite kaybına işaret eder.',
          },
        ],
        confidence: 90,
        recommendedAction: 'Yeni özellik geliştirmeyi durdurup regresyon testlerini genişletin ve kök neden analizine odaklanın.',
        firstDetected: bugFixCommits[0]?.date || new Date().toISOString(),
        status: 'OPEN',
      });
    }

    // 6. Kritik CI/CD Pipeline Başarısızlığı Riski
    repositories.forEach((repo) => {
      if (repo.latest_ci_run && repo.latest_ci_run.conclusion === 'failure') {
        risks.push({
          id: `risk_ci_failure_${repo.name}`,
          title: `${repo.name} deposunda son CI/CD derleme hattı başarısız oldu`,
          severity: 'HIGH',
          category: 'CI_FAILURE',
          affectedRepository: repo.name,
          repo_name: repo.name,
          summary: `${repo.name} deposundaki "${repo.latest_ci_run.name || 'CI'}" iş akışı en son çalıştırmada hata verdi. Canlıya çıkış hattında veya testlerde kırılma olabilir.`,
          evidence: [
            {
              metric: 'İş Akışı (Workflow)',
              value: repo.latest_ci_run.name || 'CI/CD Pipeline',
              description: 'GitHub Actions workflow çalışması başarısız sonuçlandı.',
            },
            {
              metric: 'Son Çalışma Zamanı',
              value: repo.latest_ci_run.updated_at ? new Date(repo.latest_ci_run.updated_at).toLocaleDateString('tr-TR') : 'Bilinmiyor',
              description: 'Derleme veya test adımlarında hata oluştu.',
            },
          ],
          confidence: 95,
          recommendedAction: 'GitHub Actions loglarını inceleyin ve başarısız olan birim/entegrasyon testlerini veya build hatalarını giderin.',
          firstDetected: repo.latest_ci_run.updated_at || new Date().toISOString(),
          status: 'OPEN',
        });
      }
    });

    return risks;
  }
}
