import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import {
  AI_REQUEST_TIMEOUT_MS,
  AI_TOTAL_TIMEOUT_MS,
  AI_RETRY_BASE_DELAY_MS,
  AI_RETRY_MAX_DELAY_MS,
} from './constants.js';
import { boundedExponentialDelay } from './utils/retry.js';
import {
  DevControlTask,
  ensureRuntimeConfig,
  getGeminiKeys,
  getTaskModelConfig,
  normalizeThinkingLevel,
} from './runtimeConfig.js';

const aiInstances = new Map<string, GoogleGenAI>();

export interface GeminiThinkingConfig {
  thinkingLevel: ThinkingLevel;
}

export interface GeminiCallOptions {
  task?: DevControlTask;
  thinkingLevel?: string;
}

/**
 * Fallback model zinciri. Dinamik öncelik Firestore `system_config/devcontrol` dokümanındadır.
 */
export const GEMINI_MODEL_CHAIN = [
  'gemini-4-carbon',
  'gemini-4-hydrogen',
  'gemini-4-argon',
];

function buildThinkingConfigForModel(
  model: string,
  requestedLevel?: string | null,
): GeminiThinkingConfig | undefined {
  const normalized = normalizeThinkingLevel(model, requestedLevel);
  if (!normalized) return undefined;
  return { thinkingLevel: normalized as unknown as ThinkingLevel };
}

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

function getOrCreateClient(apiKey: string): GoogleGenAI {
  let client = aiInstances.get(apiKey);
  if (!client) {
    client = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
    aiInstances.set(apiKey, client);
  }
  return client;
}

export function getGeminiAI(): GoogleGenAI | null {
  const keys = getGeminiKeys();
  const apiKey = keys[0] || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return getOrCreateClient(apiKey);
}

/**
 * Gemini modelleri arasında akıllı model zinciri ve hata toleransıyla içerik üretir.
 *
 * Zincir/geri çekilme iskeleti burada İKİNCİ kez kurulmaz: yürütücü tek
 * kaynaktır (`callGeminiWithRetry`) ve bu fonksiyon ona "her modeli bir kez
 * dene" (`maxRetries = 0`) politikasıyla devreder.
 */
export async function generateGeminiText(
  prompt: string,
  timeoutMs = AI_REQUEST_TIMEOUT_MS,
  maxTotalMs = AI_TOTAL_TIMEOUT_MS,
  options?: GeminiCallOptions,
): Promise<string | null> {
  return callGeminiWithRetry(
    async (ai, model, signal, thinkingConfig) => {
      const result = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          abortSignal: signal,
          ...(thinkingConfig ? { thinkingConfig } : {}),
        },
      });
      if (!result?.text) {
        throw new Error(`Gemini ${model} boş yanıt döndürdü`);
      }
      return result.text;
    },
    0,
    timeoutMs,
    maxTotalMs,
    options,
  );
}

/**
 * Genel amaçlı Gemini işlemi yürütücü. Firestore'dan yüklenen görev modelini,
 * düşünme seviyesini (thinkingLevel), çoklu API anahtarı rotasyonunu ve
 * fallback zincirini yönetir.
 */
export async function callGeminiWithRetry<T>(
  fn: (
    ai: GoogleGenAI,
    model: string,
    signal: AbortSignal,
    thinkingConfig?: GeminiThinkingConfig,
  ) => Promise<T>,
  maxRetries = 1,
  timeoutMs = AI_REQUEST_TIMEOUT_MS,
  maxTotalMs = AI_TOTAL_TIMEOUT_MS,
  options?: GeminiCallOptions,
): Promise<T | null> {
  await ensureRuntimeConfig();
  const keys = getGeminiKeys();
  if (keys.length === 0) return null;

  const task: DevControlTask = options?.task || 'ask_ai';
  const taskCfg = getTaskModelConfig(task);
  const requestedThinking = options?.thinkingLevel || taskCfg.thinkingLevel;

  const candidateModels: string[] = [];
  for (const m of [taskCfg.model, ...taskCfg.fallbackModels, ...GEMINI_MODEL_CHAIN]) {
    if (m && !candidateModels.includes(m)) {
      candidateModels.push(m);
    }
  }

  const deadline = Date.now() + maxTotalMs;
  let backoffExponent = 0;

  for (const model of candidateModels) {
    const thinkingConfig = buildThinkingConfigForModel(model, requestedThinking);

    for (let keyIdx = 0; keyIdx < keys.length; keyIdx++) {
      const ai = getOrCreateClient(keys[keyIdx]);

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const remainingMs = Math.min(timeoutMs, deadline - Date.now());
        if (remainingMs <= 0) return null;
        try {
          return await withTimeout(
            (signal) => fn(ai, model, signal, thinkingConfig),
            remainingMs,
            `Gemini ${model} API request timed out`,
          );
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.warn(
            `[DevControl AI] Model ${model} (key_${keyIdx + 1}/${keys.length}) çağrısında hata alındı:`,
            errMsg.substring(0, 120),
          );

          if (!isTransientGeminiError(errMsg)) {
            break;
          }

          if (attempt < maxRetries) {
            const delayMs = boundedExponentialDelay(
              backoffExponent,
              AI_RETRY_BASE_DELAY_MS,
              AI_RETRY_MAX_DELAY_MS,
              deadline - Date.now(),
            );
            backoffExponent += 1;
            if (delayMs > 0) {
              await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
          }
        }
      }
    }
  }
  return null;
}
