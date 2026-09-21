/**
 * Sayıyı Türkçe yerel ayarıyla biçimlendirir (binlik ayracı: nokta).
 *
 * Yerel ayar AÇIKÇA verilir. Çıplak `toLocaleString()` çağrısı çalıştığı
 * ortamın varsayılanına düşer: sunucuda Node'un ICU varsayılanı (Cloud Run'da
 * en-US) "1,234" üretirken aynı değerin arayüzde "1.234" olması beklenir, tarayıcı
 * da kullanıcının işletim sistemi ayarına göre farklı ayraç gösterebilir. Tek
 * yardımcı, sunucu ve istemcinin aynı değeri aynı biçimde yazmasını sağlar.
 */
export function formatTrNumber(value: number): string {
  // Ölçülmemiş bir sayı (NaN / Infinity / eksik alan) ASLA "NaN" ya da
  // "Infinity" olarak basılamaz: ikisi de ölçülmüş bir değer gibi okunur ve
  // aynı sayıyı iki yüzeyde gösteren panolarda yalnızca biçimlendirme hatası
  // gibi görünür. Biçimlendirici tek kaynak olduğu için kural burada durur;
  // sayaçların ölçümsüz gösterimiyle aynı işareti kullanır
  // (bkz. formatMeasuredCount -> "--").
  if (!Number.isFinite(value)) return '--';
  return value.toLocaleString('tr-TR');
}

/**
 * Ölçülmemiş bir metrik değerini gösterilebilir hâle getirir.
 *
 * Ölçümsüz durum iki ayrı hâldir ve ikisi de ölçülmüş bir değer gibi
 * yazılamaz: istek başarısızsa "Ölçüm alınamadı", istek hâlâ sürüyorsa "Ölçüm
 * yükleniyor". Kural tek kaynakta durur; her görünüme kopyalanan bir sürüm
 * ayrışır ve yükleme dalını unutan görünüm, henüz alınmamış veriyi sıfır ya da
 * boş olarak göstererek "ölçüldü, sonuç bu" dedirtir.
 */
export function formatMeasuredText(
  value: string,
  error: string | null | undefined,
  loading?: boolean,
): string {
  if (error) return 'Ölçüm alınamadı';
  if (loading) return 'Ölçüm yükleniyor';
  return value;
}

/**
 * Ölçülmemiş bir sayacın gösterimi ("--"). Metin sürümüyle aynı kuralın sayaç
 * biçimidir (bkz. formatMeasuredText): sayaç "0" basıldığında "hiç yok" diye
 * okunur, oysa doğru okuma "ölçülmedi"dir.
 */
export function formatMeasuredCount(
  count: number,
  error: string | null | undefined,
  loading?: boolean,
): string {
  return error || loading ? '--' : String(count);
}

/**
 * Güven skorunu 0-100 aralığında biçimlendirir.
 * Hem 0.0-1.0 (örn: 0.85) hem de 0-100 (örn: 85) değerlerini hatasız karşılar.
 */
export function formatConfidence(confidence?: number | null): string {
  if (confidence === undefined || confidence === null || Number.isNaN(confidence)) {
    return '';
  }
  const normalized = confidence <= 1 ? confidence * 100 : confidence;
  const clamped = Math.min(100, Math.max(0, Math.round(normalized)));
  return `%${clamped}`;
}

/**
 * ISO tarih dizgisini veya Date nesnesini güvenli Türkçe tarih formatına dönüştürür.
 */
export function formatDate(dateInput?: string | Date | null): string {
  if (!dateInput) return '';
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * ISO tarih dizgisini veya Date nesnesini güvenli Türkçe saat formatına dönüştürür.
 */
export function formatTime(dateInput?: string | Date | null): string {
  if (!dateInput) return '';
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}
