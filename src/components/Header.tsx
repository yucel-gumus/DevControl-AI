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
      className="h-16 border-b flex items-center justify-between px-8 sticky top-0 z-30 font-sans backdrop-blur-md"
      style={{
        backgroundColor: 'rgba(var(--c2-rgb), 0.85)',
        borderColor: 'var(--c1)',
        color: 'var(--ink-primary)',
      }}
    >
      {/* Başlık ve Gezinme Yolu */}
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span style={{ color: 'var(--ink-muted)' }}>DevControl AI</span>
        <span style={{ color: 'var(--ink-muted)' }}>/</span>
        <span style={{ color: 'var(--ink-primary)' }} className="font-extrabold">{title}</span>
        {subtitle && (
          <span
            className="hidden lg:inline text-xs ml-2 pl-2 border-l"
            style={{ color: 'var(--ink-muted)', borderColor: 'var(--c1)' }}
          >
            {subtitle}
          </span>
        )}
      </div>

      {/* Genel Eylemler & Sağlık Rozeti */}
      <div className="flex items-center gap-3">
        {/* Sağlık Skoru Kapsülü */}
        {healthScore?.hasData ? (
          <div
            className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold border shadow-xs"
            style={{
              backgroundColor: 'rgba(var(--c1-rgb), 0.35)',
              borderColor: 'var(--c1)',
              color: 'var(--ink-primary)',
            }}
            title={lastSyncAt ? `Son eşitleme: ${new Date(lastSyncAt).toLocaleString('tr-TR')}` : 'Henüz başarılı bir eşitleme yapılmadı.'}
          >
            <Activity className="w-3.5 h-3.5" style={{ color: 'var(--ink-primary)' }} />
            <span style={{ color: 'var(--ink-muted)' }}>Mühendislik Sağlığı{isPartial ? ' (kısmi)' : ''}:</span>
            <span className="font-black">{healthScore.overallScore}/100</span>
            <span
              className="px-2 py-0.5 rounded-full text-[10px] font-black border"
              style={{
                backgroundColor: 'var(--c3)',
                borderColor: 'rgba(var(--c3-rgb), 0.8)',
                color: 'var(--ink-primary)',
              }}
            >
              {isPartial ? 'Kısmi veri' : `Seviye ${healthScore.grade}`}
            </span>
          </div>
        ) : healthScore ? (
          <div
            className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold border shadow-xs"
            style={{
              backgroundColor: 'rgba(var(--c1-rgb), 0.35)',
              borderColor: 'var(--c1)',
              color: 'var(--ink-muted)',
            }}
            title={lastSyncAt ? `Son eşitleme: ${new Date(lastSyncAt).toLocaleString('tr-TR')}` : undefined}
          >
            <Activity className="w-3.5 h-3.5" style={{ color: 'var(--ink-muted)' }} />
            <span>GitHub verisi bekleniyor</span>
          </div>
        ) : null}

        {/* GitHub API Rate Limit Göstergesi */}
        {rateLimitStatus && (
          <div
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border shadow-xs"
            style={{
              backgroundColor: 'rgba(var(--c2-rgb), 0.9)',
              borderColor: 'var(--c1)',
              color: 'var(--ink-secondary)',
            }}
            title={`GitHub API Kalan İstek: ${rateLimitStatus.remaining} / ${rateLimitStatus.limit}`}
          >
            <Gauge className="w-3.5 h-3.5" style={{ color: 'var(--ink-primary)' }} />
            <span className="font-bold text-[11px]">API: {rateLimitStatus.remaining.toLocaleString()} / {rateLimitStatus.limit.toLocaleString()}</span>
          </div>
        )}

        {/* Yapay Zekaya Sor Hızlı Butonu */}
        <button
          id="header-btn-ask-ai"
          onClick={onOpenAskAi}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all hover:scale-102 cursor-pointer shadow-xs"
          style={{
            backgroundColor: 'var(--c1)',
            borderColor: 'rgba(var(--c1-rgb), 0.8)',
            color: 'var(--ink-primary)',
          }}
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>Yapay Zeka Analisti</span>
        </button>

        {/* Verileri Yenile Butonu (%10 Vurgu) */}
        <button
          id="header-btn-sync"
          onClick={onSync}
          disabled={isSyncing}
          className="flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs font-bold transition-all hover:scale-102 cursor-pointer shadow-sm disabled:opacity-50 border"
          style={{
            backgroundColor: 'var(--c3)',
            borderColor: 'rgba(var(--c3-rgb), 0.9)',
            color: 'var(--ink-primary)',
          }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
          <span>{isSyncing ? 'Yenileniyor...' : 'Verileri Yenile'}</span>
        </button>
      </div>
    </header>
  );
};
