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
  ExternalLink,
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
    <div id="repositories-view" className="space-y-6 font-sans text-[#241c1d]">
      {/* 1. Kişisel GitHub Hesap & Durum Kartı */}
      <div className="p-5 rounded-xl border border-[#e8ded9] bg-[#f9efec] flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-3.5">
          {user?.avatar_url ? (
            <img
              src={user.avatar_url}
              alt={user.name}
              className="w-12 h-12 rounded-xl border border-[#e8ded9] object-cover shrink-0"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-sm bg-[#fff4f0] border border-[#e8ded9] text-[#241c1d] shrink-0">
              GH
            </div>
          )}
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-[#241c1d] tracking-tight">
                {user ? `${user.name} (@${user.login})` : 'GitHub Hesabı Bağlanıyor...'}
              </h2>
              {rateLimitStatus && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#fff4f0] border border-[#e8ded9] text-[#5c5254] flex items-center gap-1 font-semibold">
                  <Gauge className="w-3 h-3 text-[#5c5254]" />
                  API: {rateLimitStatus.remaining.toLocaleString()} / {rateLimitStatus.limit.toLocaleString()}
                </span>
              )}
            </div>
            <p className="text-xs text-[#5c5254] max-w-xl leading-relaxed">
              Kişisel hesabınıza ait <strong>{safeRepos.length} depo</strong> taranmaktadır. Doğrudan projeleriniz ve commit telemetriniz analiz edilir.
            </p>
          </div>
        </div>

        {/* Eşitleme Butonu */}
        <div className="flex items-center gap-2 w-full lg:w-auto">
          {onSync && (
            <button
              onClick={onSync}
              disabled={isSyncing}
              className="flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg bg-[#fff4f0] text-[#241c1d] hover:bg-white transition-colors cursor-pointer border border-[#e8ded9] shadow-xs disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Telemetri Eşitleniyor...' : 'Şimdi Eşitle'}</span>
            </button>
          )}
        </div>
      </div>

      {syncStatus === 'error' && syncError && (
        <div className="rounded-xl border border-[#e8ded9] bg-[#f9efec] px-4 py-3 text-xs text-[#241c1d]" role="alert">
          {syncError}
        </div>
      )}

      {/* 2. Filtreleme ve Arama Çubuğu */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#8c8082]" />
          <input
            type="text"
            placeholder="Depolarda ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-[#e8ded9] bg-[#f9efec] text-[#241c1d] placeholder-[#8c8082] focus:outline-hidden focus:border-[#d9cbc5]"
          />
        </div>

        {/* Dil Filtresi */}
        <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          <Filter className="w-3.5 h-3.5 text-[#5c5254] mr-1 shrink-0" />
          {languages.slice(0, 6).map((lang) => (
            <button
              key={lang}
              onClick={() => setSelectedLanguage(lang)}
              className={`text-[11px] font-bold px-2.5 py-1 rounded-md border transition-all cursor-pointer shrink-0 ${
                selectedLanguage === lang
                  ? 'bg-[#fff4f0] border-[#e8ded9] text-[#241c1d] shadow-xs'
                  : 'bg-[#f9efec] border-[#e8ded9] text-[#5c5254] hover:text-[#241c1d]'
              }`}
            >
              {lang}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Depolar Izgarası */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredRepos.map((repo) => {
          const repoHotspots = safeHotspots.filter((h) => h.repo_name === repo.name);
          const hasCriticalHotspot = repoHotspots.some((h) => h.risk_level === 'CRITICAL' || h.risk_level === 'HIGH');

          return (
            <div
              key={repo.id}
              className="p-4 rounded-xl border border-[#e8ded9] bg-[#f9efec] hover:bg-[#fff4f0] transition-all flex flex-col justify-between shadow-xs"
            >
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 overflow-hidden min-w-0">
                    <div className="p-2 rounded-lg bg-[#fff4f0] border border-[#e8ded9] text-[#241c1d] shrink-0">
                      <FolderGit2 className="w-4 h-4" />
                    </div>
                    <div className="overflow-hidden min-w-0">
                      <h3 className="text-xs font-bold text-[#241c1d] truncate">
                        {repo.name}
                      </h3>
                      <span className="text-[10px] text-[#5c5254] font-mono">
                        {repo.language || 'Multi-stack'}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => onToggleSelectRepo(repo.id)}
                    disabled={isSyncing}
                    title={repo.selected_for_analysis ? 'Analize Dahil Edildi' : 'Analiz Dışı Bırakıldı'}
                    className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                      repo.selected_for_analysis
                        ? 'bg-[#fff4f0] border-[#e8ded9] text-[#241c1d]'
                        : 'bg-[#f6f3f4] border-[#e8ded9] text-[#8c8082] hover:text-[#241c1d]'
                    }`}
                  >
                    {repo.selected_for_analysis ? (
                      <CheckCircle className="w-3.5 h-3.5 text-[#241c1d]" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-[#8c8082]" />
                    )}
                  </button>
                </div>

                <p className="text-xs text-[#5c5254] line-clamp-2 leading-relaxed min-h-[32px]">
                  {repo.description || 'Kişisel GitHub projesi ve kod tabanı.'}
                </p>

                {hasCriticalHotspot && (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-[#e8ded9] bg-[#fff4f0] text-[11px] text-[#241c1d] font-bold">
                    <Flame className="w-3 h-3 text-[#241c1d]" />
                    <span>Sıcak Nokta Mevcut</span>
                  </div>
                )}
              </div>

              {/* Kart Alt Bilgisi & Eylemler */}
              <div className="pt-3 mt-3 border-t border-[#e8ded9] space-y-2.5">
                <div className="flex items-center justify-between text-[11px] text-[#5c5254]">
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

                {/* Butonlar: AI İncele + Detay + Sor */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleTriggerAiReview(repo)}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-lg text-xs font-bold bg-[#fff4f0] text-[#241c1d] hover:bg-white transition-colors cursor-pointer border border-[#e8ded9] shadow-xs"
                    title="Gemini ile incele"
                  >
                    <Sparkles className="w-3 h-3 text-[#241c1d]" />
                    <span>AI İncele</span>
                  </button>

                  <button
                    onClick={() => onSelectRepo(repo)}
                    className="py-1.5 px-2.5 rounded-lg text-xs font-bold border border-[#e8ded9] bg-[#fff4f0] text-[#241c1d] hover:bg-white transition-colors cursor-pointer"
                  >
                    Detay
                  </button>

                  <button
                    onClick={() => onAskAboutRepo(repo.name)}
                    className="p-1.5 rounded-lg border border-[#e8ded9] bg-[#fff4f0] text-[#241c1d] hover:bg-white transition-colors cursor-pointer"
                    title="Bu depo hakkında yapay zekaya soru sor"
                  >
                    <Terminal className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredRepos.length === 0 && (
        <div className="rounded-xl border border-[#e8ded9] bg-[#f9efec] px-5 py-6 text-center text-xs text-[#8c8082]" role="status">
          {safeRepos.length === 0
            ? 'Kişisel GitHub depolarınız yükleniyor...'
            : 'Arama veya dil filtresiyle eşleşen depo bulunamadı.'}
        </div>
      )}

      {/* 4. Yapay Zeka (Gemini) Kod & Mimari İnceleme Modalı */}
      {activeReviewRepo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm overflow-y-auto font-sans">
          <div className="w-full max-w-2xl p-6 rounded-2xl border border-[#e8ded9] bg-[#f9efec] space-y-5 shadow-2xl animate-in zoom-in-95 my-8 text-[#241c1d]">
            {/* Modal Başlığı */}
            <div className="flex items-center justify-between border-b border-[#e8ded9] pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[#fff4f0] border border-[#e8ded9] text-[#241c1d] shadow-xs">
                  <Brain className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-[#241c1d]">{activeReviewRepo.name}</h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#fff4f0] border border-[#e8ded9] text-[#241c1d]">
                      AI Mimari İnceleme
                    </span>
                  </div>
                  <span className="text-[11px] text-[#5c5254] block mt-0.5">
                    Gemini telemetri analizi
                  </span>
                </div>
              </div>

              <button
                onClick={() => {
                  setActiveReviewRepo(null);
                  setAiReviewData(null);
                }}
                className="p-1.5 rounded-lg border border-[#e8ded9] bg-[#fff4f0] text-[#241c1d] hover:bg-white cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Yükleniyor Durumu */}
            {repoReviewMutation.isPending && !aiReviewData && (
              <div className="py-12 text-center space-y-3">
                <div className="inline-block animate-spin p-3 rounded-full border-2 border-dashed border-[#241c1d] text-[#241c1d]">
                  <Sparkles className="w-6 h-6" />
                </div>
                <p className="text-sm font-bold text-[#241c1d]">
                  Gemini kod tabanını ve mimari yapıyı inceliyor...
                </p>
                <p className="text-xs text-[#5c5254]">
                  Doğrulanmış telemetri kanıtları taranıyor
                </p>
              </div>
            )}

            {aiReviewData && (
              <div className="space-y-4 text-xs leading-relaxed max-h-[70vh] overflow-y-auto pr-1">
                {/* Kalite Skoru ve Genel Bakış */}
                <div className="p-4 rounded-xl border border-[#e8ded9] bg-[#fff4f0] flex items-center gap-4 shadow-xs">
                  <div className="text-center p-3 rounded-lg bg-[#f9efec] border border-[#e8ded9] text-[#241c1d] shrink-0">
                    <span className="text-2xl font-extrabold block">{aiReviewData.codeQualityScore}</span>
                    <span className="text-[10px] font-bold opacity-80">/ 100 Kalite</span>
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-[#241c1d] mb-1">Mimari Değerlendirme</h4>
                    <p className="text-[#5c5254]">{aiReviewData.architectureOverview}</p>
                  </div>
                </div>

                {/* Güçlü Yönler */}
                <div className="space-y-2">
                  <h4 className="font-bold text-xs text-[#241c1d] uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-[#241c1d]" />
                    <span>Tespit Edilen Güçlü Yönler</span>
                  </h4>
                  <ul className="space-y-1.5">
                    {aiReviewData.strengths.map((str, idx) => (
                      <li
                        key={idx}
                        className="p-2.5 rounded-lg border border-[#e8ded9] bg-[#fff4f0] flex items-center gap-2 text-[#241c1d]"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-[#241c1d] shrink-0" />
                        <span>{str}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Teknik Borçlar & Güvenlik */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <h4 className="font-bold text-xs text-[#241c1d] uppercase tracking-wider flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-[#241c1d]" />
                      <span>Teknik Borçlar & Riskler</span>
                    </h4>
                    <ul className="space-y-1.5">
                      {aiReviewData.technicalDebts.map((debt, idx) => (
                        <li
                          key={idx}
                          className="p-2 rounded-lg border border-[#e8ded9] bg-[#fff4f0] text-[11px] text-[#5c5254]"
                        >
                          {debt}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-bold text-xs text-[#241c1d] uppercase tracking-wider flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-[#241c1d]" />
                      <span>Güvenlik & Hijyen Notları</span>
                    </h4>
                    <ul className="space-y-1.5">
                      {aiReviewData.securityObservations.map((sec, idx) => (
                        <li
                          key={idx}
                          className="p-2 rounded-lg border border-[#e8ded9] bg-[#fff4f0] text-[11px] text-[#5c5254]"
                        >
                          {sec}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Önerilen Mühendislik Yol Haritası */}
                <div className="space-y-2">
                  <h4 className="font-bold text-xs text-[#241c1d] uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#241c1d]" />
                    <span>Önerilen Yol Haritası</span>
                  </h4>
                  <div className="space-y-2">
                    {aiReviewData.recommendedRoadmap.map((item, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-lg border border-[#e8ded9] bg-[#fff4f0] space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-[#241c1d]">{item.title}</span>
                          <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded border border-[#e8ded9] bg-[#f9efec] text-[#241c1d]">
                            Öncelik: {item.priority}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#5c5254]">{item.description}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Alt Eylemler */}
                <div className="pt-3 border-t border-[#e8ded9] flex justify-between items-center gap-3">
                  <span className="text-[10px] text-[#8c8082]">
                    İnceleme: {new Date(aiReviewData.reviewedAt).toLocaleDateString('tr-TR')}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        onAskAboutRepo(activeReviewRepo.name);
                        setActiveReviewRepo(null);
                        setAiReviewData(null);
                      }}
                      className="px-3.5 py-2 rounded-lg text-xs font-bold bg-[#fff4f0] text-[#241c1d] hover:bg-white transition-colors cursor-pointer border border-[#e8ded9] shadow-xs"
                    >
                      AI'ya Sor
                    </button>
                    <button
                      onClick={() => {
                        setActiveReviewRepo(null);
                        setAiReviewData(null);
                      }}
                      className="px-3 py-2 rounded-lg text-xs font-bold border border-[#e8ded9] bg-[#f6f3f4] text-[#241c1d] hover:bg-white transition-colors cursor-pointer"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm font-sans">
          <div className="w-full max-w-lg p-6 rounded-2xl border border-[#e8ded9] bg-[#f9efec] space-y-4 shadow-2xl animate-in zoom-in-95 text-[#241c1d]">
            <div className="flex items-center justify-between border-b border-[#e8ded9] pb-3">
              <div className="flex items-center gap-2.5">
                <FolderGit2 className="w-5 h-5 text-[#241c1d]" />
                <h3 className="text-sm font-bold text-[#241c1d]">{selectedRepo.name}</h3>
              </div>
              <button
                onClick={() => onSelectRepo(null)}
                className="text-xs font-bold px-2 py-1 rounded-md border border-[#e8ded9] bg-[#fff4f0] text-[#241c1d] hover:bg-white cursor-pointer"
              >
                Kapat
              </button>
            </div>

            <div className="space-y-2 text-xs leading-relaxed text-[#5c5254]">
              <p><strong className="text-[#241c1d] font-bold">Açıklama:</strong> {selectedRepo.description || 'Açıklama bulunmuyor'}</p>
              <p><strong className="text-[#241c1d] font-bold">Programlama Dili:</strong> {selectedRepo.language}</p>
              <p><strong className="text-[#241c1d] font-bold">Açık Kayıtlar:</strong> {selectedRepo.open_issues_count}</p>
              <p><strong className="text-[#241c1d] font-bold">Varsayılan Dal:</strong> {selectedRepo.default_branch}</p>
              <p className="flex items-center gap-1">
                <strong className="text-[#241c1d] font-bold">GitHub URL:</strong>
                <a
                  href={selectedRepo.html_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#241c1d] font-bold hover:underline flex items-center gap-1 font-mono text-[11px]"
                >
                  {selectedRepo.html_url}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </p>
            </div>

            <div className="pt-3 border-t border-[#e8ded9] flex justify-end gap-2">
              <button
                onClick={() => {
                  const target = selectedRepo;
                  onSelectRepo(null);
                  handleTriggerAiReview(target);
                }}
                className="px-3.5 py-2 rounded-lg text-xs font-bold bg-[#fff4f0] text-[#241c1d] hover:bg-white transition-colors cursor-pointer border border-[#e8ded9] shadow-xs flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>AI İncelemesi Yap</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
