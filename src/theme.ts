/**
 * DevControl AI — İpek Küllü Arduvaz Paleti (60 - 30 - 10 Kuralı)
 * Yalnızca 10 kanonik hex; grafik ve veri görselleştirme sabitleri.
 *
 * Tuval ve yüzey değişkenleri src/index.css içindedir; burada Recharts ve
 * grafik serilerinin tek renk kaynağı tutulur.
 */

export const CHART_THEME = {
  tooltipBg: '#F5F9F5',
  tooltipBorder: '#BCC7D2',
  tooltipShadow: '0 4px 12px rgba(37, 51, 65, 0.15)',
  textInk: '#253341',
  /** Eksen çizgisi — grafik öğesi, metin değil. */
  axisLine: '#BCC7D2',
  /** Eksen etiketleri (11px metin) — WCAG AA/AAA için #3E5164 kullanılır. */
  axisText: '#3E5164',
  seriesPrimaryStroke: '#AB421C',
  seriesPrimaryFill: '#EC7D55',
  seriesSecondaryStroke: '#253341',
  seriesSecondaryFill: '#3E5164',
} as const;

/**
 * Dil çubukları, çoklu seriler ve şiddet ölçeği için uyumlu palet dizisi.
 */
export const SERIES_PALETTE = [
  '#EC7D55',
  '#AB421C',
  '#253341',
  '#3E5164',
  '#F2A488',
  '#BCC7D2',
] as const;

/**
 * Risk ve öncelik rozetleri için tek renk eşlemesi.
 * Tüm bileşenler seviye renklerini buradan alır; tutarlı kontrast garantisi.
 */
export function getSeverityBadgeClass(level?: string): string {
  switch ((level || '').toUpperCase()) {
    case 'CRITICAL':
      return 'bg-[#AB421C] text-[#F5F9F5] border-[#AB421C]';
    case 'HIGH':
      return 'bg-[#EC7D55] text-[#253341] border-[#AB421C]';
    case 'MEDIUM':
      return 'bg-[#F2A488] text-[#253341] border-[#EC7D55]';
    case 'OPPORTUNITY':
      return 'bg-[#253341] text-[#F5F9F5] border-[#253341]';
    case 'LOW':
    default:
      return 'bg-[#DBE6DD] text-[#3E5164] border-[#BCC7D2]';
  }
}
