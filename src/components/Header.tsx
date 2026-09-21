import React from 'react';
import { RefreshCw, Terminal, Activity, Gauge, Database } from 'lucide-react';
import { EngineeringHealthScore, RateLimitStatus } from '../types.js';
import { formatDate, formatTime, formatTrNumber } from '../utils/formatters.js';

interface Props {
  title: string;
  subtitle?: string;
  healthScore: EngineeringHealthScore | null;
  lastSyncAt: string;
  onSync: () => void;
  isSyncing: boolean;
  onOpenAskAi: () => void;
  isAskAiActive?: boolean;
  rateLimitStatus?: RateLimitStatus;
  isCachedFromDb?: boolean;
}

export const Header: React.FC<Props> = ({
  title,
  subtitle,
  healthScore,
  lastSyncAt,
  onSync,
  isSyncing,
  onOpenAskAi,
  isAskAiActive = false,
  rateLimitStatus,
  isCachedFromDb = false,
}) => {
  const isPartial = healthScore?.dataStatus === 'partial';

  /**
   * Son eşitleme etiketi tek kaynaktan üretilir (bkz. formatters).
   *
   * Çıplak `new Date(...).toLocaleString()` iki sorun taşır: yerel ayarı
   * ortama bırakır ve ayrıştırılamayan bir damgada "Invalid Date" basar.
   * Biçimlendiriciler geçersiz girdide boş dizgi döndürdüğü için damga
   * gerçekten yoksa etiket hiç gösterilmez.
   */
  const lastSyncLabel = lastSyncAt ? `${formatDate(lastSyncAt)} ${formatTime(lastSyncAt)}`.trim() : '';

  return (
    <header
      id="app-header"
      className="h-14 border-b border-[#a89997] flex items-center justify-between px-6 sticky top-0 z-30 font-sans bg-[#cdc1b5]/95 backdrop-blur-md text-[#231c1a]"
    >
      {/* Başlık ve Gezinme Yolu */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-[#4a3e3b] font-medium">DevControl</span>
        <span className="text-[#4a3e3b]">/</span>
        <span className="text-[#231c1a] font-bold text-sm">{title}</span>
        {subtitle && (
          <span className="hidden lg:inline text-xs text-[#4a3e3b] pl-2 ml-1 border-l border-[#a89997]">
            {subtitle}
          </span>
        )}
      </div>

      {/* Genel Eylemler & Sağlık Rozeti */}
      <div className="flex items-center gap-2.5">
        {/* Sağlık Skoru Kapsülü */}
        {healthScore?.hasData ? (
          <div
            className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border border-[#a89997] bg-[#b9aba9]/40 text-[#231c1a] shadow-xs"
            title={
              lastSyncLabel
                ? `Son eşitleme: ${lastSyncLabel}`
                : 'Henüz başarılı bir eşitleme yapılmadı.'
            }
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#231c1a]" />
            <span className="text-[#4a3e3b] text-[11px]">Sağlık{isPartial ? ' (kısmi)' : ''}:</span>
            <span className="font-bold text-[#231c1a]">{healthScore.overallScore}/100</span>
            <span className="px-1.5 py-0.2 rounded bg-[#f9b88e] text-[#231c1a] text-[10px] font-bold border border-[#231c1a]/15">
              {isPartial ? 'Kısmi' : `Seviye ${healthScore.grade}`}
            </span>
          </div>
        ) : healthScore ? (
          <div
            className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full text-xs border border-[#a89997] bg-[#b9aba9]/40 text-[#4a3e3b]"
            title={lastSyncLabel ? `Son eşitleme: ${lastSyncLabel}` : undefined}
          >
            <Activity className="w-3.5 h-3.5 text-[#4a3e3b]" />
            <span className="text-[11px]">GitHub verisi bekleniyor</span>
          </div>
        ) : null}

        {/* GitHub API Rate Limit Göstergesi */}
        {rateLimitStatus && (
          <div
            className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border border-[#a89997] bg-[#b9aba9]/40 text-[#4a3e3b]"
            title={`GitHub API Kalan İstek: ${rateLimitStatus.remaining} / ${rateLimitStatus.limit}`}
          >
            <Gauge className="w-3 h-3 text-[#4a3e3b]" />
            <span>API: {formatTrNumber(rateLimitStatus.remaining)}</span>
          </div>
        )}

        {/* Firestore Önbellek Göstergesi */}
        {isCachedFromDb && (
          <div
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border border-[#a89997] bg-[#f9b88e]/60 text-[#231c1a]"
            title="Veriler Firebase Firestore'daki kayıtlı snapshot'tan anında yüklendi. GitHub'dan canlı veri çekmek için Yenile butonuna basın."
          >
            <Database className="w-3 h-3 text-[#231c1a]" />
            <span>DB Snapshot</span>
          </div>
        )}

        {/* Yapay Zekaya Sor Hızlı Butonu */}
        <button
          id="header-btn-ask-ai"
          onClick={onOpenAskAi}
          aria-label="KENSAI Analistini aç veya kapat"
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs ${
            isAskAiActive
              ? 'bg-[#231c1a] text-[#f9b88e] border border-[#231c1a] ring-2 ring-[#f9b88e]/40'
              : 'border border-[#231c1a]/15 bg-[#f9b88e] text-[#231c1a] hover:brightness-105'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" aria-hidden="true" />
          <span>KENSAI</span>
        </button>

        {/* Verileri Yenile Butonu */}
        <button
          id="header-btn-sync"
          onClick={onSync}
          disabled={isSyncing}
          aria-label={isSyncing ? 'GitHub verileri eşitleniyor' : 'GitHub verilerini yenile'}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-[#f9b88e] text-[#231c1a] hover:brightness-105 transition-all cursor-pointer shadow-xs disabled:opacity-50 border border-[#231c1a]/15"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} aria-hidden="true" />
          <span>{isSyncing ? 'Yenileniyor...' : 'Yenile'}</span>
        </button>
      </div>
    </header>
  );
};
