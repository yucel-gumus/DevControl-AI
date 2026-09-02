/**
 * DevControl AI — 3 Renk Merkezi Palet (60 - 30 - 10 Kuralı)
 * Tam olarak istenen 3 renk: #f6f3f4, #f9efec, #fff4f0
 */

export const THEME_PALETTE = {
  COLOR_60: '#f6f3f4', // 60% Dominant Canvas
  COLOR_30: '#f9efec', // 30% Secondary Surface (Cards, Panels)
  COLOR_10: '#fff4f0', // 10% Accent (Buttons, Highlights, Tabs)
} as const;

export const THEME_ROLES = {
  dominant: THEME_PALETTE.COLOR_60,
  secondary: THEME_PALETTE.COLOR_30,
  accent: THEME_PALETTE.COLOR_10,
} as const;

/**
 * Recharts ve veri görselleştirme teması (3 renkle sınırlı)
 */
export const CHART_THEME = {
  primary: '#241c1d',
  secondary: '#5c5254',
  accent: '#fff4f0',
  palette: ['#241c1d', '#5c5254', '#8c8082'],
  gridStroke: '#e8ded9',
  tooltipBg: '#fff4f0',
  tooltipBorder: '#e8ded9',
  textInk: '#241c1d',
};
