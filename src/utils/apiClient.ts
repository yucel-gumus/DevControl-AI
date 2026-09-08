const DEFAULT_TIMEOUT_MS = 60_000;

export interface ApiClientOptions extends RequestInit {
  timeoutMs?: number;
}

/**
 * Merkezi, tip güvenli ve hata ayıklama yetenekli API istemcisi.
 * AbortController ile otomatik zaman aşımı ve tutarlı hata mesajı garantisi sağlar.
 */
export async function apiClient<T = any>(
  url: string,
  options: ApiClientOptions = {}
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchOptions } = options;
  const controller = fetchOptions.signal ? null : new AbortController();
  const timeoutId = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  try {
    const res = await fetch(url, {
      ...fetchOptions,
      signal: fetchOptions.signal || controller?.signal,
      headers: {
        ...(fetchOptions.headers || {}),
      },
    });

    const payload = await res.json().catch(() => null);

    if (!res.ok) {
      const errorMessage =
        payload?.error ||
        payload?.message ||
        `API isteği başarısız oldu (HTTP ${res.status}).`;
      throw new Error(errorMessage);
    }

    return payload as T;
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error('İstek zaman aşımına uğradı. Sunucu yanıt vermedi.');
    }
    throw err;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
