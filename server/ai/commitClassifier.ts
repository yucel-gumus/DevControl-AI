import { callGeminiWithRetry } from '../gemini.js';
import { Type } from '@google/genai';
import { CommitSemanticAnalysis } from '../../src/types.js';
import { BoundedCache } from '../utils/boundedCache.js';

/**
 * Konvansiyonel Commits başlık biçimi: `type(scope)!: açıklama`.
 *
 * Yalnızca **biçimi** ölçer (bilinen bir tip öneki, iki nokta üst üste ve
 * açıklama); mesajın ne anlattığını yorumlamaz. Commit mesajı hijyeni
 * raporlamasının dayanağı budur: yorumlanabilir bir tahmin değil,
 * doğrulanabilir bir biçim kuralı.
 */
const CONVENTIONAL_COMMIT_HEADER = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([^()\r\n]+\))?!?: \S/;

/**
 * Commit başlığı Konvansiyonel Commits biçimine uyuyor mu?
 */
export function isConventionalCommitHeader(message: string): boolean {
  return CONVENTIONAL_COMMIT_HEADER.test((message || '').trim());
}

/**
 * Kabul edilen commit kategorileri — TEK kaynak.
 *
 * Hem modele dayatılan şema (`responseSchema.enum`) hem de dönen yanıtın
 * doğrulaması bu listeyi kullanır. İki yerde ayrı yazılsalardı şemaya eklenen
 * bir kategori doğrulamada eksik kalır ve modelin ürettiği geçerli bir değer
 * sessizce reddedilirdi — tersi yönde ise geçersiz bir değer içeri sızardı.
 */
const COMMIT_CATEGORIES: CommitSemanticAnalysis['category'][] = [
  'BUG_FIX',
  'FEATURE',
  'REFACTOR',
  'PERFORMANCE',
  'SECURITY',
  'DOCUMENTATION',
  'CHORE',
];

/**
 * Konvansiyonel başlık tipini kategoriye eşler.
 *
 * Bu eşleme **doğrulanabilir** bir beyandır: `fix:` ile başlayan bir başlık,
 * hata düzeltmesi olduğunu mesajın kendisinde yazar. `security` standart
 * konvansiyonel tipler arasında yer almadığı için burada bulunmaz; güvenlik
 * yamaları `fix:` başlığıyla gelir ve anahtar kelime kuralıyla yakalanır.
 */
const CONVENTIONAL_TYPE_TO_CATEGORY: Record<string, CommitSemanticAnalysis['category']> = {
  feat: 'FEATURE',
  fix: 'BUG_FIX',
  docs: 'DOCUMENTATION',
  style: 'REFACTOR',
  refactor: 'REFACTOR',
  perf: 'PERFORMANCE',
  test: 'CHORE',
  build: 'CHORE',
  ci: 'CHORE',
  chore: 'CHORE',
  revert: 'BUG_FIX',
};

export class CommitSemanticClassifier {
  // Git SHA kodları değişmez (immutable) olduğu için önbellek güvenlidir:
  // bir girdi hiçbir zaman bayatlamaz. "Aynı commit için asla ikinci kez LLM
  // çağrısı yapılmaz" ise yalnızca önbellek penceresi içinde geçerlidir —
  // kapasite (5.000) dolduğunda LRU en eski girdileri düşürür ve düşen bir
  // commit yeniden karşılaşılırsa yeniden sınıflanır (başlıklı commit'ler için
  // deterministik kural, başlıksızlar için yeni bir model çağrısı).
  private static cache = new BoundedCache<string, CommitSemanticAnalysis>(5_000);

  private static readonly BATCH_SIZE = 25;

  /**
   * Eşzamanlı gönderilen paket sayısı. Paketler birbirinden bağımsızdır, ancak
   * hepsini aynı anda göndermek sağlayıcı tarafında ikincil hız sınırını
   * tetikleyip tüm eşitlemeyi yavaşlatırdı.
   */
  private static readonly BATCH_CONCURRENCY = 3;

  /**
   * Mesajı yalnızca konvansiyonel başlığından sınıflar; başlık yoksa `null`.
   *
   * Başlık varsa gövdedeki anahtar kelimelere BAKILMAZ: `feat: hata ayıklama
   * ekranı` başlığı özellik bildirir, gövdedeki "hata" kelimesi ise yalnızca
   * konuyu anlatır. Gövde kelimesini üstün saymak bu commit'i hata düzeltmesi
   * diye sayar ve ölçümü bozardı.
   */
  private static classifyByHeader(message: string, sha: string): CommitSemanticAnalysis | null {
    const header = (message || '').trim();
    if (!CONVENTIONAL_COMMIT_HEADER.test(header)) return null;

    // Kırıcı değişiklik işareti (`!`) tipten önce ayıklanır: `fix!: ...` ve
    // `feat(scope)!: ...` başlıkları aksi halde "fix!" / "feat(scope)!" tipiyle
    // tabloda bulunamaz ve konvansiyonel başlık yoluyla sınıflanması gerekirken
    // anahtar kelime yoluna düşerdi (aynı mesaj için `isConventionalCommitHeader`
    // "konvansiyonel" derken sınıflandırmanın kural dışına düşmesi çelişkili
    // hijyen ölçümü üretir).
    const type = header
      .slice(0, header.indexOf(':'))
      .replace(/!$/, '')
      .split('(')[0]
      .toLowerCase();
    const category = CONVENTIONAL_TYPE_TO_CATEGORY[type];
    if (!category) return null;

    return {
      sha,
      isBugFix: category === 'BUG_FIX',
      category,
      reasoning: `Konvansiyonel commit başlığı tipi "${type}" olarak doğrulandı.`,
      // Deterministik ve doğrulanabilir bir biçim kuralı; tahmin değil.
      confidence: 95,
    };
  }

  /**
   * Konvansiyonel Git commit başlıklarından ve anahtar kelimelerden deterministik kural tabanlı ön sınıflandırma üretir.
   */
  public static classifyByConvention(message: string, sha: string): CommitSemanticAnalysis {
    return this.classifyByHeader(message, sha) || this.classifyByKeywords(message, sha);
  }

  /**
   * Konvansiyonel başlığı olmayan mesajı anahtar kelimelerden sınıflar.
   *
   * `classifyByConvention`'ın başlık adımından AYRI tutulur: çağıran
   * (`classifyCommits`) başlık kontrolünü ve anahtar kelime sınıflamasını tek
   * geçişte yapar. Başlık kuralı ayrıca çağrılsaydı aynı commit için iki kez
   * çalışır ve "modele gitsin mi" kararı ile sınıflamanın aynı sonuca varması
   * tesadüfe kalırdı.
   */
  private static classifyByKeywords(message: string, sha: string): CommitSemanticAnalysis {
    const msg = (message || '').trim().toLowerCase();
    let isBugFix = false;
    let category: CommitSemanticAnalysis['category'] = 'CHORE';
    let reasoning = 'Anahtar kelime analizi.';

    if (/^(fix|bug|hotfix|patch)(\(.*\))?!?:|^revert\b|\bfix(es|ed)?\b|\bbug(s)?\b|\bpatch\b|\bhata\b|\bdüzelt|\bsorun\b|\bproblem\b|\berror\b|\bcrash\b|\bçözüm\b|\bgideril/i.test(msg)) {
      isBugFix = true;
      category = 'BUG_FIX';
      reasoning = 'Hata veya regresyon düzeltmesi tespit edildi.';
    } else if (/^(feat|feature)(\(.*\))?!?:|\bözellik\b|\bekle/i.test(msg)) {
      category = 'FEATURE';
      reasoning = 'Yeni özellik veya geliştirme.';
    } else if (/^(refactor|style)(\(.*\))?!?:|\bclean\b|\bdüzenle/i.test(msg)) {
      category = 'REFACTOR';
      reasoning = 'Kod yeniden yapılandırması veya temizlik.';
    } else if (/^(perf)(\(.*\))?!?:|\boptimi|\bperformans\b/i.test(msg)) {
      category = 'PERFORMANCE';
      reasoning = 'Performans optimizasyonu.';
    } else if (/^(sec|security)(\(.*\))?!?:|\bgüvenlik\b/i.test(msg)) {
      isBugFix = true;
      category = 'SECURITY';
      reasoning = 'Güvenlik yaması veya zafiyet düzeltmesi.';
    } else if (/^(docs)(\(.*\))?!?:|\breadme\b|\bdoküman\b/i.test(msg)) {
      category = 'DOCUMENTATION';
      reasoning = 'Dokümantasyon güncellemesi.';
    } else if (/^(chore|build|ci|test)(\(.*\))?!?:|\bbump\b|\bdeps\b|\bbağımlılık\b/i.test(msg)) {
      category = 'CHORE';
      reasoning = 'Rutin bakım, test veya konfigürasyon.';
    }

    return {
      sha,
      isBugFix,
      category,
      reasoning,
      confidence: 75,
    };
  }

  /**
   * Verilen commit listesini gruplar halinde (batch) Gemini yapay zekasına göndererek
   * arkasındaki gerçek mühendislik niyetini (intent) anlamsal olarak tespit eder.
   * LLM erişilemez veya kota dışı olduğunda deterministik kural tabanlı fallback kullanılır.
   *
   * Yalnızca **kuralın güvenilir biçimde sınıflayamadığı** commit'ler modele
   * gönderilir: konvansiyonel başlık taşıyan bir commit'in niyeti mesajın
   * kendisinde yazılıdır (`fix:` → hata düzeltmesi). Bu commit'leri modele
   * sormak, doğrulanabilir bir gerçeği tahmin ettirmek ve eşitlemeye ölçekle
   * artan bir gecikme eklemek olurdu (paket başına bir dil modeli çağrısı).
   */
  public static async classifyCommits(
    commits: { sha: string; message: string; repo_name?: string }[]
  ): Promise<Map<string, CommitSemanticAnalysis>> {
    const resultMap = new Map<string, CommitSemanticAnalysis>();
    const uncachedCommits: { sha: string; message: string }[] = [];

    // 1. Önce önbellekte var olanları doğrudan al; olmayanları kural tabanlı sınıfla
    for (const commit of commits) {
      const cached = this.cache.get(commit.sha);
      if (cached) {
        resultMap.set(commit.sha, cached);
        continue;
      }

      // Başlık kuralı tek kez çalışır: sonucu hem sınıflama hem de "modele
      // gitsin mi" kararı olarak kullanılır (aynı commit için iki kez
      // çağrıldığında iki sonucun ayrışması sessiz bir tutarsızlık üretirdi).
      const byHeader = this.classifyByHeader(commit.message, commit.sha);
      resultMap.set(commit.sha, byHeader || this.classifyByKeywords(commit.message, commit.sha));
      // Başlığı konvansiyonel biçime uyan commit deterministik olarak
      // sınıflandırıldı; yalnızca başlıksız (serbest metin) commit'ler modele gider.
      if (!byHeader) {
        uncachedCommits.push({ sha: commit.sha, message: commit.message });
      }
    }

    // Tümü zaten önbellekte ya da başlığından sınıflandırılabiliyorsa doğrudan dön
    if (uncachedCommits.length === 0) {
      return resultMap;
    }

    // 2. Sınıflandırılamayan commit'leri BATCH_SIZE'lık paketler halinde Gemini'ye gönder
    const batches: { sha: string; message: string }[][] = [];
    for (let i = 0; i < uncachedCommits.length; i += this.BATCH_SIZE) {
      batches.push(uncachedCommits.slice(i, i + this.BATCH_SIZE));
    }

    for (let i = 0; i < batches.length; i += this.BATCH_CONCURRENCY) {
      await Promise.all(
        batches
          .slice(i, i + this.BATCH_CONCURRENCY)
          .map((batch) => this.classifyBatch(batch, resultMap)),
      );
    }

    return resultMap;
  }

  /**
   * Bir commit paketi için model istemini (prompt) kurar.
   *
   * Şablon metni bilinçli olarak sütun 0'dan başlar: satır başı boşlukları
   * modele gönderilen metnin parçasıdır, kod girintisi değildir.
   */
  private static buildBatchPrompt(batch: { sha: string; message: string }[]): string {
    return `Sen Kıdemli Yazılım Baş Mimarı ve Kod Telemetrisi Uzmanısın (Principal Software Engineer).
GÖREV: Aşağıda verilen Git commit mesajlarının gerçek yazılım mühendisliği niyetini (intent) ve semantik anlamını derinlemesine analiz et.

ANALİZ PRENSİPLERİ:
1. Kesinlikle sadece "fix" veya "bug" kelimelerinin varlığına bakma. Cümlenin arkasındaki gerçek mühendislik anlamına ve bağlama odaklan:
   - "revert style mutation causing mobile crash", "prevent race condition in token refresh", "guard against undefined session", "handle null pointer edge case", "patch memory leak" gibi ifadeler açıkça birer BUG_FIX veya SECURITY düzeltmesidir.
   - "add feature", "implement dark mode", "introduce dashboard" gibi ifadeler FEATURE'dır.
   - "cleanup dead code", "extract helper", "restructure components", "rename variables" REFACTOR'dır.
   - "optimize query execution", "reduce bundle size", "cache expensive calculation" PERFORMANCE'dır.
   - "update dependencies", "bump version", "config tweaks" CHORE'dur.
   - "update README", "add docstrings" DOCUMENTATION'dır.
   - "sanitize user input", "prevent XSS", "secure token storage" SECURITY'dir.
2. Tüm commit'ler için nesnel, tutarlı ve açıklayıcı bir JSON analizi üret.

ANALİZ EDİLECEK COMMİTLER:
${JSON.stringify(batch.map((c) => ({ sha: c.sha, message: c.message })), null, 2)}
`;
  }

  /**
   * Tek bir commit paketini modele gönderir ve dönen analizleri haritalara işler.
   * Paket başarısız olursa kural tabanlı sonuçlar (önceden yazılmış) yürürlükte
   * kalır; bu yüzden hata yutulur ve yalnızca kaydedilir.
   */
  private static async classifyBatch(
    batch: { sha: string; message: string }[],
    resultMap: Map<string, CommitSemanticAnalysis>,
  ): Promise<void> {
    const prompt = this.buildBatchPrompt(batch);

    try {
      const aiResults = await callGeminiWithRetry(async (gemini, model, signal) => {
        const response = await gemini.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            abortSignal: signal,
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  sha: { type: Type.STRING },
                  isBugFix: { type: Type.BOOLEAN },
                  category: {
                    type: Type.STRING,
                    enum: COMMIT_CATEGORIES,
                  },
                  reasoning: { type: Type.STRING },
                  confidence: { type: Type.NUMBER },
                },
                required: ['sha', 'isBugFix', 'category'],
              },
            },
          },
        });

        if (response.text) {
          return JSON.parse(response.text.trim()) as CommitSemanticAnalysis[];
        }
        return null;
      });

      if (Array.isArray(aiResults)) {
        const aiMap = new Map(aiResults.map((item) => [item.sha, item]));
        for (const item of batch) {
          const analysis = aiMap.get(item.sha);
          if (analysis) {
            // Model güveni 0..1 oranı ya da 0..100 ölçeği olarak döndürebilir.
            // Değer aralığa çekilir: negatif veya sonsuz bir değer doğrudan
            // kullanılsaydı güven yüzdesi "-50%" gibi olanaksız görünür ve
            // eşik karşılaştırmaları sessizce bozulurdu.
            const rawConf = typeof analysis.confidence === 'number' && Number.isFinite(analysis.confidence)
              ? analysis.confidence
              : 0.95;
            const confidencePercent = rawConf <= 1 ? rawConf * 100 : rawConf;
            const confidence = Math.min(100, Math.max(0, Math.round(confidencePercent)));

            // Kategori DOĞRULANIR. Şema bir enum dayatır, ama model yanıtı her
            // sağlayıcı ve her hâl için garanti değildir; listeye uymayan bir
            // değer doğrudan `ai_category` alanına yazılırsa, kategoriye göre
            // süzen tüketiciler (bkz. toolRegistry) sessizce boş sonuç döndürür
            // — ölçüm varmış gibi görünürken veri kaybolur. Geçersiz kategori,
            // kural tabanlı (deterministik) kaydın ÜZERİNE yazılmaz: o kayıt
            // zaten `resultMap`te durur, yani kullanıcıya gösterilen sınıflama
            // doğrulanabilir kalır.
            if (!COMMIT_CATEGORIES.includes(analysis.category)) {
              console.warn(
                `[CommitSemanticClassifier] '${item.sha}' için model geçersiz kategori döndürdü ` +
                `('${String(analysis.category)}'); deterministik sınıflama korundu.`,
              );
              continue;
            }

            const fullAnalysis: CommitSemanticAnalysis = {
              sha: item.sha,
              isBugFix: Boolean(analysis.isBugFix),
              category: analysis.category,
              reasoning: analysis.reasoning || 'Gemini anlamsal niyet analizi.',
              confidence,
            };
            this.cache.set(item.sha, fullAnalysis);
            resultMap.set(item.sha, fullAnalysis);
          }
        }
      }
    } catch (err) {
      console.warn(`[CommitSemanticClassifier] Gemini batch analizi başarısız oldu (${batch.length} commit):`, err);
    }
  }
}
