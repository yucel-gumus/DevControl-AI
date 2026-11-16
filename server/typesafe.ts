import {
  TYPESAFE_REQUEST_TIMEOUT_MS,
  TYPESAFE_MAX_ATTEMPTS,
  TYPESAFE_RETRY_BASE_DELAY_MS,
  TYPESAFE_RETRY_MAX_DELAY_MS,
} from './constants.js';
import { boundedExponentialDelay } from './utils/retry.js';
import { ensureRuntimeConfig, getTypeSafeRuntimeConfig } from './runtimeConfig.js';

export interface ChoiceQuestion {
  type: 'choice';
  instructions: string | Record<string, any> | any[];
  criteria: Record<string, string | null | Record<string, any>>;
}

export interface ScoreQuestion {
  type: 'score';
  instructions: string | Record<string, any> | any[];
  criteria: (string | Record<string, any>)[];
}

export interface NoulQuestion {
  type: 'noul';
  instructions: string | Record<string, any> | any[];
  criteria?: {
    true?: string | Record<string, any>;
    false?: string | Record<string, any>;
  };
}

export type SystemOneQuestion = ChoiceQuestion | ScoreQuestion | NoulQuestion;

export interface ChoiceAnswer {
  type: 'choice';
  choice: string;
  /**
   * Modelin bildirdiği güven (0..1) ya da `null` — model güven bildirmediyse
   * veya aralık dışı bir değer verdiyse `null`. Sıfır ile `null` AYRI şeylerdir:
   * eksik bir ölçümü 0'a çevirmek, karar eşiğinin altında kalıp yönlendirmeyi
   * devre dışı bıraksa da iz ekranında "Güven: %0" gibi ölçülmüş görünen bir
   * değer üretir ve "güven bildirilmedi" durumunu görünmez kılar (bkz.
   * agentPlanner: null -> "belirtilmedi", eşik karşılaştırması `?? 0`).
   */
  confidence: number | null;
}

export interface ScoreAnswer {
  type: 'score';
  score: number;
  /** `ChoiceAnswer.confidence` ile aynı sözleşme (bkz. oradaki açıklama). */
  confidence: number | null;
}

export interface NoulAnswer {
  type: 'noul';
  noul: number;
}

export type SystemOneAnswer = ChoiceAnswer | ScoreAnswer | NoulAnswer;

/**
 * Doğrulanmış yanıt zarfı. Ayrıştırıcı, **hiçbir çağıranın okumadığı** alanları
 * (zarfın `usage`'ı; cevapların `probabilities` dağılımı ve `legend` lejantı)
 * bilinçli olarak taşımaz: kullanılmayan alan taşımak, türün ürettiği gerçek
 * şekli yanlış anlatır ve o alanların okunduğu izlenimini verirdi.
 */
export interface SystemOneResponse {
  model: string;
  answers: Record<string, SystemOneAnswer>;
}

export interface SystemOneRequestOptions {
  state: any;
  questions: Record<string, SystemOneQuestion>;
  model?: string;
  timeoutMs?: number;
  /** Azami deneme sayısı. Gecikmeye duyarlı çağrılar 1 geçerek tek denemeyle sınırlar. */
  maxAttempts?: number;
  /**
   * Çağrının tamamı için üst sınır (ms). Verilmezse `timeoutMs * maxAttempts`
   * kullanılır; böylece en kötü durum süresi deneme sayısıyla birlikte
   * öngörülemez biçimde büyümez.
   */
  maxTotalMs?: number;
}

const TYPESAFE_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const TYPESAFE_DEFAULT_MODEL = 'jev-latest';

/**
 * TypeSafe dokümantasyonunun zorunlu kıldığı yeniden deneme durum kodları.
 * 429 (rate limit) ve 529 (aşırı yük) geçici kabul edilir; 5xx de aynı şekilde.
 */
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504, 529]);

/**
 * TypeSafe API anahtarını ortam değişkenlerinden güvenle çeker.
 * Kanonik ad 'TYPESAFE_API_KEY'; eski kurulumlarla uyumluluk için 'TYPESAFEAI'
 * da kabul edilir. İkisi de tanımlıysa kanonik ad kazanır.
 *
 * Sıra `||` ile çözülmez: bir `.env` satırındaki ya da Cloud Run gizli
 * değişkenindeki değer yalnızca beyaz boşluk olabilir. `' ' || alias` ifadesi
 * boşluğu "tanımlı" sayar, ardından beyaz boşluk denetimi `null` döndürür ve
 * GEÇERLİ bir eski anahtar gölgelenir; yani TypeSafe katmanı (niyet
 * yönlendirmesi ve kanıt doğrulaması) sessizce devre dışı kalırdı. Boşluklu ad
 * bu yüzden yok sayılır ve sıradaki ad denenir.
 */
export function getTypeSafeApiKey(): string | null {
  const { apiKey } = getTypeSafeRuntimeConfig();
  if (apiKey && /^[\x21-\x7E]+$/.test(apiKey)) {
    return apiKey;
  }
  for (const candidate of [process.env.TYPESAFE_API_KEY, process.env.TYPESAFEAI]) {
    if (typeof candidate === 'string' && /^[\x21-\x7E]+$/.test(candidate.trim())) {
      return candidate.trim();
    }
  }
  return null;
}

/**
 * TypeSafe AI servisinin yapılandırılıp yapılandırılmadığını döner.
 */
export function isTypeSafeConfigured(): boolean {
  return getTypeSafeApiKey() !== null;
}

/**
 * Servisin `confidence` ve `noul` alanları için belgelediği 0..1 aralığında mı?
 *
 * `confidence` bir olasılıktır, `noul` ise "cevap evet mi" olasılığıdır
 * (0 = hayır, 1 = evet). Aralık dışı bir değer (ör. 0-100 ölçeğinde dönmüş bir
 * güven ya da NaN) doğrulanmadan geçerse ölçüm bozulur: eşik kararları haksız
 * yere geçer ve iz ekranı "%140" gibi olanaksız bir yüzde gösterir. Bu yüzden
 * aralık dışı değerler geçersiz sayılır.
 *
 * `score` bu kontrolün DIŞINDADIR: o 0..1'e normalleştirilmiş bir oran değil,
 * sorunun kendi seviye eksenindeki konumdur (bkz. toScoreAnswer).
 */
function isUnitInterval(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

/**
 * Soru tanımından `score` cevabının üst sınırını (en yüksek seviye numarası)
 * çıkarır. Yanıt anahtarı istekte tanımlı değilse `null` döner.
 */
function topLevelNumberOf(
  questions: Record<string, SystemOneQuestion>,
  answerKey: string,
): number | null {
  const question = questions[answerKey];
  if (!question || question.type !== 'score') return null;
  return Math.max(0, question.criteria.length - 1);
}


/** Doğrulanmış alanlardan tip güvenli bir `choice` cevabı kurar; uymuyorsa null. */
function toChoiceAnswer(value: Record<string, unknown>): ChoiceAnswer | null {
  if (value.type !== 'choice' || typeof value.choice !== 'string') return null;
  return {
    type: 'choice',
    choice: value.choice,
    // Eksik ya da aralık dışı güven `null` kalır (0 DEĞİL): yönlendirme yine
    // güvenli biçimde devre dışı kalır — karar eşiği karşılaştırması `?? 0`
    // ile açıkça yapılır (bkz. agentPlanner) — ama iz ekranı "Güven: %0" diye
    // ölçülmüş görünen bir değer basmaz, "belirtilmedi" yazar.
    confidence: isUnitInterval(value.confidence) ? value.confidence : null,
  };
}

/**
 * Doğrulanmış alanlardan tip güvenli bir `score` cevabı kurar; uymuyorsa null.
 *
 * `score`, seviye numaralarının olasılık ağırlıklı ortalamasıdır: 3 seviyeli
 * bir soruda 0..2 arasında bir konumdur (ör. 1.43) ve seviyeler arasına
 * düşebilir. Üst sınır bu yüzden sorunun seviye sayısından gelir — 0..1
 * kontrolü, en yüksek seviyeyi (ör. 2.0) geçersiz sayıp cevabı tümden
 * düşürürdü; yani aciliyet ölçeğinin tepesindeki sorular iz ekranında hiç
 * aciliyet göstermezdi. Yanıt anahtarı istekte tanımlı değilse (model fazladan
 * cevap döndürdüyse) ölçek bilinmez; yalnızca sonlu ve negatif olmayan değer
 * kabul edilir.
 */
function toScoreAnswer(
  value: Record<string, unknown>,
  topLevelNumber: number | null,
): ScoreAnswer | null {
  if (value.type !== 'score') return null;
  const score = value.score;
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0) return null;
  if (topLevelNumber !== null && score > topLevelNumber) return null;
  return {
    type: 'score',
    score,
    confidence: isUnitInterval(value.confidence) ? value.confidence : null,
  };
}

/** Doğrulanmış alanlardan tip güvenli bir `noul` cevabı kurar; uymuyorsa null. */
function toNoulAnswer(value: Record<string, unknown>): NoulAnswer | null {
  if (value.type !== 'noul' || !isUnitInterval(value.noul)) return null;
  return { type: 'noul', noul: value.noul };
}

/**
 * API'den dönen cevabı doğrular ve yalnızca şemaya uyan cevapları korur.
 *
 * Doğrulama **cevap bazındadır**: tanınmayan veya alanları bozuk tek bir cevap,
 * geçerli olan diğer cevapları düşürmemelidir. Aksi halde (tüm gövdeyi
 * reddeden bir kontrol) tek bir sapma hem niyet yönlendirmesini hem de kanıt
 * doğrulamasını sessizce devre dışı bırakırdı.
 *
 * Zarfın kendisi kullanılamıyorsa (answers bir nesne değilse) `null` döner.
 *
 * `questions` istekte gönderilen soru tanımlarıdır; `score` cevaplarının
 * geçerlilik aralığı soru bazında olduğu için (bkz. toScoreAnswer) ayrıştırma
 * bu tanımlara ihtiyaç duyar.
 */
function parseSystemOneResponse(
  value: unknown,
  questions: Record<string, SystemOneQuestion>,
): SystemOneResponse | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Record<string, unknown>;
  // `answers` bir nesne olmalıdır; dizi de `typeof` olarak 'object'tir ama
  // beklenen harita şeklini taşımaz (boş bir haritaya düşer ve geçerli bir
  // yanıt gibi görünürdü).
  if (
    typeof candidate.answers !== 'object' ||
    candidate.answers === null ||
    Array.isArray(candidate.answers)
  ) {
    return null;
  }

  const answers: Record<string, SystemOneAnswer> = {};
  let droppedAnswers = 0;

  for (const [key, rawAnswer] of Object.entries(candidate.answers as Record<string, unknown>)) {
    const answer =
      typeof rawAnswer === 'object' && rawAnswer !== null
        ? (toChoiceAnswer(rawAnswer as Record<string, unknown>) ??
           toScoreAnswer(rawAnswer as Record<string, unknown>, topLevelNumberOf(questions, key)) ??
           toNoulAnswer(rawAnswer as Record<string, unknown>))
        : null;

    if (answer) {
      // Anahtarlar modelin döndürdüğü gövdeden gelir. Düz atama
      // (`answers[key] = answer`) `__proto__` gibi bir anahtarda nesnenin
      // prototipini değiştirir: cevap kendi özelliği olarak kaydedilmez,
      // sessizce kaybolur ve dönen haritanın prototipi model çıktısıyla
      // değiştirilmiş olur. `defineProperty` prototip setter'ını devre dışı
      // bırakıp her anahtarı gerçek bir özellik olarak yazar.
      Object.defineProperty(answers, key, {
        value: answer,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    } else {
      droppedAnswers += 1;
    }
  }

  if (droppedAnswers > 0) {
    console.warn(
      `[TypeSafe AI] ${droppedAnswers} cevap beklenen şemaya uymadığı için yok sayıldı; ` +
      `geçerli cevaplar kullanılmaya devam ediyor.`,
    );
  }

  // Hiç geçerli cevap yoksa yanıt kullanılamaz sayılır: boş bir `answers`
  // nesnesini başarılı bir System One yanıtı gibi döndürmek, çağıranda
  // "yönlendirme yapıldı" izlenimi bırakır ve kanıt doğrulaması sessizce
  // atlanır (ölçüm yokken ölçüm yapılmış gibi görünür).
  if (Object.keys(answers).length === 0) {
    console.warn('[TypeSafe AI] Yanıt hiçbir geçerli cevap içermiyor; yanıt yok sayıldı.');
    return null;
  }

  return {
    model: typeof candidate.model === 'string' ? candidate.model : 'bilinmiyor',
    answers,
  };
}

interface SystemOneAttempt {
  /** Başarılıysa doğrulanmış yanıt, aksi halde null. */
  response: SystemOneResponse | null;
  /** Hata geçici mi (429/529/5xx veya ağ hatası) — yalnızca yeniden denenebilir. */
  retryable: boolean;
}

/**
 * Tek bir HTTP denemesi yürütür. Geçici hata durumunda hatanın yeniden
 * denenebilir olup olmadığını çağırana bildirir.
 */
async function attemptSystemOneCall(
  apiKey: string,
  body: string,
  model: string,
  timeoutMs: number,
  questions: Record<string, SystemOneQuestion>,
): Promise<SystemOneAttempt> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(TYPESAFE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'DevControl-AI/1.0',
      },
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      console.warn(
        `[TypeSafe AI] API isteği başarısız oldu (${response.status}):`,
        errorBody.substring(0, 150),
      );
      return { response: null, retryable: RETRYABLE_STATUS_CODES.has(response.status) };
    }

    const data: unknown = await response.json();
    const parsed = parseSystemOneResponse(data, questions);
    if (!parsed) {
      console.warn(`[TypeSafe AI] ${model} modelinden kullanılabilir bir yanıt alınamadı.`);
      return { response: null, retryable: false };
    }

    return { response: parsed, retryable: false };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.warn(`[TypeSafe AI] İstek zaman aşımına uğradı (${timeoutMs}ms)`);
      return { response: null, retryable: true };
    }
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn('[TypeSafe AI] Bağlantı veya yürütme hatası:', errMsg.substring(0, 150));
    return { response: null, retryable: true };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * TypeSafe System One (Jev) modeline doğrudan ve tip-güvenli çağrı yapar.
 * Node.js yerleşik fetch API'si kullanır (sıfır ek bağımlılık).
 *
 * 429/529 ve 5xx yanıtlarında dokümantasyonun şart koştuğu üstel geri çekilme
 * uygulanır. Tüm denemeler tükendiğinde `null` döner ve çağıran katman
 * deterministik yedeğine düşer.
 */
export async function callTypeSafeSystemOne(
  options: SystemOneRequestOptions
): Promise<SystemOneResponse | null> {
  await ensureRuntimeConfig();
  const runtimeCfg = getTypeSafeRuntimeConfig();
  const apiKey = getTypeSafeApiKey();
  if (!apiKey) {
    return null;
  }

  const model = options.model || runtimeCfg.model || TYPESAFE_DEFAULT_MODEL;
  const timeoutMs = options.timeoutMs ?? TYPESAFE_REQUEST_TIMEOUT_MS;
  const maxAttempts = Math.max(1, options.maxAttempts ?? TYPESAFE_MAX_ATTEMPTS);
  const maxTotalMs = options.maxTotalMs ?? timeoutMs * maxAttempts;
  const deadline = Date.now() + maxTotalMs;
  const body = JSON.stringify({
    state: options.state,
    model,
    questions: options.questions,
  });

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const remainingMs = Math.min(timeoutMs, deadline - Date.now());
    if (remainingMs <= 0) {
      console.warn(
        `[TypeSafe AI] Toplam süre bütçesi (${maxTotalMs}ms) doldu; çağrı ${attempt}. denemede kesildi.`,
      );
      return null;
    }

    const result = await attemptSystemOneCall(apiKey, body, model, remainingMs, options.questions);
    if (result.response) {
      return result.response;
    }
    if (!result.retryable || attempt === maxAttempts - 1) {
      return null;
    }

    const delayMs = boundedExponentialDelay(
      attempt,
      TYPESAFE_RETRY_BASE_DELAY_MS,
      TYPESAFE_RETRY_MAX_DELAY_MS,
      deadline - Date.now(),
    );
    if (delayMs <= 0) {
      return null;
    }
    console.warn(
      `[TypeSafe AI] Geçici hata, ${delayMs}ms sonra yeniden denenecek (deneme ${attempt + 2}/${maxAttempts}).`,
    );
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  return null;
}
