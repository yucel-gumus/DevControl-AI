import { CommitMetric, FileHotspot } from '../../src/types.js';

export class HotspotEngine {
  /**
   * Commit geçmişlerini, kod dalgalanmasını, hata düzeltmelerini ve geliştirici dağılımını analiz ederek kod sıcak noktalarını (hotspot) dinamik tespit eder
   */
  public static analyzeHotspots(commits: CommitMetric[]): FileHotspot[] {
    const fileStats: Map<string, {
      path: string;
      repo_name: string;
      modifications: number;
      commits: Set<string>;
      authors: Set<string>;
      linesAdded: number;
      linesDeleted: number;
      bugFixes: number;
      lastDate: string;
    }> = new Map();

    commits.forEach((commit) => {
      const affectedFiles = Array.isArray(commit.affected_files)
        ? commit.affected_files.filter((file): file is string => typeof file === 'string' && file.length > 0)
        : [];
      const detailedFiles = Array.isArray(commit.files)
        ? commit.files
            .map((file) => ({
              path: file.filename || file.path,
              additions: Number.isFinite(file.additions) ? Math.max(0, file.additions || 0) : 0,
              deletions: Number.isFinite(file.deletions) ? Math.max(0, file.deletions || 0) : 0,
            }))
            .filter((file): file is { path: string; additions: number; deletions: number } => typeof file.path === 'string' && file.path.length > 0)
        : [];
      const files = detailedFiles.length > 0
        ? detailedFiles
        : affectedFiles.map((path) => ({
            path,
            additions: affectedFiles.length === 1 ? Math.max(0, commit.additions || 0) : 0,
            deletions: affectedFiles.length === 1 ? Math.max(0, commit.deletions || 0) : 0,
          }));

      files.forEach(({ path, additions, deletions }) => {
        const key = `${commit.repo_name}:${path}`;
        if (!fileStats.has(key)) {
          fileStats.set(key, {
            path,
            repo_name: commit.repo_name,
            modifications: 0,
            commits: new Set(),
            authors: new Set(),
            linesAdded: 0,
            linesDeleted: 0,
            bugFixes: 0,
            lastDate: commit.date,
          });
        }

        const stat = fileStats.get(key)!;
        stat.modifications += 1;
        stat.commits.add(commit.sha);
        stat.authors.add(commit.author);
        stat.linesAdded += additions;
        stat.linesDeleted += deletions;
        if (commit.is_bug_fix) {
          stat.bugFixes += 1;
        }
        if (new Date(commit.date) > new Date(stat.lastDate)) {
          stat.lastDate = commit.date;
        }
      });
    });

    const hotspots: FileHotspot[] = Array.from(fileStats.values()).map((stat) => {
      const churn = stat.linesAdded + stat.linesDeleted;
      const contributors = stat.authors.size;

      // Değişiklik, dalgalanma ve hata düzeltme sayısına göre risk seviyesini dinamik belirle
      let risk_level: FileHotspot['risk_level'] = 'LOW';
      let confidence = 85;

      if (stat.modifications >= 10 || (stat.bugFixes >= 4 && churn > 1500)) {
        risk_level = 'CRITICAL';
        confidence = 94;
      } else if (stat.modifications >= 6 || stat.bugFixes >= 3 || churn > 1000) {
        risk_level = 'HIGH';
        confidence = 91;
      } else if (stat.modifications >= 3 || churn > 500) {
        risk_level = 'MEDIUM';
        confidence = 88;
      }

      // Uzantıdan dili dinamik çıkar
      const ext = (stat.path && typeof stat.path === 'string') ? (stat.path.split('.').pop()?.toLowerCase() || '') : '';
      const languageMap: Record<string, string> = {
        ts: 'TypeScript',
        tsx: 'TypeScript (React)',
        js: 'JavaScript',
        jsx: 'JavaScript (React)',
        py: 'Python',
        rs: 'Rust',
        tf: 'HCL / Terraform',
        hcl: 'HCL',
        go: 'Go',
        java: 'Java',
        cpp: 'C++',
        c: 'C',
        cs: 'C#',
        rb: 'Ruby',
        php: 'PHP',
        swift: 'Swift',
        kt: 'Kotlin',
        sql: 'SQL',
        json: 'JSON',
        yaml: 'YAML',
        yml: 'YAML',
      };
      const language = languageMap[ext] || 'Kaynak Kod';

      // Dosya yoluna, rolüne ve metriklerine göre dinamik çözüm önerisi üret
      const lowerPath = stat.path.toLowerCase();
      let recommendation = `Gelecek sprint değerlendirmelerinde ${stat.path} dosyasının değişim sıklığını izleyin.`;

      if (lowerPath.includes('service') || lowerPath.includes('servis')) {
        recommendation = 'İş mantığı ve veri erişim katmanlarını bağımsız alt servislere ayırarak Tek Sorumluluk Prensibi (SRP) uygulayın.';
      } else if (lowerPath.includes('controller') || lowerPath.includes('handler') || lowerPath.includes('route') || lowerPath.includes('api')) {
        recommendation = 'Uç nokta işleyicilerini ince tutun; doğrulama ve iş akışı yönetimini aracı katmanlara (middleware/service) devredin.';
      } else if (lowerPath.includes('util') || lowerPath.includes('helper') || lowerPath.includes('lib')) {
        recommendation = 'Yardımcı fonksiyonları amaca özel modüllere bölün ve her biri için saf birim testleri (pure unit tests) oluşturun.';
      } else if (lowerPath.includes('auth') || lowerPath.includes('security') || lowerPath.includes('token')) {
        recommendation = 'Yetkilendirme kontrollerini, token ayrıştırmayı ve önbellek aramalarını tek sorumluluklu bağımsız sınıflara ayırın.';
      } else if (stat.bugFixes > 2) {
        recommendation = `Hata sınırları ve uç durumlar çevresinde birim test kapsamını artırın (${stat.bugFixes} adet hata düzeltmesi tespit edildi).`;
      } else if (contributors > 2) {
        recommendation = `Birden fazla geliştirici (${contributors} kişi) bu dosyayı düzenlediğinden, birleştirme çakışmalarını önlemek için kod tabanını modülerleştirin.`;
      }

      return {
        path: stat.path,
        repo_name: stat.repo_name,
        language,
        modifications_count: stat.modifications,
        commits_count: stat.commits.size,
        contributors_count: Math.max(1, contributors),
        lines_added: stat.linesAdded,
        lines_deleted: stat.linesDeleted,
        code_churn: churn,
        bug_fix_commits_count: stat.bugFixes,
        risk_level,
        confidence,
        last_modified: stat.lastDate,
        evidence: [
          {
            metric: 'Dosya Değişiklik Sayısı',
            value: stat.modifications,
            description: `Son analiz döneminde ${stat.modifications} değişiklik kaydedildi.`,
          },
          {
            metric: 'Hata Düzeltme Commit Sayısı',
            value: stat.bugFixes,
            description: `Bu dosyayı etkileyen ${stat.bugFixes} adet hata hedefli commit bulundu.`,
          },
          {
            metric: 'Katkıda Bulunan Geliştirici',
            value: contributors,
            description: `${contributors} farklı geliştirici bu dosyayı düzenledi.`,
          },
          {
            metric: 'Kod Dalgalanması (Churn)',
            value: `${churn.toLocaleString()} satır`,
            description: `Eklenen (${stat.linesAdded}) ve silinen (${stat.linesDeleted}) satırlar yüksek bakım oynaklığı oluşturuyor.`,
          },
        ],
        recommendation,
      };
    });

    return hotspots.sort((a, b) => {
      const riskWeight = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
      if (riskWeight[b.risk_level] !== riskWeight[a.risk_level]) {
        return riskWeight[b.risk_level] - riskWeight[a.risk_level];
      }
      return b.code_churn - a.code_churn;
    });
  }
}
