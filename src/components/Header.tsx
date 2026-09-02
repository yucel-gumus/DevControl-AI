import React from 'react';
import { RefreshCw, Terminal, Activity, Gauge } from 'lucide-react';
import { EngineeringHealthScore, RateLimitStatus } from '../types.js';

interface Props {
  title: string;
  subtitle?: string;
  healthScore: EngineeringHealthScore | null;
  lastSyncAt: string;
  onSync: () => void;
  isSyncing: boolean;
  onOpenAskAi: () => void;
  rateLimitStatus?: RateLimitStatus;
}

export const Header: React.FC<Props> = ({
  title,
  subtitle,
  healthScore,
  lastSyncAt,
  onSync,
  isSyncing,
  onOpenAskAi,
  rateLimitStatus,
}) => {
  const isPartial = healthScore?.dataStatus === 'partial';

  return (
    <header
      id="app-header"
      className="h-14 border-b border-[#e8ded9] flex items-center justify-between px-6 sticky top-0 z-30 font-sans bg-[#f9efec]/95 backdrop-blur-md text-[#241c1d]"
    >
      {/* Başlık ve Gezinme Yolu */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-[#5c5254] font-medium">DevControl</span>
        <span className="text-[#8c8082]">/</span>
        <span className="text-[#241c1d] font-bold text-sm">{title}</span>
        {subtitle && (
          <span className="hidden lg:inline text-xs text-[#5c5254] pl-2 ml-1 border-l border-[#e8ded9]">
            {subtitle}
          </span>
        )}
      </div>

      {/* Genel Eylemler & Sağlık Rozeti */}
      <div className="flex items-center gap-2.5">
        {/* Sağlık Skoru Kapsülü */}
        {healthScore?.hasData ? (
          <div
            className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border border-[#e8ded9] bg-[#fff4f0] text-[#241c1d] shadow-xs"
            title={
              lastSyncAt
                ? `Son eşitleme: ${new Date(lastSyncAt).toLocaleString('tr-TR')}`
                : 'Henüz başarılı bir eşitleme yapılmadı.'
            }
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#241c1d]" />
            <span className="text-[#5c5254] text-[11px]">Sağlık{isPartial ? ' (kısmi)' : ''}:</span>
            <span className="font-bold text-[#241c1d]">{healthScore.overallScore}/100</span>
            <span className="px-1.5 py-0.2 rounded bg-[#f6f3f4] text-[#241c1d] text-[10px] font-bold border border-[#e8ded9]">
              {isPartial ? 'Kısmi' : `Seviye ${healthScore.grade}`}
            </span>
          </div>
        ) : healthScore ? (
          <div
            className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full text-xs border border-[#e8ded9] bg-[#fff4f0] text-[#5c5254]"
            title={lastSyncAt ? `Son eşitleme: ${new Date(lastSyncAt).toLocaleString('tr-TR')}` : undefined}
          >
            <Activity className="w-3.5 h-3.5 text-[#5c5254]" />
            <span className="text-[11px]">GitHub verisi bekleniyor</span>
          </div>
        ) : null}

        {/* GitHub API Rate Limit Göstergesi */}
        {rateLimitStatus && (
          <div
            className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border border-[#e8ded9] bg-[#fff4f0] text-[#5c5254]"
            title={`GitHub API Kalan İstek: ${rateLimitStatus.remaining} / ${rateLimitStatus.limit}`}
          >
            <Gauge className="w-3 h-3 text-[#5c5254]" />
            <span>API: {rateLimitStatus.remaining.toLocaleString()}</span>
          </div>
        )}

        {/* Yapay Zekaya Sor Hızlı Butonu */}
        <button
          id="header-btn-ask-ai"
          onClick={onOpenAskAi}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-[#e8ded9] bg-[#fff4f0] text-[#241c1d] hover:bg-white transition-all cursor-pointer shadow-xs"
        >
          <Terminal className="w-3.5 h-3.5 text-[#241c1d]" />
          <span>Yapay Zeka</span>
        </button>

        {/* Verileri Yenile Butonu */}
        <button
          id="header-btn-sync"
          onClick={onSync}
          disabled={isSyncing}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-[#fff4f0] text-[#241c1d] hover:bg-white transition-all cursor-pointer shadow-xs disabled:opacity-50 border border-[#e8ded9]"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
          <span>{isSyncing ? 'Yenileniyor...' : 'Yenile'}</span>
        </button>
      </div>
    </header>
  );
};
