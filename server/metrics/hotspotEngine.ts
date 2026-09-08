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
      const fileCount = Math.max(1, affectedFiles.length);
      const perFileAdditions = Math.round((commit.additions || 0) / fileCount);
      const perFileDeletions = Math.round((commit.deletions || 0) / fileCount);

      const files = detailedFiles.length > 0
        ? detailedFiles
        : affectedFiles.map((path) => ({
            path,
            additions: perFileAdditions,
            deletions: perFileDeletions,
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

    const realStats = Array.from(fileStats.values()).filter((stat) => {
      const churn = stat.linesAdded + stat.linesDeleted;
      // Kritik Hotspot Eşiği:
      // En az 2 kez değişmiş OLMALI, VEYA en az 1 hata düzeltmesi almış OLMALI, VEYA anlamlı kod dalgalanması (>= 80 satır) geçirmiş OLMALI.
      // Tek bir commit almış ve hiç hata/churn görmemiş sıradan dosyalar elenir.
      return stat.modifications >= 2 || stat.bugFixes >= 1 || churn >= 80;
    });

    const hotspots: FileHotspot[] = realStats.map((stat) => {
      const churn = stat.linesAdded + stat.linesDeleted;
      const contributors = stat.authors.size;

      // Değişiklik, dalgalanma ve hata düzeltme sayısına göre risk seviyesini dinamik belirle
      let risk_level: FileHotspot['risk_level'] = 'LOW';
      let confidence = 85;

      if (stat.bugFixes >= 2 || stat.modifications >= 6 || (stat.bugFixes >= 1 && churn > 300)) {
        risk_level = 'CRITICAL';
        confidence = 95;
      } else if (stat.bugFixes >= 1 || stat.modifications >= 3 || churn > 150) {
        risk_level = 'HIGH';
        confidence = 90;
      } else if (stat.modifications >= 2 || churn > 50) {
        risk_level = 'MEDIUM';
        confidence = 85;
      }

      // Uzantıdan dili dinamik çıkar
      const ext = (stat.path && typeof stat.path === 'string') ? (stat.path.split('.').pop()?.toLowerCase() || '') : '';
      const baseName = (stat.path && typeof stat.path === 'string') ? (stat.path.split('/').pop()?.toLowerCase() || '') : '';

      const languageMap: Record<string, string> = {
        ts: 'TypeScript',
        tsx: 'TypeScript (React)',
        js: 'JavaScript',
        jsx: 'JavaScript (React)',
        mjs: 'JavaScript (ESM)',
        cjs: 'JavaScript (CJS)',
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
        md: 'Markdown Belge',
        css: 'CSS Stil',
        scss: 'SCSS Stil',
        html: 'HTML Şablon',
        sh: 'Shell Betiği',
        bash: 'Bash Betiği',
        xml: 'XML',
        svg: 'SVG Vektör',
        toml: 'TOML Yapılandırma',
        dockerignore: 'Docker Kuralı',
        gitignore: 'Git Kuralı',
      };

      let language = languageMap[ext];
      if (!language) {
        if (baseName.includes('dockerfile')) language = 'Docker Konfigürasyonu';
        else if (baseName.startsWith('.env')) language = 'Ortam Değişkenleri';
        else language = 'Kaynak Kod';
      }

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

        const avg_churn_per_commit = stat.modifications > 0 ? Math.round(churn / stat.modifications) : 0;

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
          avg_churn_per_commit,
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
              metric: 'Commit Başına Ortalama Churn',
              value: `~${avg_churn_per_commit.toLocaleString()} satır/commit`,
              description: `Her düzenleme işleminde ortalama ${avg_churn_per_commit} satır kod dalgalanması gerçekleşti.`,
            },
            {
              metric: 'Hata Düzeltme Commit Sayısı',
              value: stat.bugFixes,
              description: stat.bugFixes > 0
                ? `Bu dosyayı etkileyen ${stat.bugFixes} adet hata hedefli commit bulundu.`
                : 'Bu dosyada henüz hata düzeltmesi kaydedilmedi, modül stabil yapıda.',
            },
            {
              metric: 'Katkıda Bulunan Geliştirici',
              value: contributors,
              description: `${contributors} farklı geliştirici bu dosyayı düzenledi.`,
            },
            {
              metric: 'Toplam Kod Dalgalanması (Churn)',
              value: `${churn.toLocaleString()} satır`,
              description: `Eklenen (${stat.linesAdded}) ve silinen (${stat.linesDeleted}) satırlar toplam bakım oynaklığını oluşturuyor.`,
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
      if (b.bug_fix_commits_count !== a.bug_fix_commits_count) {
        return b.bug_fix_commits_count - a.bug_fix_commits_count;
      }
      if (b.modifications_count !== a.modifications_count) {
        return b.modifications_count - a.modifications_count;
      }
      return b.code_churn - a.code_churn;
    });
  }
}
