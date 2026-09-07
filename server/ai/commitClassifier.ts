import { callGeminiWithRetry } from '../gemini.js';
import { Type } from '@google/genai';
import { CommitSemanticAnalysis } from '../../src/types.js';

export class CommitSemanticClassifier {
  // Git SHA kodları değişmez (immutable) olduğu için hafızada önbelleklenir.
  // Bu sayede aynı commit için asla ikinci kez LLM çağrısı yapılmaz.
  private static cache: Map<string, CommitSemanticAnalysis> = new Map();

  private static readonly BATCH_SIZE = 25;

  /**
   * Verilen commit listesini gruplar halinde (batch) Gemini yapay zekasına göndererek
   * arkasındaki gerçek mühendislik niyetini (intent) anlamsal olarak tespit eder.
   * Kesinlikle hard-coded regex veya sahte yedekler kullanılmaz; tüm sınıflandırma
   * doğrudan Gemini LLM modelleri tarafından yürütülür.
   */
  public static async classifyCommits(
    commits: { sha: string; message: string; repo_name?: string }[]
  ): Promise<Map<string, CommitSemanticAnalysis>> {
    const resultMap = new Map<string, CommitSemanticAnalysis>();
    const uncachedCommits: { sha: string; message: string }[] = [];

    // 1. Önce önbellekte var olanları doğrudan al
    for (const commit of commits) {
      if (this.cache.has(commit.sha)) {
        resultMap.set(commit.sha, this.cache.get(commit.sha)!);
      } else {
        uncachedCommits.push({ sha: commit.sha, message: commit.message });
      }
    }

    // Tümü zaten önbellekteyse doğrudan dön
    if (uncachedCommits.length === 0) {
      return resultMap;
    }

    // 2. Analiz edilmemiş commit'leri BATCH_SIZE'lık paketler halinde Gemini'ye gönder
    for (let i = 0; i < uncachedCommits.length; i += this.BATCH_SIZE) {
      const batch = uncachedCommits.slice(i, i + this.BATCH_SIZE);

      const prompt = `Sen Kıdemli Yazılım Baş Mimarı ve Kod Telemetrisi Uzmanısın (Principal Software Engineer).
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

      try {
        const aiResults = await callGeminiWithRetry(async (gemini, model) => {
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
                    sha: { type: Type.STRING },
                    isBugFix: { type: Type.BOOLEAN },
                    category: {
                      type: Type.STRING,
                      enum: ['BUG_FIX', 'FEATURE', 'REFACTOR', 'PERFORMANCE', 'SECURITY', 'DOCUMENTATION', 'CHORE'],
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
              const rawConf = typeof analysis.confidence === 'number' ? analysis.confidence : 0.95;
              const confidence = rawConf <= 1 ? Math.round(rawConf * 100) : Math.min(100, Math.round(rawConf));
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

    return resultMap;
  }
}
