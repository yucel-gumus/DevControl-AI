import { CommitMetric, FileHotspot } from '../../src/types.js';
import { formatTrNumber } from '../../src/utils/formatters.js';
import { RISK_LEVEL_ORDER } from '../constants.js';
import { commitFileEntries } from '../utils/commitFiles.js';

/** Bir dosyanın commit geçmişinden toplanan ham istatistikler. */
interface FileCommitStats {
  path: string;
  repo_name: string;
  modifications: number;
  authors: Set<string>;
  linesAdded: number;
  linesDeleted: number;
  bugFixes: number;
  lastDate: string;
}

/** Dosya uzantısı/adh eşlemesinden görüntülenecek dil etiketi. */
const LANGUAGE_BY_EXTENSION: Record<string, string> = {
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

/**
 * Bir commit'in, verilen depodaki dosyaya dokunup dokunmadığını söyler.
 *
 * Dosya listesi çıkarımı tek kaynaktır (`commitFileEntries`, bkz.
 * server/utils/commitFiles.ts): `affected_files` ile `files` arasındaki öncelik
 * kuralı burada yeniden yazılsaydı, aynı dosya bir yüzeyde "değişmiş", başka
 * bir yüzeyde "hiç değişmemiş" görünürdü.
 * Depo adı karşılaştırması büyük/küçük harf duyarsızdır (depo adı istekten
 * geldiğinde yazımı farklı olabilir); dosya yolu karşılaştırması ise tam
 * eşleşmedir — yol, telemetriden gelen kaydın kendi değeridir.
 */
export function commitTouchesFile(commit: CommitMetric, repoName: string, filePath: string): boolean {
  return (
    commit.repo_name.toLowerCase() === repoName.toLowerCase() &&
    commitFileEntries(commit).some((entry) => entry.path === filePath)
  );
}

/** Dosya yolu ve commit geçmişinden ham istatistikleri toplar (tek toplayıcı). */
function collectFileStats(commits: CommitMetric[]): Map<string, FileCommitStats> {
  const fileStats = new Map<string, FileCommitStats>();

  commits.forEach((commit) => {
    // Commit tarihi dosya başına değil, commit başına BİR kez çözülür: iç
    // döngüde her (commit, dosya) çifti için iki Date kurmak, 30 depo × 30
    // commit × 20 dosyaya kadar çıkan gezintide on binlerce gereksiz Date
    // ayırırdı (bkz. MAX_COMMIT_FILES).
    const commitTime = new Date(commit.date).getTime();
    commitFileEntries(commit).forEach(({ path, additions, deletions }) => {
      const key = `${commit.repo_name}:${path}`;
      if (!fileStats.has(key)) {
        fileStats.set(key, {
          path,
          repo_name: commit.repo_name,
          modifications: 0,
          authors: new Set(),
          linesAdded: 0,
          linesDeleted: 0,
          bugFixes: 0,
          lastDate: commit.date,
        });
      }

      const stat = fileStats.get(key)!;
      stat.modifications += 1;
      stat.authors.add(commit.author);
      stat.linesAdded += additions;
      stat.linesDeleted += deletions;
      if (commit.is_bug_fix) {
        stat.bugFixes += 1;
      }
      // Okunamayan tarih NaN üretir ve karşılaştırma false kalır: `lastDate`
      // geçerli bir damgayla değiştirilmez (eski davranışın aynısı).
      if (commitTime > new Date(stat.lastDate).getTime()) {
        stat.lastDate = commit.date;
      }
    });
  });

  return fileStats;
}

/**
 * Risk seviyesi ve güvenini değişiklik/dalgalanma/hata sayısından türetir.
 * Eşikler TEK yerde tanımlıdır: aynı dosyanın kritik hotspot listesinde ve
 * dosya detayında farklı risk seviyesiyle görünmesi bu tekliğe bağlıdır.
 */
function deriveRiskLevel(
  modifications: number,
  bugFixes: number,
  churn: number,
): { risk_level: FileHotspot['risk_level']; confidence: number } {
  if (bugFixes >= 2 || modifications >= 6 || (bugFixes >= 1 && churn > 300)) {
    return { risk_level: 'CRITICAL', confidence: 95 };
  }
  if (bugFixes >= 1 || modifications >= 3 || churn > 150) {
    return { risk_level: 'HIGH', confidence: 90 };
  }
  if (modifications >= 2 || churn > 50) {
    return { risk_level: 'MEDIUM', confidence: 85 };
  }
  return { risk_level: 'LOW', confidence: 85 };
}

/** Dosya yolundan görüntülenecek dil etiketini çıkarır. */
function deriveLanguage(path: string): string {
  const ext = path ? (path.split('.').pop()?.toLowerCase() || '') : '';
  const baseName = path ? (path.split('/').pop()?.toLowerCase() || '') : '';

  const language = LANGUAGE_BY_EXTENSION[ext];
  if (language) return language;
  if (baseName.includes('dockerfile')) return 'Docker Konfigürasyonu';
  if (baseName.startsWith('.env')) return 'Ortam Değişkenleri';
  return 'Kaynak Kod';
}

/** Dosya yoluna, rolüne ve metriklerine göre çözüm önerisi üretir. */
function deriveRecommendation(stat: FileCommitStats): string {
  const lowerPath = stat.path.toLowerCase();
  const contributors = stat.authors.size;

  if (lowerPath.includes('service') || lowerPath.includes('servis')) {
    return 'İş mantığı ve veri erişim katmanlarını bağımsız alt servislere ayırarak Tek Sorumluluk Prensibi (SRP) uygulayın.';
  }
  if (lowerPath.includes('controller') || lowerPath.includes('handler') || lowerPath.includes('route') || lowerPath.includes('api')) {
    return 'Uç nokta işleyicilerini ince tutun; doğrulama ve iş akışı yönetimini aracı katmanlara (middleware/service) devredin.';
  }
  if (lowerPath.includes('util') || lowerPath.includes('helper') || lowerPath.includes('lib')) {
    return 'Yardımcı fonksiyonları amaca özel modüllere bölün ve her biri için saf birim testleri (pure unit tests) oluşturun.';
  }
  if (lowerPath.includes('auth') || lowerPath.includes('security') || lowerPath.includes('token')) {
    return 'Yetkilendirme kontrollerini, token ayrıştırmayı ve önbellek aramalarını tek sorumluluklu bağımsız sınıflara ayırın.';
  }
  if (stat.bugFixes > 2) {
    return `Hata sınırları ve uç durumlar çevresinde birim test kapsamını artırın (${stat.bugFixes} adet hata düzeltmesi tespit edildi).`;
  }
  if (contributors > 2) {
    return `Birden fazla geliştirici (${contributors} kişi) bu dosyayı düzenlediğinden, birleştirme çakışmalarını önlemek için kod tabanını modülerleştirin.`;
  }
  return `Gelecek sprint değerlendirmelerinde ${stat.path} dosyasının değişim sıklığını izleyin.`;
}

/** Ham istatistikten tek bir hotspot kaydı üretir (metrik türetimi tek yerde). */
function toFileHotspot(stat: FileCommitStats): FileHotspot {
  const churn = stat.linesAdded + stat.linesDeleted;
  const contributors = stat.authors.size;
  const { risk_level, confidence } = deriveRiskLevel(stat.modifications, stat.bugFixes, churn);
  const avg_churn_per_commit = stat.modifications > 0 ? Math.round(churn / stat.modifications) : 0;

  return {
    path: stat.path,
    repo_name: stat.repo_name,
    language: deriveLanguage(stat.path),
    modifications_count: stat.modifications,
    contributors_count: Math.max(1, contributors),
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
        value: `~${formatTrNumber(avg_churn_per_commit)} satır/commit`,
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
        value: `${formatTrNumber(churn)} satır`,
        description: `Eklenen (${stat.linesAdded}) ve silinen (${stat.linesDeleted}) satırlar toplam bakım oynaklığını oluşturuyor.`,
      },
    ],
    recommendation: deriveRecommendation(stat),
  };
}

export class HotspotEngine {
  /**
   * Commit geçmişlerini, kod dalgalanmasını, hata düzeltmelerini ve geliştirici dağılımını analiz ederek kod sıcak noktalarını (hotspot) dinamik tespit eder
   */
  public static analyzeHotspots(commits: CommitMetric[]): FileHotspot[] {
    const hotspots = Array.from(collectFileStats(commits).values())
      // Kritik Hotspot Eşiği:
      // En az 2 kez değişmiş OLMALI, VEYA en az 1 hata düzeltmesi almış OLMALI, VEYA anlamlı kod dalgalanması (>= 80 satır) geçirmiş OLMALI.
      // Tek bir commit almış ve hiç hata/churn görmemiş sıradan dosyalar elenir.
      .filter((stat) => (
        stat.modifications >= 2 ||
        stat.bugFixes >= 1 ||
        stat.linesAdded + stat.linesDeleted >= 80
      ))
      .map(toFileHotspot);

    return hotspots.sort((a, b) => {
      if (RISK_LEVEL_ORDER[b.risk_level] !== RISK_LEVEL_ORDER[a.risk_level]) {
        return RISK_LEVEL_ORDER[b.risk_level] - RISK_LEVEL_ORDER[a.risk_level];
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

  /**
   * Belirli bir dosya için hotspot kaydı üretir.
   *
   * Kritik hotspot eşiği burada UYGULANMAZ: kullanıcı dosya ağacından eşiği
   * geçmemiş bir dosya için de yeniden yapılandırma önerisi isteyebilir. Buna
   * karşın risk seviyesi, güven, kanıt ve öneri `analyzeHotspots` ile AYNI
   * türetimden gelir; böylece aynı dosya iki ekranda çelişkili metrik gösteremez.
   *
   * Analiz penceresinde dosyaya dokunan hiç commit yoksa `null` döner: ölçümsüz
   * bir kayıt üretmek, sıfır commit'li bir dosyayı "incelenmiş" gibi sunardı.
   */
  public static analyzeFileHotspot(
    commits: CommitMetric[],
    repoName: string,
    filePath: string,
  ): FileHotspot | null {
    if (!filePath) return null;

    const touchingCommits = commits.filter((commit) => commitTouchesFile(commit, repoName, filePath));
    if (touchingCommits.length === 0) return null;

    // Kayıt anahtarı commit'in KENDİ `repo_name`'inden kurulur: istek depo adını
    // farklı bir büyük/küçük harfle taşıyabilir (yukarıdaki filtre bunu bilerek
    // case-duyarsız karşılaştırır). İstek adıyla kurulan bir anahtar bu durumda
    // ıskalar ve dosyaya dokunan doğrulanmış commit VARKEN "kayıt yok"
    // (404) dönülürdü.
    const stat = collectFileStats(touchingCommits).get(`${touchingCommits[0].repo_name}:${filePath}`);
    return stat ? toFileHotspot(stat) : null;
  }
}
