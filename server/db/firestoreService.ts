import { initializeApp, getApps, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import {
  EngineeringHealthScore,
  FileHotspot,
  EngineeringRisk,
  TodayBriefItem,
  DeveloperPersona,
  Repository,
  PunchCardItem,
  LanguageBreakdownItem,
  RepoAiReview,
  CommitMetric,
  PullRequestMetric,
  IssueMetric,
} from '../../src/types.js';

export interface TelemetrySnapshot {
  savedAt: string;
  lastSyncAt: string;
  user: any;
  repositories: Repository[];
  commits: CommitMetric[];
  pullRequests: PullRequestMetric[];
  issues: IssueMetric[];
  healthScore: EngineeringHealthScore | null;
  hotspots: FileHotspot[];
  risks: EngineeringRisk[];
  dailyBrief: TodayBriefItem[];
  developerPersona: DeveloperPersona | null;
  punchCard: PunchCardItem[];
  languagesBreakdown: LanguageBreakdownItem[];
  commitsCount: number;
  pullRequestsCount: number;
  version: string;
}

export class FirestoreService {
  private static app: App | null = null;
  private static db: Firestore | null = null;
  private static isInitialized = false;
  private static initError: string | null = null;

  // Koleksiyon İsimleri (Anti-Bloat Standartları)
  private static readonly SNAPSHOTS_COLLECTION = 'devcontrol_snapshots';
  private static readonly REVIEWS_COLLECTION = 'devcontrol_repo_reviews';
  private static readonly TRENDS_COLLECTION = 'devcontrol_daily_trends';
  private static readonly LATEST_DOC_ID = 'latest';

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

      const existingApps = getApps();
      if (existingApps.length > 0) {
        this.app = existingApps[0];
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

  public static isConnected(): boolean {
    return this.isInitialized && this.db !== null;
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
      return data;
    } catch (err) {
      console.warn('[FirestoreService] Snapshot okunurken hata oluştu:', err);
      return null;
    }
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
        version: '1.0.0',
      };

      const cleanSnapshot = JSON.parse(JSON.stringify(snapshotToSave));
      await docRef.set(cleanSnapshot, { merge: false });
      console.log(`💾 [FirestoreService] Telemetri snapshot'ı Firestore'a kaydedildi (Tarih: ${snapshotToSave.savedAt}).`);

      // Günlük hafif trend kaydı (opsiyonel zaman serisi)
      if (data.healthScore?.overallScore) {
        const todayStr = new Date().toISOString().slice(0, 10);
        await this.recordDailyTrend(todayStr, {
          overallScore: data.healthScore.overallScore,
          commitsCount: data.commitsCount || 0,
          hotspotsCount: (data.hotspots || []).length,
        });
      }

      return true;
    } catch (err) {
      console.error('[FirestoreService] Snapshot kaydedilirken hata oluştu:', err);
      return false;
    }
  }

  /**
   * Bir depo için üretilen Gemini mimari inceleme raporunu çeker.
   */
  public static async getRepoReview(repoName: string): Promise<RepoAiReview | null> {
    if (!this.initialize() || !this.db) {
      return null;
    }

    try {
      const cleanRepoId = repoName.replace(/[^a-zA-Z0-9_-]/g, '_');
      const docRef = this.db.collection(this.REVIEWS_COLLECTION).doc(cleanRepoId);
      const snap = await docRef.get();

      if (!snap.exists) {
        return null;
      }

      return snap.data() as RepoAiReview;
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
      const cleanRepoId = repoName.replace(/[^a-zA-Z0-9_-]/g, '_');
      const docRef = this.db.collection(this.REVIEWS_COLLECTION).doc(cleanRepoId);
      const cleanReview = JSON.parse(
        JSON.stringify({
          ...review,
          updatedAt: new Date().toISOString(),
        })
      );
      await docRef.set(cleanReview, { merge: true });
      return true;
    } catch (err) {
      console.error(`[FirestoreService] '${repoName}' incelemesi kaydedilirken hata oluştu:`, err);
      return false;
    }
  }

  /**
   * Günde en fazla 1 adet hafif trend kaydı tutar (30 günlük gelişim grafiği için).
   */
  public static async recordDailyTrend(
    date: string,
    trend: { overallScore: number; commitsCount: number; hotspotsCount: number }
  ): Promise<boolean> {
    if (!this.initialize() || !this.db) {
      return false;
    }

    try {
      const docRef = this.db.collection(this.TRENDS_COLLECTION).doc(date);
      const cleanTrend = JSON.parse(
        JSON.stringify({
          date,
          overallScore: trend.overallScore,
          commitsCount: trend.commitsCount,
          hotspotsCount: trend.hotspotsCount,
          recordedAt: new Date().toISOString(),
        })
      );
      await docRef.set(cleanTrend, { merge: true });
      return true;
    } catch (err) {
      console.warn(`[FirestoreService] Günlük trend kaydedilemedi:`, err);
      return false;
    }
  }
}
