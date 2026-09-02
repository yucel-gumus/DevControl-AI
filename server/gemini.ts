import { GoogleGenAI } from "@google/genai";
import { AI_REQUEST_TIMEOUT_MS, AI_TOTAL_TIMEOUT_MS } from './constants.js';

let aiInstance: GoogleGenAI | null = null;

export const GEMINI_MODEL_CHAIN = [
  'gemini-3.7-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
];

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
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
 * Gemini modelleri arasında akıllı model zinciri ve hata toleransıyla içerik üretir
 */
export async function generateGeminiText(
  prompt: string,
  timeoutMs = AI_REQUEST_TIMEOUT_MS,
  maxTotalMs = AI_TOTAL_TIMEOUT_MS,
): Promise<string | null> {
  const ai = getGeminiAI();
  if (!ai) return null;
  const deadline = Date.now() + maxTotalMs;

  for (const model of GEMINI_MODEL_CHAIN) {
    const remainingMs = Math.min(timeoutMs, deadline - Date.now());
    if (remainingMs <= 0) break;
    try {
      const result = await withTimeout(
        ai.models.generateContent({
          model,
          contents: prompt,
        }),
        remainingMs,
        `Gemini ${model} zaman aşımına uğradı`,
      );

      if (result && result.text) {
        return result.text;
      }
    } catch (err: any) {
      console.warn(`[DevControl AI] Model ${model} çağrısında hata alındı, zincirdeki sonrakine geçiliyor:`, err?.message?.substring(0, 100));
      continue;
    }
  }

  return null;
}

/**
 * Genel amaçlı Gemini işlemi yürütücü (Geriye dönük uyumluluk)
 */
export async function callGeminiWithRetry<T>(
  fn: (ai: GoogleGenAI, model: string) => Promise<T>,
  maxRetries = 1,
  timeoutMs = AI_REQUEST_TIMEOUT_MS,
  maxTotalMs = AI_TOTAL_TIMEOUT_MS,
): Promise<T | null> {
  const ai = getGeminiAI();
  if (!ai) return null;
  const deadline = Date.now() + maxTotalMs;

  for (const model of GEMINI_MODEL_CHAIN) {
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      const remainingMs = Math.min(timeoutMs, deadline - Date.now());
      if (remainingMs <= 0) return null;
      try {
        const result = await withTimeout(
          fn(ai, model),
          remainingMs,
          `Gemini ${model} API request timed out`,
        );
        return result;
      } catch (err: any) {
        const errMsg = err?.message || String(err);
        const isTransient =
          errMsg.includes('503') ||
          errMsg.includes('UNAVAILABLE') ||
          errMsg.includes('high demand') ||
          errMsg.includes('429') ||
          errMsg.includes('RESOURCE_EXHAUSTED') ||
          errMsg.includes('500') ||
          errMsg.includes('timed out') ||
          errMsg.includes('fetch failed');

        if (isTransient && attempt <= maxRetries) {
          const delayMs = Math.min(300, Math.max(0, deadline - Date.now()));
          if (delayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
          continue;
        }
        break; // Bu model başarısız olduysa sonraki modele geç
      }
    }
  }
  return null;
}
