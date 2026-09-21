import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { CHART_THEME } from '../theme.js';

interface ActivityChartItem {
  date: string;
  commits: number;
  bugFixes: number;
}

interface ActivityChartProps {
  chartData: ActivityChartItem[];
}

const ActivityChartComponent: React.FC<ActivityChartProps> = ({ chartData }) => {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={chartData}>
        <defs>
          <linearGradient id="commitGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={CHART_THEME.seriesPrimaryFill} stopOpacity={0.9} />
            <stop offset="95%" stopColor={CHART_THEME.seriesPrimaryFill} stopOpacity={0.0} />
          </linearGradient>
          {/* Hata düzeltmesi serisi kart zemininden (#cdc1b5) ayırt edilebilmeli:
              kanvas grisi (#b9aba9) dolgu olarak zemine karışıp seriyi görünmez
              kılıyordu; aynı paletin koyu grisi (#6e5f5c) kullanılır. */}
          <linearGradient id="bugGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={CHART_THEME.seriesSecondaryFill} stopOpacity={0.75} />
            <stop offset="95%" stopColor={CHART_THEME.seriesSecondaryFill} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="date"
          stroke={CHART_THEME.axisText}
          fontSize={11}
          tickLine={false}
          axisLine={{ stroke: CHART_THEME.axisLine }}
        />
        {/* `allowDecimals={false}`: eksen iki tam sayı metriği taşır (commit ve
            hata düzeltmesi). Sakin bir haftada en yüksek değer 2 olduğunda
            Recharts keneleri 0,5 / 1,5 gibi değerlerle etiketler ve "0,5
            commit" diye okunamayan bir ölçek çizerdi. */}
        <YAxis
          stroke={CHART_THEME.axisText}
          fontSize={11}
          tickLine={false}
          axisLine={{ stroke: CHART_THEME.axisLine }}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: CHART_THEME.tooltipBg,
            borderColor: CHART_THEME.tooltipBorder,
            borderRadius: '8px',
            color: CHART_THEME.textInk,
            fontSize: '12px',
            boxShadow: '0 4px 12px rgba(35, 28, 26, 0.15)',
          }}
        />
        <Area
          type="monotone"
          dataKey="commits"
          stroke={CHART_THEME.seriesPrimaryStroke}
          strokeWidth={2}
          fillOpacity={1}
          fill="url(#commitGrad)"
          name="Commit Sayısı"
        />
        <Area
          type="monotone"
          dataKey="bugFixes"
          stroke={CHART_THEME.seriesSecondaryStroke}
          strokeWidth={1.5}
          fillOpacity={1}
          fill="url(#bugGrad)"
          name="Hata Düzeltmeleri"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
};

/**
 * Grafik, `chartData` referansı değişmedikçe yeniden çizilmez: Recharts
 * çizimi pahalıdır ve ebeveyn karttaki ilgisiz bir durum güncellemesi
 * (ör. modal açma) tüm seriyi yeniden hesaplamamalıdır.
 *
 * Bileşen yalnızca varsayılan dışa aktarımla sunulur: tek tüketicisi
 * `React.lazy` dinamik içe aktarımıdır ve ikinci bir adlandırılmış kopya,
 * iki girişten birinin güncellenmeden kalması riskini taşır.
 */
export default React.memo(ActivityChartComponent);
