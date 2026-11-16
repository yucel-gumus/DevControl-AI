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
      className="h-14 border-b border-[#BCC7D2] flex items-center justify-between px-6 sticky top-0 z-30 font-sans bg-[#DCE3EA]/95 backdrop-blur-md text-[#253341]"
    >
      {/* Başlık ve Gezinme Yolu */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-[#3E5164] font-medium">DevControl</span>
        <span className="text-[#3E5164]">/</span>
        <span className="text-[#253341] font-bold text-sm">{title}</span>
        {subtitle && (
          <span className="hidden lg:inline text-xs text-[#3E5164] pl-2 ml-1 border-l border-[#BCC7D2]">
            {subtitle}
          </span>
        )}
      </div>

      {/* Genel Eylemler & Sağlık Rozeti */}
      <div className="flex items-center gap-2.5">
        {/* Sağlık Skoru Kapsülü */}
        {healthScore?.hasData ? (
          <div
            className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border border-[#BCC7D2] bg-[#EDF3EE] text-[#253341] shadow-xs"
            title={
              lastSyncLabel
                ? `Son eşitleme: ${lastSyncLabel}`
                : 'Henüz başarılı bir eşitleme yapılmadı.'
            }
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#EC7D55]" />
            <span className="text-[#3E5164] text-[11px]">Sağlık{isPartial ? ' (kısmi)' : ''}:</span>
            <span className="font-bold text-[#253341]">{healthScore.overallScore}/100</span>
            <span className="px-1.5 py-0.2 rounded bg-[#F2A488] text-[#253341] text-[10px] font-bold border border-[#EC7D55]">
              {isPartial ? 'Kısmi' : `Seviye ${healthScore.grade}`}
            </span>
          </div>
        ) : healthScore ? (
          <div
            className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full text-xs border border-[#BCC7D2] bg-[#DBE6DD] text-[#3E5164]"
            title={lastSyncLabel ? `Son eşitleme: ${lastSyncLabel}` : undefined}
          >
            <Activity className="w-3.5 h-3.5 text-[#3E5164]" />
            <span className="text-[11px]">GitHub verisi bekleniyor</span>
          </div>
        ) : null}

        {/* GitHub API Rate Limit Göstergesi */}
        {rateLimitStatus && (
          <div
            className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border border-[#BCC7D2] bg-[#DBE6DD] text-[#3E5164]"
            title={`GitHub API Kalan İstek: ${rateLimitStatus.remaining} / ${rateLimitStatus.limit}`}
          >
            <Gauge className="w-3 h-3 text-[#3E5164]" />
            <span>API: {formatTrNumber(rateLimitStatus.remaining)}</span>
          </div>
        )}

        {/* Firestore Önbellek Göstergesi */}
        {isCachedFromDb && (
          <div
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border border-[#BCC7D2] bg-[#DBE6DD] text-[#253341]"
            title="Veriler Firebase Firestore'daki kayıtlı snapshot'tan anında yüklendi. GitHub'dan canlı veri çekmek için Yenile butonuna basın."
          >
            <Database className="w-3 h-3 text-[#3E5164]" />
            <span>DB Snapshot</span>
          </div>
        )}

        {/* Yapay Zekaya Sor Hızlı Butonu */}
        <button
          id="header-btn-ask-ai"
          onClick={onOpenAskAi}
          aria-label="KENSAI Analistini aç veya kapat"
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-xs ${
            isAskAiActive
              ? 'bg-[#253341] text-[#F5F9F5] border border-[#253341] ring-2 ring-[#EC7D55]'
              : 'border border-[#AB421C] bg-[#EC7D55] text-[#253341] hover:bg-[#AB421C] hover:text-[#F5F9F5]'
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
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-[#EC7D55] text-[#253341] hover:bg-[#AB421C] hover:text-[#F5F9F5] transition-colors cursor-pointer shadow-xs disabled:opacity-50 border border-[#AB421C]"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} aria-hidden="true" />
          <span>{isSyncing ? 'Yenileniyor...' : 'Yenile'}</span>
        </button>
      </div>
    </header>
  );
};
