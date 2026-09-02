import React, { useState } from 'react';
import {
  FolderGit2,
  Search,
  CheckCircle,
  XCircle,
  Flame,
  Star,
  GitFork,
  Terminal,
  Filter,
  RefreshCw,
  Sparkles,
  Gauge,
  Brain,
  Shield,
  AlertTriangle,
  X,
} from 'lucide-react';
import {
  Repository,
  FileHotspot,
  GitHubUser,
  SyncStatus,
  TelemetrySyncStatus,
  RateLimitStatus,
  RepoAiReview,
} from '../types.js';
import { useRepoReview } from '../hooks/useMetrics.js';

interface Props {
  repositories: Repository[];
  hotspots: FileHotspot[];
  user: GitHubUser | null;
  onToggleSelectRepo: (repoId: string) => void;
  onAskAboutRepo: (repoName: string) => void;
  selectedRepo: Repository | null;
  onSelectRepo: (repo: Repository | null) => void;
  onSync?: () => void;
  syncStatus?: SyncStatus;
  syncError?: string;
  telemetryStatus?: TelemetrySyncStatus;
  isSyncing?: boolean;
  rateLimitStatus?: RateLimitStatus;
}

export const RepositoriesView: React.FC<Props> = ({
  repositories = [],
  hotspots = [],
  user,
  onToggleSelectRepo,
  onAskAboutRepo,
  selectedRepo,
  onSelectRepo,
  onSync,
  syncStatus,
  syncError,
  isSyncing = false,
  rateLimitStatus,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('ALL');

  // AI Repo İnceleme Durumu
  const [activeReviewRepo, setActiveReviewRepo] = useState<Repository | null>(null);
  const [aiReviewData, setAiReviewData] = useState<RepoAiReview | null>(null);
  const repoReviewMutation = useRepoReview();

  const safeRepos = Array.isArray(repositories) ? repositories : [];
  const safeHotspots = Array.isArray(hotspots) ? hotspots : [];

  const languages = ['ALL', ...Array.from(new Set(safeRepos.map((r) => r.language).filter(Boolean)))];

  const filteredRepos = safeRepos.filter((repo) => {
    const matchesSearch =
      repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (repo.description && repo.description.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesLang = selectedLanguage === 'ALL' || repo.language === selectedLanguage;
    return matchesSearch && matchesLang;
  });

  const handleTriggerAiReview = async (repo: Repository) => {
    setActiveReviewRepo(repo);
    setAiReviewData(null);
    try {
      const result = await repoReviewMutation.mutateAsync(repo.name);
      setAiReviewData(result);
    } catch (err) {
      console.error('Yapay zeka incelemesi alınamadı:', err);
    }
  };

  return (
    <div id="repositories-view" className="space-y-6 font-sans">
      {/* 1. Kişisel GitHub Hesap & Durum Kartı (%30 Yüzey) */}
      <div
        className="p-6 rounded-2xl border flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 shadow-sm"
        style={{
          backgroundColor: 'rgba(var(--c1-rgb), 0.3)',
          borderColor: 'var(--c1)',
        }}
      >
        <div className="flex items-center gap-4">
          {user?.avatar_url ? (
            <img
              src={user.avatar_url}
              alt={user.name}
              className="w-14 h-14 rounded-2xl border object-cover shadow-sm shrink-0"
              style={{ borderColor: 'var(--c1)' }}
              referrerPolicy="no-referrer"
            />
          ) : (
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl border shadow-sm shrink-0"
              style={{
                backgroundColor: 'var(--c3)',
                borderColor: 'rgba(var(--c3-rgb), 0.9)',
                color: 'var(--ink-primary)',
              }}
            >
              GH
            </div>
          )}
          <div className="space-y-1">
            {rateLimitStatus && (
              <div className="flex items-center gap-2 flex-wrap pb-1">
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1"
                  style={{
                    backgroundColor: 'rgba(var(--c2-rgb), 0.9)',
                    borderColor: 'var(--c1)',
                    color: 'var(--ink-secondary)',
                  }}
                  title="Saatlik kalan GitHub API istek kotası"
                >
                  <Gauge className="w-3 h-3" />
                  API Kotası: {rateLimitStatus.remaining.toLocaleString()} / {rateLimitStatus.limit.toLocaleString()}
                </span>
              </div>
            )}
            <h2 className="text-base font-extrabold" style={{ color: 'var(--ink-primary)' }}>
              {user ? `${user.name} (@${user.login})` : 'GitHub Hesabı Bağlanıyor...'}
            </h2>
            <p className="text-xs max-w-xl leading-relaxed" style={{ color: 'var(--ink-secondary)' }}>
              Yalnızca kişisel hesabınızın sahibi olduğu <strong>{safeRepos.length} depo</strong> taranmaktadır. Doğrudan kişisel projeleriniz ve commit telemetriniz analiz edilir.
            </p>
          </div>
        </div>

        {/* Eşitleme Butonu */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
          {onSync && (
            <button
              onClick={onSync}
              disabled={isSyncing}
              className="flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl border transition-all hover:scale-102 cursor-pointer shadow-sm disabled:opacity-50"
              style={{
                backgroundColor: 'var(--c3)',
                borderColor: 'rgba(var(--c3-rgb), 0.9)',
                color: 'var(--ink-primary)',
              }}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Telemetri Eşitleniyor...' : 'Şimdi Eşitle'}</span>
            </button>
          )}
        </div>
      </div>

      {syncStatus === 'error' && syncError && (
        <div
          className="rounded-2xl border px-4 py-3 text-xs font-semibold"
          style={{
            backgroundColor: 'rgba(var(--c3-rgb), 0.3)',
            borderColor: 'var(--c3)',
            color: 'var(--ink-primary)',
          }}
          role="alert"
        >
          {syncError}
        </div>
      )}

      {/* 2. Filtreleme ve Arama Çubuğu */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--ink-muted)' }} />
          <input
            type="text"
            placeholder="Kişisel depolarda ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border focus:outline-hidden shadow-xs"
            style={{
              backgroundColor: 'rgba(var(--c2-rgb), 0.9)',
              borderColor: 'var(--c1)',
              color: 'var(--ink-primary)',
            }}
          />
        </div>

        {/* Dil Filtresi */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          <Filter className="w-3.5 h-3.5 mr-1 shrink-0" style={{ color: 'var(--ink-muted)' }} />
          {languages.slice(0, 6).map((lang) => (
            <button
              key={lang}
              onClick={() => setSelectedLanguage(lang)}
              className="text-[11px] font-bold px-3 py-1.5 rounded-lg border transition-all cursor-pointer shrink-0 shadow-xs"
              style={{
                backgroundColor: selectedLanguage === lang ? 'var(--c3)' : 'rgba(var(--c2-rgb), 0.85)',
                borderColor: selectedLanguage === lang ? 'rgba(var(--c3-rgb), 0.9)' : 'var(--c1)',
                color: 'var(--ink-primary)',
              }}
            >
              {lang}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Depolar Izgarası */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredRepos.map((repo) => {
          const repoHotspots = safeHotspots.filter((h) => h.repo_name === repo.name);
          const hasCriticalHotspot = repoHotspots.some((h) => h.risk_level === 'CRITICAL' || h.risk_level === 'HIGH');

          return (
            <div
              key={repo.id}
              className="p-5 rounded-2xl border transition-all hover:scale-101 shadow-sm flex flex-col justify-between"
              style={{
                backgroundColor: 'rgba(var(--c1-rgb), 0.3)',
                borderColor: 'var(--c1)',
              }}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <div
                      className="p-2 rounded-xl border shrink-0"
                      style={{
                        backgroundColor: 'var(--c3)',
                        borderColor: 'rgba(var(--c3-rgb), 0.8)',
                      }}
                    >
                      <FolderGit2 className="w-4 h-4" style={{ color: 'var(--ink-primary)' }} />
                    </div>
                    <div className="overflow-hidden">
                      <h3 className="text-sm font-black line-clamp-1" style={{ color: 'var(--ink-primary)' }}>
                        {repo.name}
                      </h3>
                      <span className="text-[10px] font-bold" style={{ color: 'var(--ink-muted)' }}>
                        {repo.language || 'Multi-stack'}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => onToggleSelectRepo(repo.id)}
                    disabled={isSyncing}
                    title={repo.selected_for_analysis ? 'Analize Dahil Edildi' : 'Analiz Dışı Bırakıldı'}
                    className="p-1.5 rounded-lg border transition-all cursor-pointer shadow-xs"
                    style={{
                      backgroundColor: repo.selected_for_analysis ? 'var(--c3)' : 'rgba(var(--c2-rgb), 0.8)',
                      borderColor: repo.selected_for_analysis ? 'rgba(var(--c3-rgb), 0.9)' : 'var(--c1)',
                      color: 'var(--ink-primary)',
                    }}
                  >
                    {repo.selected_for_analysis ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : (
                      <XCircle className="w-4 h-4" />
                    )}
                  </button>
                </div>

                <p className="text-xs line-clamp-2 leading-relaxed min-h-[32px]" style={{ color: 'var(--ink-secondary)' }}>
                  {repo.description || 'Kişisel GitHub projesi ve kod tabanı.'}
                </p>

                {hasCriticalHotspot && (
                  <div
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold"
                    style={{
                      backgroundColor: 'var(--c3)',
                      borderColor: 'rgba(var(--c3-rgb), 0.8)',
                      color: 'var(--ink-primary)',
                    }}
                  >
                    <Flame className="w-3.5 h-3.5" />
                    <span>Kod Sıcak Noktası Mevcut</span>
                  </div>
                )}
              </div>

              {/* Kart Alt Bilgisi & Eylemler */}
              <div className="pt-4 mt-4 border-t space-y-3" style={{ borderColor: 'rgba(var(--c1-rgb), 0.5)' }}>
                <div className="flex items-center justify-between text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <Star className="w-3 h-3" /> {repo.stargazers_count}
                    </span>
                    <span className="flex items-center gap-1">
                      <GitFork className="w-3 h-3" /> {repo.forks_count}
                    </span>
                  </div>
                  <span>{repo.open_issues_count} Açık Kayıt</span>
                </div>

                {/* Butonlar: AI İncele (Vurgulu) + Detay + Sor */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleTriggerAiReview(repo)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-black border transition-all hover:scale-102 cursor-pointer shadow-xs"
                    style={{
                      backgroundColor: 'var(--c3)',
                      borderColor: 'rgba(var(--c3-rgb), 0.9)',
                      color: 'var(--ink-primary)',
                    }}
                    title="Gemini ile bu deponun mimari ve kod kalitesini incele"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>AI İncele</span>
                  </button>

                  <button
                    onClick={() => onSelectRepo(repo)}
                    className="py-1.5 px-3 rounded-lg text-xs font-bold border transition-all hover:scale-101 cursor-pointer shadow-xs"
                    style={{
                      backgroundColor: 'rgba(var(--c2-rgb), 0.9)',
                      borderColor: 'var(--c1)',
                      color: 'var(--ink-primary)',
                    }}
                  >
                    Detay
                  </button>

                  <button
                    onClick={() => onAskAboutRepo(repo.name)}
                    className="p-1.5 rounded-lg border transition-all hover:scale-101 cursor-pointer shadow-xs"
                    style={{
                      backgroundColor: 'rgba(var(--c2-rgb), 0.9)',
                      borderColor: 'var(--c1)',
                      color: 'var(--ink-primary)',
                    }}
                    title="Bu depo hakkında yapay zekaya soru sor"
                  >
                    <Terminal className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredRepos.length === 0 && (
        <div
          className="rounded-2xl border px-5 py-6 text-center text-sm font-semibold"
          style={{
            backgroundColor: 'rgba(var(--c1-rgb), 0.25)',
            borderColor: 'var(--c1)',
            color: 'var(--ink-secondary)',
          }}
          role="status"
        >
          {safeRepos.length === 0
            ? 'Kişisel GitHub depolarınız yükleniyor...'
            : 'Arama veya dil filtresiyle eşleşen depo bulunamadı.'}
        </div>
      )}

      {/* 4. Yapay Zeka (Gemini) Kod & Mimari İnceleme Modalı */}
      {activeReviewRepo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md overflow-y-auto"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
        >
          <div
            className="w-full max-w-2xl p-6 rounded-2xl border space-y-5 shadow-2xl animate-in zoom-in-95 my-8"
            style={{
              backgroundColor: 'var(--c2)',
              borderColor: 'var(--c1)',
              color: 'var(--ink-primary)',
            }}
          >
            {/* Modal Başlığı */}
            <div className="flex items-center justify-between border-b pb-4" style={{ borderColor: 'var(--c1)' }}>
              <div className="flex items-center gap-3">
                <div
                  className="p-2 rounded-xl border shadow-xs"
                  style={{
                    backgroundColor: 'var(--c3)',
                    borderColor: 'rgba(var(--c3-rgb), 0.9)',
                  }}
                >
                  <Brain className="w-5 h-5" style={{ color: 'var(--ink-primary)' }} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-black">{activeReviewRepo.name}</h3>
                    <span
                      className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full border"
                      style={{
                        backgroundColor: 'var(--c1)',
                        borderColor: 'rgba(var(--c1-rgb), 0.8)',
                        color: 'var(--ink-primary)',
                      }}
                    >
                      AI Mimari İnceleme
                    </span>
                  </div>
                  <span className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                    Gemini zekası tarafından doğrulanmış telemetriye dayalı analiz
                  </span>
                </div>
              </div>

              <button
                onClick={() => {
                  setActiveReviewRepo(null);
                  setAiReviewData(null);
                }}
                className="p-1.5 rounded-xl border cursor-pointer hover:opacity-80"
                style={{
                  backgroundColor: 'var(--c1)',
                  borderColor: 'rgba(var(--c1-rgb), 0.8)',
                }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* İçerik / Yükleniyor Durumu */}
            {repoReviewMutation.isPending && !aiReviewData && (
              <div className="py-12 text-center space-y-3">
                <div className="inline-block animate-spin p-3 rounded-full border-2 border-dashed border-current">
                  <Sparkles className="w-6 h-6" />
                </div>
                <p className="text-sm font-bold">
                  Gemini kod tabanını, commit geçmişini ve mimari yapıyı inceliyor...
                </p>
                <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
                  Doğrulanmış telemetri kanıtları taranıyor
                </p>
              </div>
            )}

            {aiReviewData && (
              <div className="space-y-5 text-xs leading-relaxed max-h-[70vh] overflow-y-auto pr-1">
                {/* Kalite Skoru ve Genel Bakış */}
                <div
                  className="p-4 rounded-xl border flex items-center gap-4 shadow-xs"
                  style={{
                    backgroundColor: 'rgba(var(--c1-rgb), 0.35)',
                    borderColor: 'var(--c1)',
                  }}
                >
                  <div className="text-center p-3 rounded-xl border shrink-0" style={{ backgroundColor: 'var(--c3)', borderColor: 'rgba(var(--c3-rgb), 0.8)' }}>
                    <span className="text-2xl font-black block">{aiReviewData.codeQualityScore}</span>
                    <span className="text-[10px] font-bold opacity-75">/ 100 Kalite</span>
                  </div>
                  <div>
                    <h4 className="font-extrabold text-sm mb-1" style={{ color: 'var(--ink-primary)' }}>Mimari Genel Değerlendirme</h4>
                    <p style={{ color: 'var(--ink-secondary)' }}>{aiReviewData.architectureOverview}</p>
                  </div>
                </div>

                {/* Güçlü Yönler */}
                <div className="space-y-2">
                  <h4 className="font-extrabold text-xs uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--ink-primary)' }}>
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Tespit Edilen Güçlü Yönler</span>
                  </h4>
                  <ul className="space-y-1.5">
                    {aiReviewData.strengths.map((str, idx) => (
                      <li
                        key={idx}
                        className="p-2.5 rounded-xl border flex items-center gap-2 font-medium"
                        style={{
                          backgroundColor: 'rgba(var(--c2-rgb), 0.9)',
                          borderColor: 'var(--c1)',
                          color: 'var(--ink-primary)',
                        }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 shrink-0"></span>
                        <span>{str}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Teknik Borçlar & Güvenlik */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <h4 className="font-extrabold text-xs uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--ink-primary)' }}>
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Teknik Borçlar & Riskler</span>
                    </h4>
                    <ul className="space-y-1.5">
                      {aiReviewData.technicalDebts.map((debt, idx) => (
                        <li
                          key={idx}
                          className="p-2 rounded-xl border text-[11px]"
                          style={{
                            backgroundColor: 'rgba(var(--c1-rgb), 0.25)',
                            borderColor: 'var(--c1)',
                            color: 'var(--ink-secondary)',
                          }}
                        >
                          {debt}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-extrabold text-xs uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--ink-primary)' }}>
                      <Shield className="w-3.5 h-3.5" />
                      <span>Güvenlik & Hijyen Notları</span>
                    </h4>
                    <ul className="space-y-1.5">
                      {aiReviewData.securityObservations.map((sec, idx) => (
                        <li
                          key={idx}
                          className="p-2 rounded-xl border text-[11px]"
                          style={{
                            backgroundColor: 'rgba(var(--c1-rgb), 0.25)',
                            borderColor: 'var(--c1)',
                            color: 'var(--ink-secondary)',
                          }}
                        >
                          {sec}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Önerilen Mühendislik Yol Haritası */}
                <div className="space-y-2">
                  <h4 className="font-extrabold text-xs uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--ink-primary)' }}>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Önerilen Mühendislik Yol Haritası</span>
                  </h4>
                  <div className="space-y-2">
                    {aiReviewData.recommendedRoadmap.map((item, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl border space-y-1"
                        style={{
                          backgroundColor: 'rgba(var(--c2-rgb), 0.9)',
                          borderColor: 'var(--c1)',
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs" style={{ color: 'var(--ink-primary)' }}>{item.title}</span>
                          <span
                            className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full border"
                            style={{
                              backgroundColor: item.priority === 'HIGH' ? 'var(--c3)' : 'var(--c1)',
                              borderColor: 'rgba(var(--c1-rgb), 0.8)',
                            }}
                          >
                            Öncelik: {item.priority}
                          </span>
                        </div>
                        <p className="text-[11px]" style={{ color: 'var(--ink-secondary)' }}>{item.description}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Alt Eylemler */}
                <div className="pt-3 border-t flex justify-between items-center gap-3" style={{ borderColor: 'var(--c1)' }}>
                  <span className="text-[10px]" style={{ color: 'var(--ink-muted)' }}>
                    İnceleme Tarihi: {new Date(aiReviewData.reviewedAt).toLocaleDateString('tr-TR')}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        onAskAboutRepo(activeReviewRepo.name);
                        setActiveReviewRepo(null);
                        setAiReviewData(null);
                      }}
                      className="px-4 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer shadow-xs"
                      style={{
                        backgroundColor: 'var(--c3)',
                        borderColor: 'rgba(var(--c3-rgb), 0.9)',
                        color: 'var(--ink-primary)',
                      }}
                    >
                      Bu Depoyu AI'ya Sor
                    </button>
                    <button
                      onClick={() => {
                        setActiveReviewRepo(null);
                        setAiReviewData(null);
                      }}
                      className="px-3 py-2 rounded-xl text-xs font-bold border cursor-pointer"
                      style={{
                        backgroundColor: 'var(--c1)',
                        borderColor: 'rgba(var(--c1-rgb), 0.8)',
                      }}
                    >
                      Kapat
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Seçili Depo Detay Modalı (Normal) */}
      {selectedRepo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md"
          style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
        >
          <div
            className="w-full max-w-xl p-6 rounded-2xl border space-y-5 shadow-2xl animate-in zoom-in-95"
            style={{
              backgroundColor: 'var(--c2)',
              borderColor: 'var(--c1)',
              color: 'var(--ink-primary)',
            }}
          >
            <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--c1)' }}>
              <div className="flex items-center gap-2.5">
                <FolderGit2 className="w-5 h-5" />
                <h3 className="text-base font-black">{selectedRepo.name}</h3>
              </div>
              <button
                onClick={() => onSelectRepo(null)}
                className="text-xs font-bold px-2 py-1 rounded-lg border cursor-pointer"
                style={{
                  backgroundColor: 'var(--c1)',
                  borderColor: 'rgba(var(--c1-rgb), 0.8)',
                }}
              >
                Kapat
              </button>
            </div>

            <div className="space-y-3 text-xs leading-relaxed" style={{ color: 'var(--ink-secondary)' }}>
              <p><strong>Açıklama:</strong> {selectedRepo.description || 'Açıklama bulunmuyor'}</p>
              <p><strong>Programlama Dili:</strong> {selectedRepo.language}</p>
              <p><strong>Açık PR / Issue:</strong> {selectedRepo.open_issues_count}</p>
              <p><strong>Varsayılan Dal:</strong> {selectedRepo.default_branch}</p>
              <p><strong>GitHub URL:</strong> <a href={selectedRepo.html_url} target="_blank" rel="noreferrer" className="font-bold underline">{selectedRepo.html_url}</a></p>
            </div>

            <div className="pt-3 border-t flex justify-end gap-3" style={{ borderColor: 'var(--c1)' }}>
              <button
                onClick={() => {
                  const target = selectedRepo;
                  onSelectRepo(null);
                  handleTriggerAiReview(target);
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer shadow-sm flex items-center gap-1.5"
                style={{
                  backgroundColor: 'var(--c3)',
                  borderColor: 'rgba(var(--c3-rgb), 0.9)',
                  color: 'var(--ink-primary)',
                }}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>AI Kod İncelemesi Yap</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
