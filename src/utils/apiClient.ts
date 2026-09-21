const DEFAULT_TIMEOUT_MS = 60_000;

const API_TOKEN_STORAGE_KEY = 'devcontrol_api_token';

/**
 * Dağıtımın uç (edge) katmanının istek başına zaman aşımı; `null` ise sınır yok.
 *
 * firebase.json tüm istekleri (`"source": "**"`) Cloud Run servisine rewrite
 * eder ve Firebase Hosting, Cloud Run'a proxy'lediği bir isteği 60 saniyede
 * keser (sınır yükseltilemez; kesilen istek istemciye 504 HTML ağ geçidi sayfası
 * olarak döner — JSON değil). Cloud Run'ın kendi zaman aşımı hiçbir zaman
 * bağlayıcı olmaz.
 *
 * Bu yüzden istemci, uç katmanın keseceği bir isteği beklemek yerine kendi
 * iptalini yapar (bkz. capToEdgeLimit): hiçbir bütçe uç sınırını aşamaz. Fark,
 * ayrıştırılamayan bir 504 gövdesi yerine `ApiTimeoutError` görmektir — çağıran
 * katman kullanıcıya gerçek mesajı gösterebilir.
 *
 * `VITE_EDGE_TIMEOUT_MS` ile geçersiz kılınır (Vite değeri derleme anında
 * pakete gömer). Değer 0 ya da negatifse sınır uygulanmaz: uç katmanı olmayan
 * kurulumlar (doğrudan Cloud Run adresi, yerel `npm start`) tam bütçelerini
 * kullanabilir. Ayrıştırılamayan bir değer varsayılana (60 sn) düşer — sessizce
 * "sınır yok" saymak, dağıtımda tam olarak kaçınılan 504 davranışını geri
 * getirirdi.
 */
const EDGE_TIMEOUT_MS = ((): number | null => {
  const raw = import.meta.env.VITE_EDGE_TIMEOUT_MS;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      return parsed > 0 ? parsed : null;
    }
  }
  return 60_000;
})();

/**
 * Uç katmanın keseceği ana çok yakın bir anda iptal etmemek için pay: ağ
 * gecikmesi ve yanıtın istemciye dönüş süresi de aynı 60 saniyenin içindedir.
 */
const EDGE_SAFETY_MARGIN_MS = 5_000;

/** Alt sınır: aşırı küçük bir uç sınırı bütçeyi sıfıra ya da negatife çekmesin. */
const MIN_TIMEOUT_MS = 1_000;

/**
 * İstenen bütçeyi uç katmanın sınırına indirger (sınır yoksa dokunmaz).
 *
 * Kısaltma TEK YÖNLÜDÜR: bir bütçe asla yükseltilmez. Sonucu `Math.max(MIN, …)`
 * ile alt sınıra yuvarlamak (eski davranış), sınırın altındaki her bütçeyi
 * 1 sn'ye ÇIKARIRDI: çağıranın bilinçli olarak kısa tuttuğu bir istek (ör. hızlı
 * bir durum yoklaması) öngörülenden uzun bekler ve zaman aşımı sözleşmesi
 * sessizce değişirdi. Alt sınır bu yüzden yalnızca **tavan** için geçerlidir:
 * uç sınırı güvenlik payından küçükse (ör. 5 sn) tavan 1 sn'ye oturur ve tüm
 * bütçeler ona indirgenir — bu, `VITE_EDGE_TIMEOUT_MS`'in kullanılamaz biçimde
 * küçük ayarlandığı bir yapılandırma hatasıdır, sessizce yükseltme değil.
 */
function capToEdgeLimit(timeoutMs: number): number {
  if (EDGE_TIMEOUT_MS === null) return timeoutMs;
  const ceiling = Math.max(MIN_TIMEOUT_MS, EDGE_TIMEOUT_MS - EDGE_SAFETY_MARGIN_MS);
  return Math.min(timeoutMs, ceiling);
}

export interface ApiClientOptions extends RequestInit {
  timeoutMs?: number;
}

/**
 * Sunucuda DEVCONTROL_API_TOKEN tanımlıysa istemcinin aynı jetonu göndermesi
 * gerekir. Jeton tarayıcıda saklanır ve yalnızca aynı kaynağa yapılan
 * isteklere eklenir (bkz. isSameOriginRequest).
 */
function getStoredApiToken(): string | null {
  try {
    return window.localStorage.getItem(API_TOKEN_STORAGE_KEY);
  } catch {
    // Gizli mod veya depolama engelli: jetonsuz devam edilir.
    return null;
  }
}

/**
 * İsteğin aynı kaynağa gittiğini döner.
 *
 * Çağrıların tamamı bugün göreli (`/api/...`) yollar kullanır ve göreli yol her
 * zaman aynı kaynağa çözülür. Ama `apiClient` mutlak bir URL de kabul eder
 * (ör. uç katmanı atlamak için doğrudan bir Cloud Run adresi); bu durumda jeton
 * koşulsuz eklenirse sunucunun sırrı, ihtiyacı olmayan ve kaydedebilecek bir
 * tarafa gider. Çözülemeyen bir URL güvenli taraf sayılır: jeton eklenmez.
 */
function isSameOriginRequest(url: string): boolean {
  try {
    return new URL(url, window.location.origin).origin === window.location.origin;
  } catch {
    return false;
  }
}

/**
 * Zaman aşımı nedeniyle iptal edilen istekleri diğer ağ hatalarından ayırır;
 * böylece çağıran katman kullanıcıya doğru mesajı gösterebilir.
 */
export class ApiTimeoutError extends Error {
  constructor(message = 'İstek zaman aşımına uğradı. Sunucu yanıt vermedi.') {
    super(message);
    this.name = 'ApiTimeoutError';
  }
}

/**
 * Bilinmeyen bir hatadan kullanıcıya gösterilecek mesajı çıkarır.
 *
 * Tek kaynak olmasının nedeni: aynı başarısız istek, panodaki uyarı şeridinde
 * ve sohbet balonunda görünür. İki kopya, aynı hatayı iki farklı cümleyle
 * anlatırdı. `Error` olmayan reddetmeler (ör. fırlatılmış bir dizgi, `undefined`)
 * burada ele alınır; aksi halde mesaj `undefined` olarak görünürdü.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'İstek işlenirken beklenmeyen bir hata oluştu.';
}

/**
 * Merkezi, tip güvenli ve hata ayıklama yetenekli API istemcisi.
 * AbortController ile otomatik zaman aşımı (uç katman sınırına indirgenmiş,
 * bkz. capToEdgeLimit) ve tutarlı hata mesajı garantisi sağlar.
 */
export async function apiClient<T = any>(
  url: string,
  options: ApiClientOptions = {}
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal: callerSignal, ...fetchOptions } = options;
  const effectiveTimeoutMs = capToEdgeLimit(timeoutMs);
  // Zaman aşımı HER istekte uygulanır — çağıran kendi `signal`ını verse de.
  // İkisinden birini seçmek (eski davranış: çağıranın sinyali varsa zaman
  // aşımını tamamen kapatmak) sessiz bir sözleşme değişikliğiydi: sinyal taşıyan
  // bir çağrı, uç katmanın keseceği bir isteği süresiz bekleyebilir ve kullanıcı
  // ayrıştırılamayan bir 504 görürdü. İki sinyal tek denetleyicide birleşir.
  const controller = new AbortController();
  let didTimeOut = false;
  const timeoutId = setTimeout(() => {
    didTimeOut = true;
    controller.abort();
  }, effectiveTimeoutMs);
  const forwardCallerAbort = () => controller.abort();
  if (callerSignal) {
    if (callerSignal.aborted) {
      // Sinyal istek başlamadan önce zaten iptal edilmişti; `fetch` yine de
      // reddeder, ama denetleyiciyi şimdi iptal etmek aynı sonucu üretirken
      // iptalin kaynağını (çağıran) `didTimeOut` üzerinden ayırt edilebilir
      // tutar.
      controller.abort();
    } else {
      callerSignal.addEventListener('abort', forwardCallerAbort, { once: true });
    }
  }
  const apiToken = getStoredApiToken();

  try {
    const res = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        ...(apiToken && isSameOriginRequest(url)
          ? { Authorization: `Bearer ${apiToken}` }
          : {}),
        ...(fetchOptions.headers || {}),
      },
    });

    // Gövde çözümlemesi iptalden AYRI ele alınır. Zaman aşımı tam bu adımda
    // tetiklenirse `res.json()` AbortError ile reddeder; eski `catch(() => null)`
    // bu reddi yutup çağırana başarılı bir yanıtla `null` gövde döndürürdü —
    // çağıran `null` üzerinden alan okumaya çalışıp ("Cannot read properties of
    // null") çöker, kullanıcı ise zaman aşımı mesajı yerine anlamsız bir hata
    // görürdü. İptal bu yüzden yukarıya taşınır.
    let payload: any = null;
    let bodyParsed = true;
    try {
      payload = await res.json();
    } catch (parseErr: any) {
      if (parseErr?.name === 'AbortError') throw parseErr;
      bodyParsed = false;
    }

    if (!res.ok) {
      const errorMessage =
        payload?.error ||
        payload?.message ||
        `API isteği başarısız oldu (HTTP ${res.status}).`;
      throw new Error(errorMessage);
    }

    // 2xx ama gövde JSON değil: istemcinin beklediği sözleşme tutulmamış
    // demektir (ör. araya giren bir katman HTML döndürdü). Sessizce `null`
    // döndürmek hatayı çağıranın derinliklerine taşır; burada açıkça bildirilir.
    if (!bodyParsed) {
      throw new Error(`Sunucudan beklenen JSON yanıtı alınamadı (HTTP ${res.status}).`);
    }

    return payload as T;
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      // İptal çağırandan geldiyse bu bir zaman aşımı DEĞİLDİR: çağıran kendi
      // isteğini bilinçli olarak durdurmuştur ve "sunucu yanıt vermedi" mesajı
      // yanlış olurdu.
      if (!didTimeOut) throw err;
      throw new ApiTimeoutError();
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
    callerSignal?.removeEventListener('abort', forwardCallerAbort);
  }
}
