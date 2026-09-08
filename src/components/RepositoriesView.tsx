import React, { useState, useRef } from 'react';
import {
  Search,
  ExternalLink,
  Lock,
  Globe,
  Sparkles,
  X,
  Brain,
  CheckCircle2,
  Calendar,
  AlertCircle,
  ShieldCheck,
  Star,
  GitFork,
  Tag,
} from 'lucide-react';
import { Repository, GitHubUser, RepoAiReview } from '../types.js';
import { useRepoReview } from '../hooks/useMetrics.js';

interface Props {
  repositories: Repository[];
  user: GitHubUser | null;
  onToggleRepo: (repoId: string) => void;
  onAskAboutRepo: (repoName: string) => void;
}

export const RepositoriesView: React.FC<Props> = ({
  repositories = [],
  user,
  onToggleRepo,
  onAskAboutRepo,
}) => {
  const [search, setSearch] = useState('');
  const [filterLang, setFilterLang] = useState<string>('ALL');

  // KENSAI İnceleme Modalı Durumu
  const [activeRepoForReview, setActiveRepoForReview] = useState<Repository | null>(null);
  const activeRepoNameRef = useRef<string | null>(null);
  const [reviewResult, setReviewResult] = useState<RepoAiReview | null>(null);
  const repoReviewMutation = useRepoReview();

  const handleTriggerReview = async (repo: Repository) => {
    setActiveRepoForReview(repo);
    activeRepoNameRef.current = repo.name;
    setReviewResult(null);
    try {
      const res = await repoReviewMutation.mutateAsync(repo.name);
      if (activeRepoNameRef.current === repo.name) {
        setReviewResult(res);
      }
    } catch (err) {
      if (activeRepoNameRef.current === repo.name) {
        console.error('İnceleme alınamadı:', err);
      }
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
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${filterLang === 'ALL'
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
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${filterLang === lang
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
                className={`p-4 rounded-xl border transition-all flex flex-col justify-between gap-3 shadow-xs ${isSelected
                  ? 'border-[#231c1a]/30 bg-[#cdc1b5]'
                  : 'border-[#a89997] bg-[#cdc1b5]/80 hover:bg-[#cdc1b5]'
                  }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {(repo.is_private ?? repo.private) ? (
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

                  {/* CI/CD, Sürüm ve Dal Rozetleri */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {repo.latest_ci_run ? (
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded border border-[#231c1a]/15 flex items-center gap-1 ${repo.latest_ci_run.conclusion === 'success'
                          ? 'bg-[#f9b88e] text-[#231c1a]'
                          : repo.latest_ci_run.conclusion === 'failure'
                            ? 'bg-[#231c1a] text-[#f9b88e]'
                            : 'bg-[#b9aba9]/50 text-[#231c1a]'
                          }`}
                        title={`En son CI workflow: ${repo.latest_ci_run.name} (${repo.latest_ci_run.conclusion || repo.latest_ci_run.status})`}
                      >
                        <ShieldCheck className="w-3 h-3 shrink-0" />
                        <span>CI: {repo.latest_ci_run.conclusion === 'success' ? 'Geçti' : repo.latest_ci_run.conclusion === 'failure' ? 'Hata' : repo.latest_ci_run.status}</span>
                      </span>
                    ) : null}

                    {repo.latest_release ? (
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded border border-[#231c1a]/15 bg-[#b9aba9]/40 text-[#231c1a] flex items-center gap-1"
                        title={`Son yayınlanan sürüm: ${repo.latest_release.tag_name} (${repo.latest_release.published_at.slice(0, 10)})`}
                      >
                        <Tag className="w-3 h-3 shrink-0 text-[#231c1a]" />
                        <span>{repo.latest_release.tag_name}</span>
                      </span>
                    ) : null}

                    {repo.branches_count && repo.branches_count > 1 ? (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-[#231c1a]/15 bg-[#b9aba9]/30 text-[#4a3e3b]">
                        {repo.branches_count} dal
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-3 pt-2 border-t border-[#a89997]">
                  <div className="flex items-center justify-between text-[11px] text-[#4a3e3b]">
                    <span className="font-bold truncate max-w-[140px]" title={repo.languages ? Object.keys(repo.languages).join(', ') : repo.language}>
                      {repo.language || 'Belirtilmemiş'}
                      {repo.languages && Object.keys(repo.languages).length > 1 ? ` (+${Object.keys(repo.languages).length - 1})` : ''}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 font-medium">
                        <Star className="w-3 h-3 text-[#231c1a]" />
                        <span>{repo.stargazers_count || 0} Star</span>
                      </span>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1 font-medium">
                        <GitFork className="w-3 h-3 text-[#231c1a]" />
                        <span>{repo.forks_count || 0} Fork</span>
                      </span>
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <button
                      onClick={() => onToggleRepo(String(repo.id))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${isSelected
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
                        title="Depo hakkında yapay zeka analistine soru sor"
                        className="px-2.5 py-1.5 rounded-lg text-xs font-bold border border-[#a89997] bg-[#b9aba9]/35 text-[#231c1a] hover:bg-[#b9aba9]/50 transition-all cursor-pointer shadow-xs"
                      >
                        Kensai
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
                    {activeRepoForReview.name} — Kensai Mimari İnceleme
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
                aria-label="İnceleme penceresini kapat"
                className="p-1.5 rounded-lg border border-[#231c1a]/15 bg-[#f9b88e] text-[#231c1a] hover:brightness-105 cursor-pointer transition-all"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {/* Yükleniyor Durumu */}
            {repoReviewMutation.isPending && !reviewResult && (
              <div className="py-12 text-center space-y-3">
                <div className="inline-block animate-spin p-3 rounded-full border-2 border-dashed border-[#231c1a] text-[#231c1a]">
                  <Sparkles className="w-6 h-6" />
                </div>
                <p className="text-sm font-bold text-[#231c1a]">
                  KENSAI depo telemetrisini ve commit geçmişini inceliyor...
                </p>
                <p className="text-xs text-[#4a3e3b]">
                  Mimari güçlü yönler, riskler ve 14 günlük aksiyon planı sentezleniyor
                </p>
              </div>
            )}

            {/* Hata Durumu */}
            {repoReviewMutation.isError && !reviewResult && (
              <div className="py-8 text-center space-y-3">
                <div className="p-3 rounded-full bg-[#f9b88e]/40 border border-[#231c1a]/20 inline-flex text-[#231c1a]">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <p className="text-xs font-bold text-[#231c1a]">
                  {repoReviewMutation.error?.message || 'İnceleme raporu alınırken bir hata oluştu.'}
                </p>
                <div className="flex justify-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => handleTriggerReview(activeRepoForReview)}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/15 hover:brightness-105 transition-all cursor-pointer shadow-xs"
                  >
                    Tekrar Dene
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveRepoForReview(null);
                      setReviewResult(null);
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold border border-[#a89997] bg-[#b9aba9]/35 text-[#231c1a] hover:bg-[#b9aba9]/50 transition-all cursor-pointer"
                  >
                    Kapat
                  </button>
                </div>
              </div>
            )}

            {reviewResult && (
              <div className="space-y-4 text-xs leading-relaxed max-h-[70vh] overflow-y-auto pr-1">
                {/* Kalite Skoru ve Mimari Değerlendirme Özeti */}
                <div className="p-4 rounded-xl border border-[#a89997] bg-[#b9aba9]/35 space-y-2 shadow-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/15 inline-block">
                      Mimari Özet
                    </span>
                    {reviewResult.codeQualityScore !== undefined && (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold border border-[#231c1a]/15 bg-[#f9b88e] text-[#231c1a] shadow-xs">
                        Kalite Skoru: {reviewResult.codeQualityScore} / 100
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#231c1a] font-medium leading-relaxed">
                    {reviewResult.architectureOverview}
                  </p>
                </div>

                {/* Güçlü Yönler */}
                {Array.isArray(reviewResult.strengths) && reviewResult.strengths.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-bold text-xs text-[#231c1a] uppercase tracking-wider flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#231c1a]" aria-hidden="true" />
                      <span>Güçlü Yönler</span>
                    </h4>
                    <ul className="space-y-1.5">
                      {reviewResult.strengths.map((str: string, idx: number) => (
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
                )}

                {/* Kritik İyileştirme Alanları & Teknik Borçlar */}
                {reviewResult.technicalDebts && reviewResult.technicalDebts.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-bold text-xs text-[#231c1a] uppercase tracking-wider flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-[#231c1a]" aria-hidden="true" />
                      <span>Teknik Borçlar & Zayıf Yönler</span>
                    </h4>
                    <ul className="space-y-1.5">
                      {reviewResult.technicalDebts.map((debt: string, idx: number) => (
                        <li
                          key={idx}
                          className="p-2.5 rounded-lg border border-[#a89997] bg-[#b9aba9]/30 text-[#4a3e3b] flex items-start gap-2 font-medium"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-[#4a3e3b] mt-1.5 shrink-0" />
                          <span>{debt}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Güvenlik Gözlemleri */}
                {Array.isArray(reviewResult.securityObservations) && reviewResult.securityObservations.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-bold text-xs text-[#231c1a] uppercase tracking-wider flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-[#231c1a]" aria-hidden="true" />
                      <span>Güvenlik Gözlemleri</span>
                    </h4>
                    <ul className="space-y-1.5">
                      {reviewResult.securityObservations.map((sec: string, idx: number) => (
                        <li
                          key={idx}
                          className="p-2.5 rounded-lg border border-[#a89997] bg-[#b9aba9]/30 text-[#4a3e3b] flex items-start gap-2 font-medium"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-[#231c1a] mt-1.5 shrink-0" />
                          <span>{sec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 14 Günlük Mühendislik Aksiyon Planı / Yol Haritası */}
                {reviewResult.recommendedRoadmap && reviewResult.recommendedRoadmap.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-bold text-xs text-[#231c1a] uppercase tracking-wider flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-[#231c1a]" aria-hidden="true" />
                      <span>14 Günlük Mühendislik Aksiyon Planı</span>
                    </h4>
                    <div className="space-y-2">
                      {reviewResult.recommendedRoadmap.map((item, idx: number) => {
                        const priority = item.priority || 'MEDIUM';
                        const priorityBadge =
                          priority === 'HIGH'
                            ? 'bg-[#231c1a] text-[#f9b88e]'
                            : priority === 'MEDIUM'
                              ? 'bg-[#f9b88e] text-[#231c1a]'
                              : 'bg-[#b9aba9] text-[#231c1a]';
                        return (
                          <div
                            key={idx}
                            className="p-3 rounded-xl border border-[#a89997] bg-[#b9aba9]/30 space-y-1 text-[#231c1a] shadow-xs"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-xs flex items-center gap-2">
                                <span className="w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/15">
                                  {idx + 1}
                                </span>
                                <span>{item.title}</span>
                              </span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border border-[#231c1a]/15 ${priorityBadge}`}>
                                {priority}
                              </span>
                            </div>
                            {item.description && (
                              <p className="text-[11px] text-[#4a3e3b] pl-6 font-medium leading-relaxed">
                                {item.description}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

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
                    Kensai Sor
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
