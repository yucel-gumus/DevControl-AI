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

export interface ActivityChartItem {
  date: string;
  commits: number;
  bugFixes: number;
}

interface ActivityChartProps {
  chartData: ActivityChartItem[];
}

export const ActivityChart: React.FC<ActivityChartProps> = ({ chartData }) => {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={chartData}>
        <defs>
          <linearGradient id="commitGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f9b88e" stopOpacity={0.9} />
            <stop offset="95%" stopColor="#f9b88e" stopOpacity={0.0} />
          </linearGradient>
          <linearGradient id="bugGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#b9aba9" stopOpacity={0.8} />
            <stop offset="95%" stopColor="#b9aba9" stopOpacity={0.0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="date"
          stroke="#6e5f5c"
          fontSize={11}
          tickLine={false}
          axisLine={{ stroke: '#a89997' }}
        />
        <YAxis
          stroke="#6e5f5c"
          fontSize={11}
          tickLine={false}
          axisLine={{ stroke: '#a89997' }}
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
          stroke="#231c1a"
          strokeWidth={2}
          fillOpacity={1}
          fill="url(#commitGrad)"
          name="Commit Sayısı"
        />
        <Area
          type="monotone"
          dataKey="bugFixes"
          stroke="#6e5f5c"
          strokeWidth={1.5}
          fillOpacity={1}
          fill="url(#bugGrad)"
          name="Hata Düzeltmeleri"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
};

export default ActivityChart;
