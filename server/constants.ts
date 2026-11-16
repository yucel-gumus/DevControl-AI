/**
 * Sunucu ve istemcinin PAYLAŞTIĞI sabitler. İstemci bu modülden değer içe
 * aktarır (`src/hooks/useAskAi`, `src/hooks/useMetrics`), yani burası istemci
 * paketine girer: modülde `process.env`'den türeyen ya da sunucuya özgü hiçbir
 * değer bulunmamalıdır (gizli anahtar sızmasın diye değil — tarayıcıda
 * `process.env` boş çözülür — istemci paketinin sunucu bağımlılığı kazanmaması
 * ve iki katmanın birbirine dolanmaması için). Sunucuya özgü sabitler
 * `server/constants.ts`'te değil, onu kullanan sunucu modülünde durmalıdır.
 */
import type { EngineeringRisk } from '../src/types.js';

export const MS_PER_SECOND = 1_000;
export const MS_PER_MINUTE = 60 * MS_PER_SECOND;
export const MS_PER_HOUR = 60 * MS_PER_MINUTE;
export const MS_PER_DAY = 24 * MS_PER_HOUR;

export const TELEMETRY_WINDOW_DAYS = 30;

/**
 * Haftalık ölçümlerin penceresi (gün) — TEK kaynak.
 *
 * Aktivite grafiğinin veri isteği (`useActivityData`), grafiğin başlığı ve
 * personanın "son N günün commit sayısı" ölçümü aynı pencereyi anlatır. Üç yerde
 * ayrı yazılan bir `7`, etiket ile ölçümü sessizce ayrıştırırdı: başlık "Son 7
 * Günlük" derken ölçüm başka bir pencereyi sayabilir ve kullanıcı iki farklı
 * sayıyı aynı adda görürdü.
 */
export const ACTIVITY_WINDOW_DAYS = 7;

// Mimari incelemeye gönderilen dosya ağacı girdisi üst sınırı (kırpma loglanır)
export const TREE_ENTRY_LIMIT = 150;

/**
 * Bir commit kaydında tutulabilecek azami dosya sayısı.
 *
 * Üst sınır **kayıt oluşturulurken** uygulanır (snapshot yazılırken değil):
 * hotspot churn'ü bu listeden türetilir ve Firestore'dan yüklenen commitler
 * aynı motorlardan geçer; yalnızca kayıt anında kırpılsaydı, canlı bellekteki
 * commit 300 dosyanın tamamını taşırken snapshot yalnızca ilk 20'sini taşır ve
 * iki yol FARKLI dosya kümeleri üzerinden churn hesaplardı. Sınır kayıt anında
 * uygulandığı için ad kümesi iki yolda da aynıdır.
 *
 * Bu garanti ad KÜMESİ içindir, satır DEĞERLERİ için değil: bütçe kırpması
 * (bkz. fitSnapshotToBudget) bir commit'in `files` alanını düşürürse, o commit
 * için soğuk başlangıçta satır istatistikleri `files_changed` üzerinden tahmin
 * edilir ve canlı ölçümle bire bir tutmaz (bkz.
 * utils/commitFiles.commitFileEntries).
 *
 * Sınır ayrıca snapshot boyutunu da bağlar: commit başına dosya kaydı
 * `{"filename","additions","deletions"}` olarak ~90 bayt tutar; GitHub commit
 * başına 300 dosyaya kadar bildirebildiği için kırpma olmadan 30 depolar × 30
 * commit × 300 dosya ≈ 24 MB'a çıkabilirdi (Firestore doküman sınırı 1 MiB).
 * Üretilen dosya topluluğu (lockfile taraması, vendor güncellemesi) zaten
 * hotspot sıralamasına gürültü eklediğinden bu kırpma ölçüm kalitesini de
 * yükseltir; rapordaki `files_changed` alanı ise kırpılmamış gerçek sayıyı
 * taşır (bkz. githubService commit eşlemesi).
 */
export const MAX_COMMIT_FILES = 20;
export const GITHUB_REQUEST_TIMEOUT_MS = 15_000;
export const AI_REQUEST_TIMEOUT_MS = 35_000;
export const AI_TOTAL_TIMEOUT_MS = 45_000;

// Gemini model zinciri için üstel geri çekilme (exponential backoff) sınırları
export const AI_RETRY_BASE_DELAY_MS = 400;
export const AI_RETRY_MAX_DELAY_MS = 4_000;

// TypeSafe AI System One (Jev) istemci ayarları
export const TYPESAFE_REQUEST_TIMEOUT_MS = 5_000;
export const TYPESAFE_MAX_ATTEMPTS = 3;
export const TYPESAFE_RETRY_BASE_DELAY_MS = 500;
export const TYPESAFE_RETRY_MAX_DELAY_MS = 8_000;

// TypeSafe niyet yönlendirmesi için karar eşikleri
export const TYPESAFE_INTENT_CONFIDENCE_THRESHOLD = 0.45;
export const TYPESAFE_DIRECT_METRIC_NOUL_THRESHOLD = 0.7;
export const TYPESAFE_FACT_ALIGNMENT_THRESHOLD = 0.5;

// Gecikmeye duyarlı TypeSafe çağrılarının bütçesi
export const TYPESAFE_INTENT_TIMEOUT_MS = 5_000;
export const TYPESAFE_INTENT_MAX_ATTEMPTS = 1;
export const TYPESAFE_FACT_CHECK_TIMEOUT_MS = 4_000;
export const TYPESAFE_FACT_CHECK_MAX_ATTEMPTS = 2;

/**
 * /api/ai/ask uç noktasının **yapay zeka aşamaları** için en kötü durum sunucu
 * bütçesi (milisaniye): niyet yönlendirmesi + Gemini sentezi + kanıt doğrulaması.
 *
 * Her TypeSafe çağrısı kendi toplam bütçesiyle (`timeoutMs × maxAttempts`)
 * sınırlanır ve üstel geri çekilme beklemesi bu bütçenin İÇİNDE harcanır; bu
 * yüzden terimler doğrudan çarpım olarak toplanır ve ayrıca bir bekleme payı
 * eklenmez (eklenseydi bütçe olduğundan büyük görünürdü).
 *
 * SINIR: bütçe, uç noktanın önündeki `getActiveTelemetryContext()` adımını
 * kapsamaz. Telemetri yüklüyse uç nokta uçuştaki eşitlemeyi beklemez
 * (`waitForSync: false`); ama hiç yüklü telemetri yokken (soğuk başlangıçta
 * ilk eşitleme sürerken) aynı adım tam bir GitHub eşitlemesini bekler —
 * saniyeler değil onlarca saniye. İstemci zaman aşımı bu yüzden tek başına bu
 * değer değil, iki aşamanın TOPLAMIDIR:
 * `TELEMETRY_SYNC_WAIT_TIMEOUT_MS + AI_ASK_WORST_CASE_MS` (bkz. `useAskAi`).
 * Yalnızca yapay zeka aşamasını kapsayan bir bütçe, eşitleme sürerken dolup
 * istemciyi iptal ettirir; sunucu ise üretmeye devam edip faturalandırdığı
 * cevabı kullanıcıya hiç gösteremezdi.
 *
 * Bu toplam (163 sn) dağıtımda uç katmanın sınırına indirgenir (bkz.
 * `TELEMETRY_SYNC_WAIT_TIMEOUT_MS` -> SINIR ve src/utils/apiClient.ts ->
 * EDGE_TIMEOUT_MS): Hosting arkasında 60 sn'yi aşan hiçbir istek sonuç
 * döndüremez.
 */
export const AI_ASK_WORST_CASE_MS =
  TYPESAFE_INTENT_TIMEOUT_MS * TYPESAFE_INTENT_MAX_ATTEMPTS +
  AI_TOTAL_TIMEOUT_MS +
  TYPESAFE_FACT_CHECK_TIMEOUT_MS * TYPESAFE_FACT_CHECK_MAX_ATTEMPTS;

/**
 * İstemcinin, sunucuda bir GitHub telemetri eşitlemesini bekleyebilecek uç
 * noktalar için tanıdığı süre (milisaniye).
 *
 * Bu uçlar (seçim değişikliği, eşitleme, depo incelemesi, dosya refactor'u,
 * brifing, geliştirici personası) uçuştaki ya da yeni başlayan bir eşitlemeyi
 * bekleyebilir ve eşitleme saniyeler değil onlarca saniye sürebilir (bkz.
 * `getActiveTelemetryContext`); yapay zeka aşamalarının kendi bütçeleri (bkz.
 * `AI_ASK_WORST_CASE_MS`, `AI_TOTAL_TIMEOUT_MS`) bu sürenin İÇİNDE kalır.
 * `/api/ai/ask` bunun istisnasıdır: ölçülen en kötü durumu (bkz.
 * `AI_ASK_WORST_CASE_MS`) bu süreye sığdırmak yerine iki bütçe toplanır
 * (bkz. `useAskAi`), çünkü sığdırma varsayımı sessizce yanlış çıkabilir.
 *
 * Tek kaynak: yedi istemci çağrısına kopyalanmış 120 sn sabiti, sunucu
 * bütçeleri ya da eşitleme süresi değiştiğinde sessizce ayrışırdı.
 *
 * SINIR: Bu bütçenin tamamı dağıtımda KULLANILAMAZ. firebase.json tüm istekleri
 * (`"source": "**"`) Cloud Run'a rewrite eder ve Firebase Hosting, Cloud Run'a
 * proxy'lediği isteği 60 saniyede keser (sınır yükseltilemez; kesilen istek
 * istemciye 504 HTML ağ geçidi sayfası olarak döner). İstemci bu yüzden bütçeyi
 * uç sınırına indirger (bkz. src/utils/apiClient.ts -> EDGE_TIMEOUT_MS) ve uzun
 * süren bir ilk eşitleme Hosting arkasında hiçbir zaman tamamlanamaz: soğuk
 * başlangıçta eşitlemeyi bekleyen uçlar istemci tarafından iptal edilir. Bütçe,
 * uç sınırı olmayan kurulumlarda (doğrudan Cloud Run adresi ya da yerel
 * `npm start`; `VITE_EDGE_TIMEOUT_MS` ile bildirilir) olduğu gibi geçerlidir.
 * Uç sınırını aşan bir eşitlemeyi kaldırabilmenin tek yolu eşitlemeyi istekten
 * ayırmaktır (bkz. README -> Dağıtım notları).
 */
export const TELEMETRY_SYNC_WAIT_TIMEOUT_MS = 120_000;

export const STALE_ISSUE_THRESHOLD_DAYS = 14;
export const STALE_PR_THRESHOLD_DAYS = 7;

/**
 * Bir risk seviyesinin sıralama ağırlığı. Yalnızca karşılaştırma ve filtreleme
 * içindir (ör. "en az HIGH" eşiği); hiçbir yerde ölçüm gibi gösterilmez ve
 * skor hesabına girmez. Ağırlığın tek kaynağı burasıdır: kopyalar zamanla
 * ayrışır ve "CRITICAL, HIGH'dan daha ciddidir" varsayımı sessizce bozulur.
 */
export const RISK_LEVEL_ORDER: Record<EngineeringRisk['severity'], number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

/**
 * Bir risk seviyesinin **birikimli toplam** katkısı (ör. brifingin "en az risk
 * maruziyeti" sıralaması). Yukarıdaki `RISK_LEVEL_ORDER`'dan AYRI bir ölçektir
 * ve onun yerine kullanılamaz: sıralama ölçeği eşit aralıklıdır (4/3/2/1),
 * bu ölçek ise katlanarak büyür (2^(n-1)) — tek bir CRITICAL, iki HIGH'a denk
 * gelir. İki ölçeği tek bir tabloda birleştirmek, seviye sıralamasını ya da
 * ağırlıklı toplamı sessizce değiştirirdi; bu yüzden ikisi de burada, tek
 * dosyada durur ki birlikte ayarlanabilsinler.
 */
export const RISK_SEVERITY_WEIGHT: Record<EngineeringRisk['severity'], number> = {
  CRITICAL: 8,
  HIGH: 4,
  MEDIUM: 2,
  LOW: 1,
};

export const SCORING_THRESHOLDS = {
  CODE_HEALTH_BASE: 95,
  BUG_FIX_PENALTY_WEIGHT: 60,
  CHURN_HIGH_THRESHOLD: 250,
  CHURN_HIGH_PENALTY: 15,
  CHURN_MEDIUM_THRESHOLD: 150,
  CHURN_MEDIUM_PENALTY: 8,
  DELIVERY_BASE_SCORE: 50,
  DELIVERY_ACTIVE_DAY_WEIGHT: 4.5,
  MAINTENANCE_OPEN_HIGH_RATIO: 0.4,
  MAINTENANCE_OPEN_HIGH_PENALTY: 25,
  MAINTENANCE_OPEN_MEDIUM_RATIO: 0.2,
  MAINTENANCE_OPEN_MEDIUM_PENALTY: 10,
} as const;

