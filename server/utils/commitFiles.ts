import { CommitMetric } from '../../src/types.js';

/** Tek bir commit'in dosya bazlı satır istatistiği. */
export interface CommitFileEntry {
  path: string;
  additions: number;
  deletions: number;
}

/**
 * Bir commit kaydının dosya alanından dosya adını okur.
 *
 * `filename` tercih edilir, `path` yedeği korunur: `CommitMetric.files` iki
 * alanı da tanımlar (bkz. src/types.ts) — GitHub REST `filename` yazar, ama
 * kaydı okuyan her yolun aynı alanı seçmesi gerekir. Yalnızca `filename`
 * okuyan bir sürüm, `path` taşıyan bir kayıtta dosya adını kaybederdi: soğuk
 * başlangıçta ad listesi boşalır ve churn eşit bölüştürme yedeğine inerdi
 * (bkz. fitSnapshotToBudget, persistSnapshot). Kural TEK yerde tanımlıdır ki
 * bir okuyucu diğerinden sapmasın. `null`/boş ad `null` döner: çağıranlar
 * adsız kaydı ya eler ya da yedeğe düşer.
 */
export function commitFileName(file: { filename?: string; path?: string } | null | undefined): string | null {
  const name = file?.filename || file?.path;
  return typeof name === 'string' && name.length > 0 ? name : null;
}

/**
 * Bir commit'in dokunduğu dosya ADLARI (satır istatistiği olmadan).
 *
 * Snapshot yazma/kırpma ve yükleme yolları yalnızca adlarla ilgilenir; bunu
 * `commitFileEntries` üzerinden türetmek, kullanılmayan eşit bölüştürme
 * hesabını da yapardı.
 */
export function commitFileNames(commit: CommitMetric): string[] {
  if (!Array.isArray(commit.files)) return [];
  return commit.files
    .map((file) => commitFileName(file))
    .filter((name): name is string => name !== null);
}

/**
 * Bir commit'in dokunduğu dosyaları satır istatistikleriyle çıkarır.
 *
 * GitHub `files` dizisi (dosya başına gerçek ekleme/silme) varsa o kullanılır;
 * yoksa `affected_files` adları için satır istatistikleri commit'in TOPLAM
 * hacminden TAHMİN edilir: toplam, commit'in dokunduğu gerçek dosya sayısına
 * (`files_changed`) bölünür.
 *
 * Payda `affected_files.length` DEĞİL `files_changed`'dir: ad listesi
 * kırpılmıştır (bkz. MAX_COMMIT_FILES) ve pay tam commit hacmini taşır — listeye
 * bölmek, kalan her dosyanın churn'ünü olduğundan fazla gösterirdi (50 dosyalı
 * bir commit'te kalan 20 dosyanın her biri 2,5 katına çıkardı). Gerçek sayıya
 * bölmek, satırların dosyalara eşit dağıldığı varsayımı altında dosya başına
 * yansız bir tahmin verir: beklenen değer, o dosyanın canlı ölçümdeki payıdır.
 *
 * Sonuç yine de bir TAHMİNDİR ve canlı ölçümle (gerçek `files`) bire bir
 * tutmaz; ama satır dağılımı bilinmezken toplam churn'ü sıfır saymak
 * dalgalanmayı olduğundan AZ gösterirdi. Toplam korunmaz: amaç dosya başına
 * değeri yansız tahmin etmektir, commit toplamını listedeki adlara yığmak değil.
 */
export function commitFileEntries(commit: CommitMetric): CommitFileEntry[] {
  const affectedFiles = Array.isArray(commit.affected_files)
    ? commit.affected_files.filter((file): file is string => typeof file === 'string' && file.length > 0)
    : [];
  const detailedFiles = Array.isArray(commit.files)
    ? commit.files
        .map((file) => ({
          path: commitFileName(file),
          // `file` null olabilir (Firestore dizi öğesi): `commitFileName` bunu
          // tolere ederken satır alanlarına doğrudan erişmek çökerdi.
          additions: Number.isFinite(file?.additions) ? Math.max(0, file?.additions || 0) : 0,
          deletions: Number.isFinite(file?.deletions) ? Math.max(0, file?.deletions || 0) : 0,
        }))
        .filter((file): file is CommitFileEntry => file.path !== null)
    : [];

  if (detailedFiles.length > 0) return detailedFiles;

  // Payda: gerçek dosya sayısı, ad listesinden KÜÇÜK olamaz (adlar o listenin
  // ilk dilimidir). Alan eksik/bozuksa (eski kayıt) ad sayısına düşülür.
  const knownNames = affectedFiles.length;
  const trueFileCount =
    Number.isFinite(commit.files_changed) && commit.files_changed > 0
      ? Math.max(Math.floor(commit.files_changed), knownNames)
      : knownNames;
  const fileCount = Math.max(1, trueFileCount);
  const perFileAdditions = Math.round((commit.additions || 0) / fileCount);
  const perFileDeletions = Math.round((commit.deletions || 0) / fileCount);
  return affectedFiles.map((path) => ({
    path,
    additions: perFileAdditions,
    deletions: perFileDeletions,
  }));
}
