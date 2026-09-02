/**
 * DevControl AI — 60-30-10 Centralized Design Tokens
 * 
 * SADECE 3 RENK (Strict Palette - No 4th Color):
 * 1. COLOR_1 (#B5DEF6): %30 Secondary (Paneller, Kartlar, Kenarlıklar, Yapısal Alanlar)
 * 2. COLOR_2 (#EEF5DB): %60 Dominant (Ana Sayfa Zemini, Geniş Yüzeyler, Tuval)
 * 3. COLOR_3 (#E2D0FB): %10 Accent (Hero Butonlar, Aktif Vurgular, İkon Odakları, Rozetler)
 * 
 * İleride renk kodları değiştirilmek istendiğinde yalnızca aşağıdaki 3 sabiti güncellemeniz yeterlidir.
 */

export const THEME_PALETTE = {
  COLOR_1: '#B5DEF6', // %30 Secondary
  COLOR_2: '#EEF5DB', // %60 Dominant
  COLOR_3: '#E2D0FB', // %10 Accent
} as const;

export const THEME_ROLES = {
  dominant: THEME_PALETTE.COLOR_2,   // 60%
  secondary: THEME_PALETTE.COLOR_1,  // 30%
  accent: THEME_PALETTE.COLOR_3,     // 10%
} as const;

/**
 * Recharts ve veri görselleştirmede KESİNLİKLE sadece bu 3 renk kullanılır.
 */
export const CHART_THEME = {
  primary: THEME_PALETTE.COLOR_1,
  secondary: THEME_PALETTE.COLOR_2,
  accent: THEME_PALETTE.COLOR_3,
  palette: [THEME_PALETTE.COLOR_1, THEME_PALETTE.COLOR_3, THEME_PALETTE.COLOR_2],
  gridStroke: 'rgba(181, 222, 246, 0.4)',
  tooltipBg: '#EEF5DB',
  tooltipBorder: '#B5DEF6',
  textInk: '#14222B',
};
