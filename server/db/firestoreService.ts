import { initializeApp, getApps, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { MS_PER_DAY } from '../constants.js';
import { commitFileNames } from '../utils/commitFiles.js';
import {
  TodayBriefItem,
  DeveloperPersona,
  Repository,
  RepoAiReview,
  CommitMetric,
  PullRequestMetric,
  IssueMetric,
  TelemetrySyncStatus,
} from '../../src/types.js';

/**
 * Firestore'da saklanan tek telemetri belgesinin sözleşmesi.
 *
 * Belge yalnızca **ham telemetriyi** (depolar, commitler, PR'lar, issue'lar)
 * taşır. Kural motoru çıktıları (hotspot/risk/sağlık) BİLEREK saklanmaz: bu
 * çıktılar ham telemetrinin saf fonksiyonlarıdır ve `getActiveTelemetryContext`
 * her istekte commitlerden yeniden hesaplar. Saklansalardı iki kopya ayrışabilir
 * (bkz. SNAPSHOT_SCHEMA_VERSION) ve belge başına ~119 KiB'lik gereksiz yük
 * oluştururlardı.
 *
 * Depo düzeyinde dil dağılımı (`Repository.languages`) ham telemetrinin
 * parçasıdır ve kaydedilir; portföy geneli kırılım ise BURADA TUTULMAZ, çünkü
 * türevidir: tek tüketicisi olan bir toplama alanı, bayt bütçesiyle sınırlı bir
 * belgede kullanılmayan bir yük demekti (bkz. SNAPSHOT_MAX_BYTES).
 */
export interface TelemetrySnapshot {
  savedAt: string;
  lastSyncAt: string;
  user: any;
  repositories: Repository[];
  commits: CommitMetric[];
  pullRequests: PullRequestMetric[];
  issues: IssueMetric[];
  dailyBrief: TodayBriefItem[];
  developerPersona: DeveloperPersona | null;
  commitsCount: number;
  pullRequestsCount: number;
  /**
   * Eşitlemenin kapsamı ve başarı durumu. Kaydedilir çünkü türetilemez: ham
   * telemetriden bakıldığında "10 deponun 3'ü hata verdiği için kısmi" bilgisi
   * görünmez. Kaydedilmezse yeniden başlatma sonrası her eşitleme "tamamlandı"
   * gibi raporlanır (bkz. GitHubService.restoreTelemetryStatus).
   */
  telemetryStatus?: TelemetrySyncStatus;
  version: string;
}

export class FirestoreService {
  private static app: App | null = null;
  private static db: Firestore | null = null;
  private static isInitialized = false;
  private static initError: string | null = null;

  /**
   * Snapshot şemasının sürümü. Snapshot içindeki **türev çıktıların** (yapay
   * zeka sentezleri: brifing, persona) sözleşmesi değiştiğinde bu değer
   * artırılmalıdır.
   *
   * Sürüm uyuşmazlığında türev çıktılar okuma sırasında düşürülür: kod artık
   * aynı çıktıyı üretmediği hâlde eski kaydı "taze" gibi servis etmek, ölçüm
   * yerine eski bir metni göstermek demektir (ör. kaldırılan uydurma alanlar).
   * Ham telemetri (depolar, commitler, PR'lar, issue'lar) koddan bağımsız
   * olduğu için korunur; kural motoru çıktıları ise zaten saklanmaz (bkz.
   * TelemetrySnapshot), her istekte yeniden hesaplanır.
   */
  private static readonly SNAPSHOT_SCHEMA_VERSION = '1.1.0';

  /**
   * Snapshot'ın Firestore'a yazılabilecek azami boyutu.
   *
   * Firestore'un sert doküman sınırı 1 MiB'dir ve sınırı aşan `set` çağrısı
   * reddedilir. Reddedilen yazma sessizce kaybolurdu: `POST /api/repos/sync`
   * başarı döner, ama soğuk başlangıç önbelleği hiç dolmaz ve her yeniden
   * başlatma tam bir GitHub eşitlemesi (dakikalar + kota) çalıştırır. Bu yüzden
   * yazımdan önce ölçülür ve **yazılabilir** hâle getirilir; sığdırılamazsa
   * hiç yazılmaz (bkz. fitSnapshotToBudget).
   *
   * 900 KiB, sınırın hemen altı değil bilinçli bir pay bırakır: doküman boyutu
   * JSON'dan büyüktür (Firestore alan adlarını ve tür etiketlerini de saklar).
   */
  private static readonly SNAPSHOT_MAX_BYTES = 900 * 1024;

  // Koleksiyon İsimleri (Anti-Bloat Standartları)
  private static readonly SNAPSHOTS_COLLECTION = 'devcontrol_snapshots';
  private static readonly REVIEWS_COLLECTION = 'devcontrol_repo_reviews';
  private static readonly LATEST_DOC_ID = 'latest';

  /**
   * Mimari inceleme raporlarının şema sürümü. İnceleme gövdesinin sözleşmesi
   * değiştiğinde (bir alan kaldırıldığında, anlamı değiştiğinde) artırılır.
   *
   * Eski sürümle yazılmış kayıtlar okuma sırasında yok sayılır: kaldırılmış
   * şablon varsayılanlarıyla üretilmiş bir raporu (ör. hiç ölçülmemiş bir
   * "82/100" puanı) yeni kodun ölçümü gibi servis etmek, ölçüm yerine eski bir
   * metni göstermek olurdu. TTL bu boşluğu kapatmaz — 7 gün boyunca bayat kayıt
   * "taze" sayılırdı.
   */
  private static readonly REVIEW_SCHEMA_VERSION = 2;

  // Mimari inceleme raporlarının bayatlamadan önceki azami yaşı
  private static readonly REVIEW_TTL_MS = 7 * MS_PER_DAY;

  /**
   * Depo adını çakışmasız bir Firestore doküman kimliğine dönüştürür.
   *
   * `encodeURIComponent` kullanılır çünkü Firestore'da yalnızca `/` yasaktır ve
   * kodlama bire birdir (iki farklı ad asla aynı kimliğe düşmez). Ad ayrıca
   * küçük harfe indirgenir: aynı depo farklı büyük/küçük harfle istendiğinde
   * (uç nokta depo adını büyük/küçük harf duyarsız eşler) önbellek isabet
   * etmeli ve ikinci bir kopya doküman oluşmamalıdır.
   */
  private static reviewDocId(repoName: string): string {
    return encodeURIComponent(repoName.trim().toLowerCase());
  }

  /**
   * Firebase Admin ve Firestore bağlantısını başlatır (ADC / Ortam Değişkenleri ile).
   */
  public static initialize(): boolean {
    if (this.isInitialized && this.db) {
      return true;
    }

    try {
      const projectId =
        process.env.FIREBASE_PROJECT_ID ||
        process.env.GOOGLE_CLOUD_PROJECT ||
        process.env.GCP_PROJECT;
      const databaseId = process.env.FIRESTORE_DATABASE_ID || '(default)';

      const defaultApp = getApps().find((app) => app.name === '[DEFAULT]');
      if (defaultApp) {
        this.app = defaultApp;
      } else {
        this.app = projectId ? initializeApp({ projectId }) : initializeApp();
      }

      // Hedef veritabanını bağla (databaseId veya default)
      try {
        this.db = getFirestore(this.app, databaseId);
        this.db.settings({ ignoreUndefinedProperties: true });
      } catch (dbErr) {
        console.warn(`[FirestoreService] Belirtilen DB '${databaseId}' açılamadı, varsayılan DB deneniyor...`, dbErr);
        this.db = getFirestore(this.app);
        this.db.settings({ ignoreUndefinedProperties: true });
      }

      this.isInitialized = true;
      this.initError = null;
      console.log(`🔥 [FirestoreService] Firebase Firestore başarıyla bağlandı. Proje: ${projectId}, DB: ${databaseId}`);
      return true;
    } catch (err: any) {
      this.initError = err?.message || String(err);
      console.warn(`⚠️ [FirestoreService] Firebase Firestore başlatılamadı (Sistem yerel önbellekle çalışacak):`, this.initError);
      return false;
    }
  }

  /**
   * Firestore'dan en güncel telemetri snapshot'ını okur (Anında Başlatma / Cold-Start).
   * Bulunamazsa veya hata oluşursa güvenli şekilde null döner.
   */
  public static async getLatestSnapshot(): Promise<TelemetrySnapshot | null> {
    if (!this.initialize() || !this.db) {
      return null;
    }

    try {
      const docRef = this.db.collection(this.SNAPSHOTS_COLLECTION).doc(this.LATEST_DOC_ID);
      const snap = await docRef.get();

      if (!snap.exists) {
        return null;
      }

      const data = snap.data() as TelemetrySnapshot;

      // Sürüm uyuşmazlığı: ham telemetri kullanılır, türev çıktılar düşürülür
      // (bkz. SNAPSHOT_SCHEMA_VERSION açıklaması).
      if (data.version !== this.SNAPSHOT_SCHEMA_VERSION) {
        console.warn(
          `[FirestoreService] Snapshot şema sürümü uyuşmuyor (kayıtlı: ${data.version ?? 'yok'}, ` +
          `beklenen: ${this.SNAPSHOT_SCHEMA_VERSION}); türev çıktılar yok sayılıp yeniden üretilecek.`,
        );
        return {
          ...data,
          dailyBrief: [],
          developerPersona: null,
        };
      }

      return data;
    } catch (err) {
      console.warn('[FirestoreService] Snapshot okunurken hata oluştu:', err);
      return null;
    }
  }

  /** Bir değerin UTF-8 JSON boyutu. Doküman boyutunu ölçmenin en yakın yolu. */
  private static snapshotBytes(value: unknown): number {
    return Buffer.byteLength(JSON.stringify(value ?? null), 'utf8');
  }

  /**
   * Ölçüte uyan **en büyük** `kept` değerini ikili aramayla bulur.
   *
   * Ölçüt monoton artandır (daha çok commit ya da daha çok dosya satır
   * istatistiği = daha büyük doküman): sığdığında yukarı, sığmadığında aşağı
   * gidilir. Hiçbir değer uymuyorsa `null` döner.
   */
  private static largestFittingKeep(
    minKeep: number,
    maxKeep: number,
    fits: (kept: number) => boolean,
  ): number | null {
    let low = minKeep;
    let high = maxKeep;
    let best: number | null = null;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (fits(mid)) {
        best = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return best;
  }

  /**
   * `[keepStats, keepCommits)` aralığında satır istatistikleri düşürülmüş commit
   * sayısı. Kırpmanın ölçüme maliyeti loglanabilsin diye sayılır: sessiz kırpma,
   * soğuk başlangıç metriklerinin neden canlıdan saptığını görünmez kılardı.
   */
  private static countTrimmedStats(
    commits: CommitMetric[],
    keepStats: number,
    keepCommits: number,
  ): number {
    return commits
      .slice(keepStats, keepCommits)
      .filter((commit) => Array.isArray(commit.files) && commit.files.length > 0).length;
  }

  /**
   * Snapshot'ı yazılabilir boyuta indirir (bkz. SNAPSHOT_MAX_BYTES).
   *
   * Üç kademeli ve **ölçüme dayalı** bir küçültme uygular — sabit "kayıt başına
   * şu kadar bayt" katsayısı kullanılmaz: dosya adları, commit mesajları ve yazar
   * adları değişkendir, bir katsayı sınırı garanti edemez. Bu yüzden her aday
   * hâl gerçekten serileştirilip ölçülür (bkz. largestFittingKeep).
   *
   *  1. En eski commitlerin **dosya satır istatistikleri** düşürülür, dosya
   *     adları (`affected_files`) korunur: hotspot churn'ü bu kayıtlar için eşit
   *     bölüştürme yedeğine iner, ama ölçüm ne dosya adlarını ne de commit
   *     kaydını kaybeder (en hafif kayıp).
   *  2. Bu da yetmezse en eski commit kayıtları tamamen çıkarılır; teslimat ve
   *     aktivite ölçümleri kalan pencereyi ölçer.
   *  3. Kalan pencerenin **en yeni** commitlerine satır istatistikleri geri
   *     verilir: bütçe kısıtlıyken kesin churn dağılımı kapsamdan değerlidir ve
   *     yeni commitler hotspot analizinin ağırlık merkezidir.
   *
   * Commit kayıtları yeni→eski sıralıdır (bkz. ensureSynced: tarihe göre azalan),
   * bu yüzden "en yeni N" her zaman dizinin başıdır.
   *
   * Sığdırılamazsa `null` döner ve çağıran yazmayı atlar: sınırı aşan bir
   * dokümanı yazmaya çalışmak yazmayı tamamen kaybettirirdi (soğuk başlangıç
   * önbelleği hiç dolmaz).
   */
  private static fitSnapshotToBudget(snapshot: TelemetrySnapshot): {
    snapshot: TelemetrySnapshot;
    trimmedFileStats: number;
    droppedCommits: number;
  } | null {
    const fits = (value: TelemetrySnapshot): boolean =>
      this.snapshotBytes(value) <= this.SNAPSHOT_MAX_BYTES;

    if (fits(snapshot)) {
      return { snapshot, trimmedFileStats: 0, droppedCommits: 0 };
    }

    const commits = Array.isArray(snapshot.commits) ? snapshot.commits : [];

    // Aday gövde: en yeni `keepStats` commit satır istatistiklerini korur, en
    // yeni `keepCommits` commit kaydı tutulur.
    const candidate = (keepStats: number, keepCommits: number): TelemetrySnapshot => ({
      ...snapshot,
      commits: commits.slice(0, keepCommits).map((commit, index) => {
        if (index < keepStats) return commit;
        const files = Array.isArray(commit.files) ? commit.files : [];
        if (files.length === 0) return commit;
        const trimmed: CommitMetric = { ...commit };
        delete trimmed.files;
        // Adlar tek kaynaktan okunur (bkz. commitFileNames): `filename`/`path`
        // kuralı burada yeniden yazılsaydı, kırpılmış bir kayıt soğuk
        // başlangıçta yüklendiğinde dosya adlarını kaybeder ve aynı commit'in
        // canlı ölçümü ile soğuk ölçümü ayrışırdı.
        const names = commitFileNames(commit);
        return names.length > 0 ? { ...trimmed, affected_files: names } : trimmed;
      }),
    });

    // 1. KADEME: tüm commit kayıtları kalır, yalnızca satır istatistikleri kırpılır.
    const keepNewest = this.largestFittingKeep(0, commits.length, (kept) =>
      fits(candidate(kept, commits.length)),
    );
    if (keepNewest !== null) {
      return {
        snapshot: candidate(keepNewest, commits.length),
        trimmedFileStats: this.countTrimmedStats(commits, keepNewest, commits.length),
        droppedCommits: 0,
      };
    }

    // 2. KADEME: satır istatistikleri tamamen düşmüş hâlde bile sığmıyor; en eski
    // commit kayıtları çıkarılır (en az bir commit kaydı tutulmalıdır).
    const keepCommits = this.largestFittingKeep(1, commits.length, (kept) =>
      fits(candidate(0, kept)),
    );
    if (keepCommits === null) {
      return null;
    }

    // 3. KADEME: kalan pencerenin en yenilerine satır istatistikleri geri verilir.
    // `keepCommits` ile sığdığı 2. kademede ölçüldüğü için bu arama boş dönemez;
    // yine de sessizce yanlış bir gövde yazmaktansa yazmamak yeğdir.
    const keepStats = this.largestFittingKeep(0, keepCommits, (kept) =>
      fits(candidate(kept, keepCommits)),
    );
    if (keepStats === null) {
      return null;
    }

    return {
      snapshot: candidate(keepStats, keepCommits),
      trimmedFileStats: this.countTrimmedStats(commits, keepStats, keepCommits),
      droppedCommits: commits.length - keepCommits,
    };
  }

  /**
   * Telemetri verilerini Firestore'daki tekil 'latest' dokümanına atomik olarak kaydeder.
   * Bu sayede veritabanı asla şişmez (Anti-Bloat Singleton Snapshot).
   */
  public static async saveLatestSnapshot(data: Omit<TelemetrySnapshot, 'savedAt' | 'version'>): Promise<boolean> {
    if (!this.initialize() || !this.db) {
      return false;
    }

    try {
      const docRef = this.db.collection(this.SNAPSHOTS_COLLECTION).doc(this.LATEST_DOC_ID);
      const snapshotToSave: TelemetrySnapshot = {
        ...data,
        savedAt: new Date().toISOString(),
        version: this.SNAPSHOT_SCHEMA_VERSION,
      };

      const fitted = this.fitSnapshotToBudget(snapshotToSave);
      if (!fitted) {
        console.error(
          '[FirestoreService] Snapshot, Firestore doküman sınırına sığdırılamadı; yazılmadı. ' +
          'Soğuk başlangıç hızlandırması bu eşitleme için devre dışı kalır (sonraki eşitleme yeniden dener).',
        );
        return false;
      }
      if (fitted.trimmedFileStats > 0 || fitted.droppedCommits > 0) {
        console.warn(
          `[FirestoreService] Snapshot boyut bütçesine sığdırıldı: ${fitted.trimmedFileStats} commit'in dosya ` +
          `satır istatistikleri düşürüldü (dosya adları korunur), ${fitted.droppedCommits} eski commit kaydı ` +
          'çıkarıldı. Bu kayıtlar için soğuk başlangıçtaki churn dağılımı/teslimat ölçümü yedeğe iner.',
        );
      }

      const cleanSnapshot = JSON.parse(JSON.stringify(fitted.snapshot));
      await docRef.set(cleanSnapshot, { merge: false });
      console.log(`💾 [FirestoreService] Telemetri snapshot'ı Firestore'a kaydedildi (Tarih: ${snapshotToSave.savedAt}).`);
      return true;
    } catch (err) {
      console.error('[FirestoreService] Snapshot kaydedilirken hata oluştu:', err);
      return false;
    }
  }

  /**
   * Bir depo için üretilen Gemini mimari inceleme raporunu çeker.
   * TTL'i dolmuş raporlar bayat kabul edilir ve null döner; böylece
   * güncelliğini yitirmiş mimari analizler sonsuza dek servis edilmez.
   */
  public static async getRepoReview(repoName: string): Promise<RepoAiReview | null> {
    if (!this.initialize() || !this.db) {
      return null;
    }

    try {
      const docRef = this.db.collection(this.REVIEWS_COLLECTION).doc(this.reviewDocId(repoName));
      const snap = await docRef.get();

      if (!snap.exists) {
        return null;
      }

      const review = snap.data() as RepoAiReview & { schemaVersion?: number };

      // Şema sürümü uyuşmayan (ya da sürüm damgası hiç olmayan) kayıtlar eski
      // sözleşmeyle yazılmıştır; ölçüm gibi servis edilmez (bkz.
      // REVIEW_SCHEMA_VERSION açıklaması).
      if (review.schemaVersion !== this.REVIEW_SCHEMA_VERSION) {
        console.warn(
          `[FirestoreService] '${repoName}' incelemesi eski şema sürümüyle yazılmış ` +
          `(kayıtlı: ${review.schemaVersion ?? 'yok'}, beklenen: ${this.REVIEW_SCHEMA_VERSION}); yok sayıldı.`,
        );
        return null;
      }

      // Doküman kimliği bir anahtardır, kanıt değildir: kaydın gerçekten bu
      // depoya ait olduğu içerikten doğrulanır. Böylece kimlik şeması
      // değişmeden önce yazılmış eski bir kayıt, başka bir depo adına
      // servis edilemez (ör. eski şemadaki "chart.js" kaydı ile "chart_js").
      if (
        typeof review.repoName !== 'string' ||
        review.repoName.trim().toLowerCase() !== repoName.trim().toLowerCase()
      ) {
        console.warn(
          `[FirestoreService] '${repoName}' için bulunan inceleme kaydı farklı bir depoya ait; yok sayıldı.`,
        );
        return null;
      }

      const reviewedAtMs = review.reviewedAt ? new Date(review.reviewedAt).getTime() : Number.NaN;
      if (!Number.isFinite(reviewedAtMs) || Date.now() - reviewedAtMs > this.REVIEW_TTL_MS) {
        return null;
      }

      return review;
    } catch (err) {
      console.warn(`[FirestoreService] '${repoName}' incelemesi okunurken hata oluştu:`, err);
      return null;
    }
  }

  /**
   * Bir depo için üretilen Gemini mimari inceleme raporunu Firestore'a kaydeder (Üzerine yazar).
   */
  public static async saveRepoReview(repoName: string, review: RepoAiReview): Promise<boolean> {
    if (!this.initialize() || !this.db) {
      return false;
    }

    try {
      const docRef = this.db.collection(this.REVIEWS_COLLECTION).doc(this.reviewDocId(repoName));
      const cleanReview = JSON.parse(JSON.stringify({ ...review, schemaVersion: this.REVIEW_SCHEMA_VERSION }));
      await docRef.set(cleanReview, { merge: true });
      return true;
    } catch (err) {
      console.error(`[FirestoreService] '${repoName}' incelemesi kaydedilirken hata oluştu:`, err);
      return false;
    }
  }
}
