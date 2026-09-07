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

/**
 * Sayıları yerel biçimde (örn: 1.250) biçimlendirir.
 */
export function formatNumber(num?: number | null): string {
  if (typeof num !== 'number' || !Number.isFinite(num)) return '0';
  return num.toLocaleString('tr-TR');
}
