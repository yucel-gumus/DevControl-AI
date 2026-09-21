/**
 * Sınırlı boyutlu LRU önbellek.
 *
 * `get` ve `set` erişilen anahtarı Map'in sonuna taşır; kapasite dolduğunda en
 * eski (en uzun süredir kullanılmayan) anahtar düşürülür. Üst sınır, uzun
 * ömürlü sunucu süreçlerinde belleğin sınırsız büyümesini engeller.
 *
 * GitHub API yanıtları ve değişmez (immutable) Git SHA kodları için yapılan
 * analizler bu önbellekte tutulur. Önbellek çağrı başına değil modül düzeyinde
 * paylaşılır; bu yüzden aynı kaynak iki farklı yerde de önbelleklenirken tek bir
 * sınıf kullanılmalıdır (iki kopya, LRU davranışının zamanla ayrışmasına yol açar).
 */
export class BoundedCache<K, V> {
  private cache = new Map<K, V>();
  constructor(private readonly maxSize = 1000) {}

  get(key: K): V | undefined {
    const item = this.cache.get(key);
    if (item !== undefined) {
      this.cache.delete(key);
      this.cache.set(key, item);
    }
    return item;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) this.cache.delete(oldestKey);
    }
    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  /**
   * Tüm girdileri düşürür. Yalnızca **değişebilir** kaynakları önbellekleyen
   * çağrı yerleri bunu kullanıcı kaynaklı bir yenilemede çağırır: aksi hâlde
   * süreç yaşadığı sürece ilk çekilen değerler servis edilir ve "Yenile"
   * düğmesi görünürde hiçbir şey değiştirmez. Değişmez (immutable) kaynakların
   * önbelleği temizlenmemelidir — içerik o anahtar için asla değişmez.
   */
  clear(): void {
    this.cache.clear();
  }
}
