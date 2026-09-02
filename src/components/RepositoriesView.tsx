import React, { useState } from 'react';
import {
  FolderGit2,
  Search,
  ExternalLink,
  Lock,
  Globe,
  Sparkles,
  Layers,
  X,
  ShieldAlert,
  Brain,
  CheckCircle2,
  Calendar,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { Repository, GitHubUser } from '../types.js';
import { useRepoReview } from '../hooks/useMetrics.js';

interface Props {
  repositories: Repository[];
  hotspots?: any[];
  user: GitHubUser | null;
  onToggleSelectRepo?: (repoId: string) => void;
  onToggleRepo?: (repoId: any) => void;
  onAskAboutRepo: (repoName: string) => void;
  selectedRepo: Repository | null;
  onSelectRepo: (repo: Repository | null) => void;
  onSync: () => void;
  syncStatus?: string;
  syncError?: string | null;
  telemetryStatus?: string;
  isSyncing?: boolean;
  rateLimitStatus?: any;
}

export const RepositoriesView: React.FC<Props> = ({
  repositories = [],
  hotspots = [],
  user,
  onToggleSelectRepo,
  onToggleRepo,
  onAskAboutRepo,
  selectedRepo,
  onSelectRepo,
  onSync,
  syncStatus,
  syncError,
  telemetryStatus,
  isSyncing = false,
  rateLimitStatus,
}) => {
  const [search, setSearch] = useState('');
  const [filterLang, setFilterLang] = useState<string>('ALL');

  // AI İnceleme Modalı Durumu
  const [activeRepoForReview, setActiveRepoForReview] = useState<Repository | null>(null);
  const [reviewResult, setReviewResult] = useState<any | null>(null);
  const repoReviewMutation = useRepoReview();

  const handleTriggerReview = async (repo: Repository) => {
    setActiveRepoForReview(repo);
    setReviewResult(null);
    try {
      const res = await repoReviewMutation.mutateAsync(repo.name);
      setReviewResult(res);
    } catch (err) {
      console.error('İnceleme alınamadı:', err);
    }
  };

  const safeRepos = Array.isArray(repositories) ? repositories : [];

  const languages = Array.from(
    new Set(safeRepos.map((r) => r.language).filter(Boolean))
  ) as string[];

  const filteredRepos = safeRepos.filter((r) => {
    const matchesSearch =
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      (r.description && r.description.toLowerCase().includes(search.toLowerCase()));
    const matchesLang = filterLang === 'ALL' || r.language === filterLang;
    return matchesSearch && matchesLang;
  });

  return (
    <div id="repositories-view" className="space-y-6 font-sans text-[#231c1a]">
      {/* Üst Bilgi ve Kullanıcı Kartı */}
      <div className="p-5 rounded-xl border border-[#a89997] bg-[#cdc1b5] flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-4">
          {user?.avatar_url ? (
            <img
              src={user.avatar_url}
              alt={user.name}
              className="w-12 h-12 rounded-xl border border-[#a89997] object-cover shadow-xs"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/15 flex items-center justify-center font-bold text-sm shadow-xs">
              GH
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-[#231c1a] tracking-tight">
                {user?.name || user?.login || 'Kişisel GitHub Hesabı'}
              </h2>
              {user?.login && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/15 font-bold">
                  @{user.login}
                </span>
              )}
            </div>
            <p className="text-xs text-[#4a3e3b] mt-0.5 font-medium">
              Yalnızca size ait kişisel GitHub depoları analiz edilmektedir.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-xs text-[#4a3e3b] block font-bold">Toplam Depo</span>
            <span className="text-sm font-bold text-[#231c1a]">{safeRepos.length}</span>
          </div>
          <div className="w-px h-6 bg-[#a89997]" />
          <div className="text-right">
            <span className="text-xs text-[#4a3e3b] block font-bold">Analiz Edilen</span>
            <span className="text-sm font-bold text-[#231c1a]">
              {safeRepos.filter((r) => r.selected_for_analysis).length}
            </span>
          </div>
        </div>
      </div>

      {/* Arama ve Dil Filtreleme Çubuğu */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Arama Kutusu */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#4a3e3b]" />
          <input
            type="text"
            placeholder="Depo adı veya açıklamaya göre ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-[#a89997] bg-[#b9aba9]/35 text-xs text-[#231c1a] placeholder-[#6e5f5c] focus:outline-none focus:border-[#f9b88e] transition-colors"
          />
        </div>

        {/* Dil Filtresi Hapları */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setFilterLang('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              filterLang === 'ALL'
                ? 'bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/20 shadow-xs'
                : 'border border-[#a89997] bg-[#b9aba9]/35 text-[#4a3e3b] hover:text-[#231c1a]'
            }`}
          >
            Tümü ({safeRepos.length})
          </button>
          {languages.map((lang) => (
            <button
              key={lang}
              onClick={() => setFilterLang(lang)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                filterLang === lang
                  ? 'bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/20 shadow-xs'
                  : 'border border-[#a89997] bg-[#b9aba9]/35 text-[#4a3e3b] hover:text-[#231c1a]'
              }`}
            >
              {lang}
            </button>
          ))}
        </div>
      </div>

      {/* Depolar Listesi */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredRepos.length === 0 ? (
          <div className="col-span-full p-8 rounded-xl border border-[#a89997] bg-[#cdc1b5] text-center text-xs text-[#6e5f5c]">
            Aramanızla eşleşen depo bulunamadı.
          </div>
        ) : (
          filteredRepos.map((repo) => {
            const isSelected = repo.selected_for_analysis;
            return (
              <div
                key={repo.id}
                className={`p-4 rounded-xl border transition-all flex flex-col justify-between gap-3 shadow-xs ${
                  isSelected
                    ? 'border-[#231c1a]/30 bg-[#cdc1b5]'
                    : 'border-[#a89997] bg-[#cdc1b5]/80 hover:bg-[#cdc1b5]'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {repo.private ? (
                        <Lock className="w-3.5 h-3.5 text-[#4a3e3b] shrink-0" />
                      ) : (
                        <Globe className="w-3.5 h-3.5 text-[#4a3e3b] shrink-0" />
                      )}
                      <span className="font-bold text-xs text-[#231c1a] truncate">
                        {repo.name}
                      </span>
                    </div>

                    <a
                      href={repo.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 rounded text-[#4a3e3b] hover:text-[#231c1a] transition-colors shrink-0"
                      title="GitHub'da aç"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>

                  <p className="text-xs text-[#4a3e3b] line-clamp-2 leading-relaxed font-medium">
                    {repo.description || 'Açıklama bulunmuyor.'}
                  </p>
                </div>

                <div className="space-y-3 pt-2 border-t border-[#a89997]">
                  <div className="flex items-center justify-between text-[11px] text-[#4a3e3b]">
                    <span className="font-bold">{repo.language || 'Belirtilmemiş'}</span>
                    <span>{repo.open_issues_count} Issue · {repo.forks_count} Fork</span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <button
                      onClick={() => {
                        const toggleFn = onToggleSelectRepo || onToggleRepo;
                        if (toggleFn) {
                          toggleFn(String(repo.id));
                        }
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/20 shadow-xs'
                          : 'border border-[#a89997] bg-[#b9aba9]/35 text-[#4a3e3b] hover:text-[#231c1a]'
                      }`}
                    >
                      {isSelected ? 'Analizde Dahil' : 'Analize Ekle'}
                    </button>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleTriggerReview(repo)}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/15 hover:brightness-105 transition-all cursor-pointer shadow-xs flex items-center gap-1"
                        title="Gemini ile kapsamlı depo incelemesi"
                      >
                        <Sparkles className="w-3 h-3 text-[#231c1a]" />
                        <span>İncele</span>
                      </button>

                      <button
                        onClick={() => onAskAboutRepo(repo.name)}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-bold border border-[#a89997] bg-[#b9aba9]/35 text-[#231c1a] hover:bg-[#b9aba9]/50 transition-all cursor-pointer"
                      >
                        AI Sor
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Yapay Zeka Depo İnceleme Rapor Modalı */}
      {activeRepoForReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm overflow-y-auto font-sans">
          <div className="w-full max-w-2xl p-6 rounded-2xl border border-[#a89997] bg-[#cdc1b5] space-y-5 shadow-2xl animate-in zoom-in-95 my-8 text-[#231c1a]">
            {/* Modal Başlığı */}
            <div className="flex items-center justify-between border-b border-[#a89997] pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[#f9b88e] border border-[#231c1a]/15 text-[#231c1a] shadow-xs">
                  <Brain className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#231c1a]">
                    {activeRepoForReview.name} — Gemini Mimari İnceleme
                  </h3>
                  <span className="text-[11px] text-[#4a3e3b] block mt-0.5 font-medium">
                    Otomatik kod kalitesi ve sağlık değerlendirmesi
                  </span>
                </div>
              </div>

              <button
                onClick={() => {
                  setActiveRepoForReview(null);
                  setReviewResult(null);
                }}
                className="p-1.5 rounded-lg border border-[#231c1a]/15 bg-[#f9b88e] text-[#231c1a] hover:brightness-105 cursor-pointer transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Yükleniyor Durumu */}
            {repoReviewMutation.isPending && !reviewResult && (
              <div className="py-12 text-center space-y-3">
                <div className="inline-block animate-spin p-3 rounded-full border-2 border-dashed border-[#231c1a] text-[#231c1a]">
                  <Sparkles className="w-6 h-6" />
                </div>
                <p className="text-sm font-bold text-[#231c1a]">
                  Gemini Flash depo telemetrisini ve commit geçmişini inceliyor...
                </p>
                <p className="text-xs text-[#4a3e3b]">
                  Mimari güçlü yönler, riskler ve 14 günlük aksiyon planı sentezleniyor
                </p>
              </div>
            )}

            {reviewResult && (
              <div className="space-y-4 text-xs leading-relaxed max-h-[70vh] overflow-y-auto pr-1">
                {/* Mimari Değerlendirme Özeti */}
                <div className="p-4 rounded-xl border border-[#a89997] bg-[#b9aba9]/35 space-y-1.5 shadow-xs">
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/15 inline-block">
                    Mimari Özet
                  </span>
                  <p className="text-xs text-[#231c1a] font-medium leading-relaxed">
                    {reviewResult.architecturalSummary}
                  </p>
                </div>

                {/* Güçlü Yönler */}
                <div className="space-y-2">
                  <h4 className="font-bold text-xs text-[#231c1a] uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#231c1a]" />
                    <span>Güçlü Yönler</span>
                  </h4>
                  <ul className="space-y-1.5">
                    {reviewResult.strengths?.map((str: string, idx: number) => (
                      <li
                        key={idx}
                        className="p-2.5 rounded-lg border border-[#a89997] bg-[#b9aba9]/30 text-[#4a3e3b] flex items-start gap-2 font-medium"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-[#231c1a] mt-1.5 shrink-0" />
                        <span>{str}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Kritik İyileştirme Alanları */}
                <div className="space-y-2">
                  <h4 className="font-bold text-xs text-[#231c1a] uppercase tracking-wider flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-[#231c1a]" />
                    <span>İyileştirme Gereken Alanlar</span>
                  </h4>
                  <ul className="space-y-1.5">
                    {reviewResult.weaknesses?.map((weak: string, idx: number) => (
                      <li
                        key={idx}
                        className="p-2.5 rounded-lg border border-[#a89997] bg-[#b9aba9]/30 text-[#4a3e3b] flex items-start gap-2 font-medium"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-[#4a3e3b] mt-1.5 shrink-0" />
                        <span>{weak}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* 14 Günlük Aksiyon Planı */}
                <div className="space-y-2">
                  <h4 className="font-bold text-xs text-[#231c1a] uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-[#231c1a]" />
                    <span>14 Günlük Mühendislik Aksiyon Planı</span>
                  </h4>
                  <ol className="space-y-1.5">
                    {reviewResult.actionItemsNext14Days?.map((action: string, idx: number) => (
                      <li
                        key={idx}
                        className="p-2.5 rounded-lg border border-[#a89997] bg-[#b9aba9]/30 text-[#4a3e3b] flex items-start gap-2.5 font-medium"
                      >
                        <span className="w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/15">
                          {idx + 1}
                        </span>
                        <span>{action}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Alt Butonlar */}
                <div className="pt-3 border-t border-[#a89997] flex justify-end gap-2">
                  <button
                    onClick={() => {
                      onAskAboutRepo(activeRepoForReview.name);
                      setActiveRepoForReview(null);
                      setReviewResult(null);
                    }}
                    className="px-3.5 py-2 rounded-lg text-xs font-bold bg-[#f9b88e] text-[#231c1a] hover:brightness-105 transition-all cursor-pointer border border-[#231c1a]/15 shadow-xs"
                  >
                    AI Analistine Sor
                  </button>
                  <button
                    onClick={() => {
                      setActiveRepoForReview(null);
                      setReviewResult(null);
                    }}
                    className="px-3 py-2 rounded-lg text-xs font-bold border border-[#a89997] bg-[#b9aba9]/35 text-[#231c1a] hover:bg-[#b9aba9]/50 transition-all cursor-pointer"
                  >
                    Kapat
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
