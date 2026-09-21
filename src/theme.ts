/**
 * DevControl AI — 3 Renk Merkezi Palet (60 - 30 - 10 Kuralı)
 * İstenen 3 renk: #b9aba9, #f9b88e, #cdc1b5
 *
 * Canvas ve yüzey renkleri src/index.css içindeki CSS değişkenlerinde tanımlıdır;
 * burada yalnızca Recharts gibi JavaScript tarafında tema değeri gerektiren
 * anahtarlar tutulur.
 */

/**
 * Recharts ve veri görselleştirme teması (3 renkle sınırlı).
 *
 * Grafik renkleri burada tek yerde toplanır: ölçülen kontrast oranlarına göre
 * seçilmiş tonların bileşen içine dağılmış kopyaları, bir düzenlemede sessizce
 * ayrışır ve palet kuralının (bkz. src/index.css) denetimi imkânsızlaşır.
 */
export const CHART_THEME = {
  tooltipBg: '#cdc1b5',
  tooltipBorder: '#918280',
  textInk: '#231c1a',
  /** Eksen çizgisi — grafik öğesi, metin değil. */
  axisLine: '#a89997',
  /**
   * Eksen etiketleri 11px **metindir**. Palet kuralı metinde `--ink-muted`
   * (#6e5f5c) kullanımını yasaklar: yüzey üzerinde 3.44:1 ile WCAG AA'nın
   * (4.5:1) altında kalır. Bu yüzden etiketler `--ink-secondary` ile yazılır.
   */
  axisText: '#4a3e3b',
  seriesPrimaryStroke: '#231c1a',
  seriesPrimaryFill: '#f9b88e',
  seriesSecondaryStroke: '#4a3e3b',
  /** Seri dolgusu — grafik öğesi (3:1 eşiği); metin için kullanılamaz. */
  seriesSecondaryFill: '#6e5f5c',
} as const;
