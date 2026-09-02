/**
 * DevControl AI — 3 Renk Merkezi Palet (60 - 30 - 10 Kuralı)
 * İstenen 3 renk: #b9aba9, #f9b88e, #cdc1b5
 */

export const THEME_PALETTE = {
  COLOR_60: '#b9aba9', // 60% Dominant Canvas (Muted Taupe)
  COLOR_30: '#cdc1b5', // 30% Secondary Surface (Warm Sand / Cards)
  COLOR_10: '#f9b88e', // 10% Accent (Warm Apricot / Buttons / Badges)
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
  primary: '#231c1a',
  secondary: '#f9b88e',
  accent: '#f9b88e',
  palette: ['#231c1a', '#f9b88e', '#6e5f5c'],
  gridStroke: '#a89997',
  tooltipBg: '#cdc1b5',
  tooltipBorder: '#918280',
  textInk: '#231c1a',
};
