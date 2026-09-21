import { GoogleGenAI } from "@google/genai";
import {
  AI_REQUEST_TIMEOUT_MS,
  AI_TOTAL_TIMEOUT_MS,
  AI_RETRY_BASE_DELAY_MS,
  AI_RETRY_MAX_DELAY_MS,
} from './constants.js';
import { boundedExponentialDelay } from './utils/retry.js';

let aiInstance: GoogleGenAI | null = null;

/**
 * Model zinciri en yetenekli modelden en hızlı/hafif modele doğru sıralanır.
 * İlk model kalıcı olmayan bir hata (503/429/zaman aşımı) verirse zincirdeki
 * bir sonraki modele geçilir; böylece yanıt kalitesi kademeli olarak düşer.
 */
export const GEMINI_MODEL_CHAIN = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
];

/**
 * Kalıcı olmayan (tekrar denenebilir) Gemini hata mesajlarını tespit eder.
 */
function isTransientGeminiError(errMsg: string): boolean {
  return (
    errMsg.includes('503') ||
    errMsg.includes('UNAVAILABLE') ||
    errMsg.includes('high demand') ||
    errMsg.includes('429') ||
    errMsg.includes('RESOURCE_EXHAUSTED') ||
    errMsg.includes('500') ||
    errMsg.includes('zaman aşımına uğradı') ||
    errMsg.includes('timed out') ||
    errMsg.includes('fetch failed')
  );
}

/**
 * Bir Gemini çağrısını zaman aşımıyla sınırlar.
 *
 * İki mekanizma birlikte çalışır: süre dolduğunda AbortSignal tetiklenir
 * (alttaki HTTP isteği gerçekten iptal edilir, yetim istek kota tüketmez) VE
 * zaman aşımı ayrıca yarışı kazanır. İkincisi savunma amaçlıdır: `run` çağrısı
 * sinyali kullanmayı unutursa zaman aşımı yine de uygulanır, aksi halde süre
 * sınırı tamamen kozmetik kalırdı.
 */
async function withTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;

  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });

  try {
    // `run` senkron olarak da fırlatabilir (SDK argüman doğrulaması gibi).
    // Çağrı bir promise'e sarılıp try'ın İÇİNDE yapılır: doğrudan
    // `run(controller.signal)` denirse senkron fırlatma `finally`'ye hiç
    // uğramadan yukarı çıkar, `timer` temizlenmez ve yetim kalan zaman aşımı
    // promise'i işlenmeyen redde (unhandled rejection) dönüşerek süreci
    // sonlandırabilir.
    const attempt = Promise.resolve().then(() => run(controller.signal));
    // Zaman aşımı yarışı kazanırsa `attempt` sonradan reddedebilir; bu reddi
    // burada karşılamazsak işlenmeyen promise reddi (unhandled rejection) oluşur.
    attempt.catch(() => undefined);

    return await Promise.race([attempt, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export function getGeminiAI(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }

  if (!aiInstance) {
    aiInstance = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }

  return aiInstance;
}

/**
 * Gemini modelleri arasında akıllı model zinciri ve hata toleransıyla içerik üretir.
 *
 * Zincir/geri çekilme iskeleti burada İKİNCİ kez kurulmaz: yürütücü tek
 * kaynaktır (`callGeminiWithRetry`) ve bu fonksiyon ona "her modeli bir kez
 * dene" (`maxRetries = 0`) politikasıyla devreder. İki kopya, sağlayıcı
 * kesintisinde iki ayrı geri çekilme politikası demekti: yalnızca birinin
 * düzeltildiği bir hata, aynı 429/503 yanıtında uçları farklı gecikmelerle
 * davrandırırdı.
 *
 * Boş yanıt (metin yok) kalıcı hata sayılır ve `callGeminiWithRetry` zincirdeki
 * sıradaki modele geçer; geri çekilme yalnızca geçici hatalarda uygulanır.
 */
export async function generateGeminiText(
  prompt: string,
  timeoutMs = AI_REQUEST_TIMEOUT_MS,
  maxTotalMs = AI_TOTAL_TIMEOUT_MS,
): Promise<string | null> {
  return callGeminiWithRetry(
    async (ai, model, signal) => {
      const result = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { abortSignal: signal },
      });
      if (!result?.text) {
        throw new Error(`Gemini ${model} boş yanıt döndürdü`);
      }
      return result.text;
    },
    0,
    timeoutMs,
    maxTotalMs,
  );
}

/**
 * Genel amaçlı Gemini işlemi yürütücü. Her deneme kendi AbortSignal'ini alır;
 * böylece zaman aşımına uğrayan istek gerçekten iptal edilir ve kalıcı olmayan
 * hatalarda üstel geri çekilme ile yeniden denenir.
 *
 * ÖNEMLİ: `fn` kendisine verilen `signal`'i `config: { abortSignal: signal }`
 * olarak `generateContent` çağrısına iletmelidir. Aksi halde istek sunucu
 * tarafında iptal edilmez; yalnızca çağıran zaman aşımına uğrar ve yetim
 * kalan istek arka planda API kotasını tüketmeye devam eder.
 */
export async function callGeminiWithRetry<T>(
  fn: (ai: GoogleGenAI, model: string, signal: AbortSignal) => Promise<T>,
  maxRetries = 1,
  timeoutMs = AI_REQUEST_TIMEOUT_MS,
  maxTotalMs = AI_TOTAL_TIMEOUT_MS,
): Promise<T | null> {
  const ai = getGeminiAI();
  if (!ai) return null;
  const deadline = Date.now() + maxTotalMs;

  /**
   * Geri çekilme üssü, deneme sayacından (`attempt`) AYRI ve zincir boyunca
   * birikir. Model başına sıfırlanan bir sayaçla (`attempt`, en fazla
   * `maxRetries=1` olduğu için yalnızca 0 görülür) her model aynı taban
   * gecikmeyi bekler: üstel artış hiç gerçekleşmez, `AI_RETRY_MAX_DELAY_MS`
   * erişilemez kalır ve art arda geçici hata veren bir sağlayıcıda zincirin
   * tamamı taban gecikmelerle, artan baskıyla değil, tükenir.
   */
  let backoffExponent = 0;

  for (const model of GEMINI_MODEL_CHAIN) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const remainingMs = Math.min(timeoutMs, deadline - Date.now());
      if (remainingMs <= 0) return null;
      try {
        return await withTimeout(
          (signal) => fn(ai, model, signal),
          remainingMs,
          `Gemini ${model} API request timed out`,
        );
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        // Sessiz kalmak teşhisi imkânsız kılardı: zincirin tümü düştüğünde
        // çağıranlar deterministik bir özete düşer ve kullanıcı yalnızca
        // "yapay zeka cevabı gelmedi" görür; neden yalnızca burada görünür.
        console.warn(`[DevControl AI] Model ${model} çağrısında hata alındı:`, errMsg.substring(0, 120));

        // Kalıcı hata veya deneme hakkı bitti: bu modeli bırak, sıradakine geç
        if (!isTransientGeminiError(errMsg) || attempt === maxRetries) {
          break;
        }

        const delayMs = boundedExponentialDelay(
          backoffExponent,
          AI_RETRY_BASE_DELAY_MS,
          AI_RETRY_MAX_DELAY_MS,
          deadline - Date.now(),
        );
        backoffExponent += 1;
        if (delayMs <= 0) break;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  return null;
}
