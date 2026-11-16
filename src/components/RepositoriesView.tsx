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
import { formatDate, formatMeasuredCount } from '../utils/formatters.js';
import { useRepoReview, REPO_REVIEW_MUTATION_KEY } from '../hooks/useMetrics.js';
import { useModalA11y } from '../hooks/useModalA11y.js';
import { getSeverityBadgeClass } from '../theme.js';
import { useIsMutating } from '@tanstack/react-query';

interface Props {
  repositories: Repository[];
  user: GitHubUser | null;
  onToggleRepo: (repoId: string) => void;
  onAskAboutRepo: (repoName: string) => void;
  /**
   * Seçimi değiştirilmekte olan deponun kimliği (istek sürerken). Yalnızca o
   * deponun düğmesi kapatılır: istek tamamlanana kadar aynı depoya ikinci kez
   * basmak, sunucuda sıraya girmiş iki seçim değişikliği (ve iki eşitleme
   * turu) üretirdi.
   */
  pendingRepoId?: string | null;
  /** Depo listesi isteği başarısızsa hata metni; "depo yok" sonucundan ayrılır. */
  reposError?: string | null;
  /**
   * Depo listesi ilk kez yükleniyor mu? Yüklenirken sayaçlar "0" yerine "--"
   * gösterir: yazılan bir sıfır ölçülmüş sonuç gibi okunurdu ("depo yok").
   * Bayrak Depo listesi isteğine ÖZELDİR: başka bir telemetri sorgusu hâlâ
   * uçuşta diye ölçülmüş bir sayı "--" gösterilemez (bkz. App.tsx ->
   * queryUnmeasured).
   */
  telemetryLoading?: boolean;
}

export const RepositoriesView: React.FC<Props> = ({
  repositories = [],
  user,
  onToggleRepo,
  onAskAboutRepo,
  pendingRepoId = null,
  reposError = null,
  telemetryLoading = false,
}) => {
  const [search, setSearch] = useState('');
  const [filterLang, setFilterLang] = useState<string>('ALL');

  // KENSAI İnceleme Modalı Durumu
  const [activeRepoForReview, setActiveRepoForReview] = useState<Repository | null>(null);
  /**
   * İnceleme isteğinin sıra numarası. Depo adına bakan bir koruma yetmez: aynı
   * depo için ikinci bir istek başlatıldığında (modalı kapatıp yeniden açmak
   * dahil) geç gelen eski yanıt da adı eşleştirip taze sonucun üzerine yazardı.
   * Yalnızca **en son** isteğin yanıtı ekrana yazılır.
   */
  const reviewRequestRef = useRef(0);
  const [reviewResult, setReviewResult] = useState<RepoAiReview | null>(null);
  const repoReviewMutation = useRepoReview();

  /**
   * Son inceleme isteğinin `force` niyeti. Hata sonrası "Tekrar Dene"
   * düğmesi AYNI isteği yinelemelidir: force'suz bir deneme sunucuda 7
   * günlük önbelleğe düşer (bkz. server/routes/ai.ts -> /repo-review) ve
   * kullanıcı "Yeniden Üret" istemişken bayat raporu taze sanır — üstelik
   * rapor anında döndüğü için hata da görünmez.
   */
  const lastReviewForceRef = useRef(false);

  /**
   * Uçuştaki inceleme KÜRESEL olarak okunur (bu bileşenin kancasından değil):
   * inceleme sürerken sekme değiştirilirse bileşen sökülür, yerel `isPending`
   * sıfırlanır ve dönüldüğünde aynı depo için ikinci bir faturalanan yapay zeka
   * üretimi başlatılabilirdi. `mutationKey` sayesinde uçuştaki istek sorgu
   * istemcisinde görünür kalır (bkz. useMetrics).
   */
  const isReviewInFlight = useIsMutating({ mutationKey: REPO_REVIEW_MUTATION_KEY }) > 0;

  /**
   * Depo incelemesini başlatır.
   *
   * `force` sunucunun 7 günlük inceleme önbelleğini atlar ve raporu güncel
   * telemetriden yeniden üretir (bkz. server/routes/ai.ts -> /repo-review):
   * mimarisi değişmiş bir depo için önbellekteki eski raporu "taze" gibi
   * okumayı önleyen tek yol budur.
   */
  const handleTriggerReview = async (repo: Repository, force = false) => {
    // Uçuşta bir inceleme varken ikinci kez tetiklemek sunucuda ikinci bir
    // yapay zeka üretimi (faturalanan çağrı) başlatır; istek yok sayılır.
    if (isReviewInFlight) return;
    const requestId = ++reviewRequestRef.current;
    lastReviewForceRef.current = force;
    setActiveRepoForReview(repo);
    setReviewResult(null);
    try {
      const res = await repoReviewMutation.mutateAsync({ repoName: repo.name, force });
      if (reviewRequestRef.current === requestId) {
        setReviewResult(res);
      }
    } catch (err) {
      if (reviewRequestRef.current === requestId) {
        console.error('İnceleme alınamadı:', err);
      }
    }
  };

  const closeReviewModal = () => {
    // Sayaç ilerletilir: uçuştaki yanıt artık güncel sayılmaz ve kapatılan
    // modala yazmaz.
    reviewRequestRef.current += 1;
    setActiveRepoForReview(null);
    setReviewResult(null);
  };
  const reviewDialogRef = useModalA11y(Boolean(activeRepoForReview), closeReviewModal);

  const safeRepos = Array.isArray(repositories) ? repositories : [];

  /**
   * Ölçülmemiş bir sayı "0" olarak yazılmaz: istek sürerken ya da
   * başarısızken yazılan sıfır, "depo yok" diye okunur (bkz. boş liste metni).
   * Kural tek kaynakta (bkz. formatters.formatMeasuredCount).
   */
  const measuredCount = (count: number): string =>
    formatMeasuredCount(count, reposError, telemetryLoading);

  /**
   * Boş liste metni. Dört durum dört ayrı cümledir: ölçüm alınamadı, ölçüm
   * sürüyor, ölçüldü-ve-hesapta depo yok, ölçüldü-ve-arama eşleşmedi. Bunları
   * birbirine karıştırmak, ölçülmemiş bir sonucu ölçüm gibi sunar.
   */
  const reposEmptyMessage = reposError
    ? `Depo listesi alınamadı: ${reposError} Bu bir "depo yok" sonucu değildir.`
    : telemetryLoading
      ? 'Depo listesi yükleniyor; sonuçlar alındığında burada listelenecek.'
      : safeRepos.length === 0
        ? 'Analiz edilecek depo bulunmuyor. Depolar GitHub hesabınızdan gelir; liste boşsa başlıktaki "Yenile" düğmesiyle telemetriyi yeniden çekin.'
        : 'Aramanızla eşleşen depo bulunamadı.';

  // Türev listeler memoize edilir: arama kutusuna yazılan her karakter App'i
  // yeniden render eder ve memoizasyon olmadan dil listesi yeniden kurulur,
  // 150 depoların adı/açıklaması `toLowerCase()` ile baştan taranırdı. Arama
  // terimi döngü DIŞINDA bir kez küçük harfe çevrilir (aynı dönüşüm her depo
  // için yeniden yapılırdı).
  const normalizedSearch = search.trim().toLowerCase();

  const languages = React.useMemo(
    () => Array.from(new Set(safeRepos.map((r) => r.language).filter(Boolean))) as string[],
    [safeRepos],
  );

  const filteredRepos = React.useMemo(
    () =>
      safeRepos.filter((r) => {
        const matchesSearch =
          normalizedSearch.length === 0 ||
          r.name.toLowerCase().includes(normalizedSearch) ||
          (r.description ? r.description.toLowerCase().includes(normalizedSearch) : false);
        const matchesLang = filterLang === 'ALL' || r.language === filterLang;
        return matchesSearch && matchesLang;
      }),
    [safeRepos, normalizedSearch, filterLang],
  );

  const selectedReposCount = React.useMemo(
    () => safeRepos.filter((r) => r.selected_for_analysis).length,
    [safeRepos],
  );

  return (
    <div id="repositories-view" className="space-y-6 font-sans text-[#253341]">
      {/* Üst Bilgi ve Kullanıcı Kartı */}
      <div className="p-5 rounded-xl border border-[#BCC7D2] bg-[#DCE3EA] flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-4">
          {user?.avatar_url ? (
            <img
              src={user.avatar_url}
              alt={user.name}
              className="w-12 h-12 rounded-xl border border-[#BCC7D2] object-cover shadow-xs"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-[#EC7D55] text-[#253341] border border-[#AB421C] flex items-center justify-center font-bold text-sm shadow-xs">
              GH
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-[#253341] tracking-tight">
                {user?.name || user?.login || 'Kişisel GitHub Hesabı'}
              </h2>
              {user?.login && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#F2A488] text-[#253341] border border-[#EC7D55] font-bold">
                  @{user.login}
                </span>
              )}
            </div>
            <p className="text-xs text-[#3E5164] mt-0.5 font-medium">
              Yalnızca size ait kişisel GitHub depoları analiz edilmektedir.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-xs text-[#3E5164] block font-bold">Toplam Depo</span>
            <span className="text-sm font-bold text-[#253341]">{measuredCount(safeRepos.length)}</span>
          </div>
          <div className="w-px h-6 bg-[#BCC7D2]" />
          <div className="text-right">
            <span className="text-xs text-[#3E5164] block font-bold">Analiz Edilen</span>
            <span className="text-sm font-bold text-[#253341]">
              {measuredCount(selectedReposCount)}
            </span>
          </div>
        </div>
      </div>

      {/* Arama ve Dil Filtreleme Çubuğu */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Arama Kutusu */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#3E5164]" />
          <input
            type="text"
            placeholder="Depo adı veya açıklamaya göre ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-[#BCC7D2] bg-[#F5F9F5] text-xs text-[#253341] placeholder-[#3E5164] focus:outline-none focus:border-[#EC7D55] focus:ring-1 focus:ring-[#EC7D55] transition-colors"
          />
        </div>

        {/* Dil Filtresi Hapları */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {/* `aria-pressed`: etkin filtre yalnızca renkle ayırt ediliyor; ekran
              okuyucu için seçili durumu bildiren tek kanal bu özniteliktir. */}
          <button
            type="button"
            aria-pressed={filterLang === 'ALL'}
            onClick={() => setFilterLang('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${filterLang === 'ALL'
              ? 'bg-[#EC7D55] text-[#253341] border border-[#AB421C] ring-1 ring-[#EC7D55] shadow-xs'
              : 'border border-[#BCC7D2] bg-[#EDF3EE] text-[#3E5164] hover:text-[#253341] hover:bg-[#DBE6DD]'
              }`}
          >
            Tümü ({measuredCount(safeRepos.length)})
          </button>
          {languages.map((lang) => (
            <button
              key={lang}
              type="button"
              aria-pressed={filterLang === lang}
              onClick={() => setFilterLang(lang)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${filterLang === lang
                ? 'bg-[#EC7D55] text-[#253341] border border-[#AB421C] ring-1 ring-[#EC7D55] shadow-xs'
                : 'border border-[#BCC7D2] bg-[#EDF3EE] text-[#3E5164] hover:text-[#253341] hover:bg-[#DBE6DD]'
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
          <div className="col-span-full p-8 rounded-xl border border-[#BCC7D2] bg-[#DCE3EA] text-center text-xs text-[#3E5164]">
            {/* Başarısız bir istek "depo yok" olarak gösterilmez: liste hiç
                gelmediyse bu bir ölçümsüz durumdur, hesabın deposuz olduğu
                değil (bkz. HotspotsView/OverviewView'daki aynı ayrım). Süren
                bir istek için de aynısı geçerlidir. */}
            {reposEmptyMessage}
          </div>
        ) : (
          filteredRepos.map((repo) => {
            const isSelected = repo.selected_for_analysis;
            return (
              <div
                key={repo.id}
                className={`p-4 rounded-xl border transition-colors flex flex-col justify-between gap-3 shadow-xs ${isSelected
                  ? 'border-[#EC7D55] bg-[#DCE3EA]'
                  : 'border-[#BCC7D2] bg-[#DCE3EA] hover:bg-[#DBE6DD]'
                  }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {repo.is_private ? (
                        <Lock className="w-3.5 h-3.5 text-[#3E5164] shrink-0" />
                      ) : (
                        <Globe className="w-3.5 h-3.5 text-[#3E5164] shrink-0" />
                      )}
                      <span className="font-bold text-xs text-[#253341] truncate">
                        {repo.name}
                      </span>
                    </div>

                    <a
                      href={repo.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 rounded text-[#AB421C] hover:text-[#253341] transition-colors shrink-0"
                      title="GitHub'da aç"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>

                  <p className="text-xs text-[#3E5164] line-clamp-2 leading-relaxed font-medium">
                    {repo.description || 'Açıklama bulunmuyor.'}
                  </p>

                  {/* CI/CD, Sürüm ve Dal Rozetleri */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {repo.latest_ci_run ? (
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded border flex items-center gap-1 ${repo.latest_ci_run.conclusion === 'success'
                          ? 'bg-[#DBE6DD] text-[#253341] border-[#BCC7D2]'
                          : repo.latest_ci_run.conclusion === 'failure'
                            ? 'bg-[#AB421C] text-[#F5F9F5] border-[#AB421C]'
                            : 'bg-[#F2A488] text-[#253341] border-[#EC7D55]'
                          }`}
                        title={`En son CI workflow: ${repo.latest_ci_run.name} (${repo.latest_ci_run.conclusion || repo.latest_ci_run.status})`}
                      >
                        <ShieldCheck className="w-3 h-3 shrink-0" />
                        <span>CI: {repo.latest_ci_run.conclusion === 'success' ? 'Geçti' : repo.latest_ci_run.conclusion === 'failure' ? 'Hata' : repo.latest_ci_run.status}</span>
                      </span>
                    ) : null}

                    {repo.latest_release ? (
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded border border-[#BCC7D2] bg-[#EDF3EE] text-[#253341] flex items-center gap-1"
                        title={`Son yayınlanan sürüm: ${repo.latest_release.tag_name} (${repo.latest_release.published_at.slice(0, 10)})`}
                      >
                        <Tag className="w-3 h-3 shrink-0 text-[#253341]" />
                        <span>{repo.latest_release.tag_name}</span>
                      </span>
                    ) : null}

                    {repo.branches_count && repo.branches_count > 1 ? (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-[#BCC7D2] bg-[#EDF3EE] text-[#3E5164]">
                        {repo.branches_count} dal
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-3 pt-2 border-t border-[#BCC7D2]">
                  <div className="flex items-center justify-between text-[11px] text-[#3E5164]">
                    <span className="font-bold truncate max-w-[140px]" title={repo.languages ? Object.keys(repo.languages).join(', ') : repo.language}>
                      {repo.language || 'Belirtilmemiş'}
                      {repo.languages && Object.keys(repo.languages).length > 1 ? ` (+${Object.keys(repo.languages).length - 1})` : ''}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 font-medium">
                        <Star className="w-3 h-3 text-[#253341]" />
                        <span>{repo.stargazers_count || 0} Star</span>
                      </span>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1 font-medium">
                        <GitFork className="w-3 h-3 text-[#253341]" />
                        <span>{repo.forks_count || 0} Fork</span>
                      </span>
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onToggleRepo(String(repo.id))}
                      disabled={pendingRepoId === String(repo.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-wait ${isSelected
                        ? 'bg-[#F2A488] text-[#253341] border border-[#EC7D55] hover:bg-[#EC7D55] shadow-xs'
                        : 'border border-[#BCC7D2] bg-[#EDF3EE] text-[#3E5164] hover:text-[#253341] hover:bg-[#DBE6DD]'
                        }`}
                    >
                      {pendingRepoId === String(repo.id)
                        ? 'Kaydediliyor...'
                        : isSelected
                          ? 'Analizde Dahil'
                          : 'Analize Ekle'}
                    </button>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleTriggerReview(repo)}
                        disabled={isReviewInFlight}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-[#EC7D55] text-[#253341] border border-[#AB421C] hover:bg-[#AB421C] hover:text-[#F5F9F5] transition-colors cursor-pointer shadow-xs flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                        title={
                          isReviewInFlight
                            ? 'Bir inceleme sürüyor; tamamlanınca yeniden deneyebilirsiniz'
                            : 'Gemini ile kapsamlı depo incelemesi'
                        }
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>İncele</span>
                      </button>

                      <button
                        onClick={() => onAskAboutRepo(repo.name)}
                        title="Depo hakkında yapay zeka analistine soru sor"
                        className="px-2.5 py-1.5 rounded-lg text-xs font-bold border border-[#BCC7D2] bg-[#EDF3EE] text-[#253341] hover:bg-[#DBE6DD] transition-colors cursor-pointer shadow-xs"
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
        <div
          ref={reviewDialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="repo-review-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#253341]/45 backdrop-blur-sm overflow-y-auto font-sans focus:outline-none"
        >
          <div className="w-full max-w-2xl p-6 rounded-2xl border border-[#BCC7D2] bg-[#DCE3EA] space-y-5 shadow-2xl animate-in zoom-in-95 my-8 text-[#253341]">
            {/* Modal Başlığı */}
            <div className="flex items-center justify-between border-b border-[#BCC7D2] pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[#EC7D55] border border-[#AB421C] text-[#253341] shadow-xs">
                  <Brain className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="repo-review-title" className="text-sm font-bold text-[#253341]">
                    {activeRepoForReview.name} — Kensai Mimari İnceleme
                  </h3>
                  <span className="text-[11px] text-[#3E5164] block mt-0.5 font-medium">
                    Otomatik kod kalitesi ve sağlık değerlendirmesi
                  </span>
                </div>
              </div>

              <button
                onClick={closeReviewModal}
                aria-label="İnceleme penceresini kapat"
                className="p-1.5 rounded-lg border border-[#AB421C] bg-[#EC7D55] text-[#253341] hover:bg-[#AB421C] hover:text-[#F5F9F5] cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {/* Yükleniyor Durumu */}
            {repoReviewMutation.isPending && !reviewResult && (
              <div className="py-12 text-center space-y-3">
                <div className="inline-block animate-spin p-3 rounded-full border-2 border-dashed border-[#253341] text-[#253341]">
                  <Sparkles className="w-6 h-6" />
                </div>
                <p className="text-sm font-bold text-[#253341]">
                  KENSAI depo telemetrisini ve commit geçmişini inceliyor...
                </p>
                <p className="text-xs text-[#3E5164]">
                  Mimari güçlü yönler, teknik borçlar ve önceliklendirilmiş aksiyon planı sentezleniyor
                </p>
              </div>
            )}

            {/* Hata Durumu */}
            {repoReviewMutation.isError && !reviewResult && (
              <div className="py-8 text-center space-y-3">
                <div className="p-3 rounded-full bg-[#AB421C] border border-[#AB421C] inline-flex text-[#F5F9F5]">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <p className="text-xs font-bold text-[#AB421C]">
                  {repoReviewMutation.error?.message || 'İnceleme raporu alınırken bir hata oluştu.'}
                </p>
                <div className="flex justify-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => handleTriggerReview(activeRepoForReview, lastReviewForceRef.current)}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#EC7D55] text-[#253341] border border-[#AB421C] hover:bg-[#AB421C] hover:text-[#F5F9F5] transition-colors cursor-pointer shadow-xs"
                  >
                    Tekrar Dene
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveRepoForReview(null);
                      setReviewResult(null);
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold border border-[#BCC7D2] bg-[#EDF3EE] text-[#253341] hover:bg-[#DBE6DD] transition-colors cursor-pointer"
                  >
                    Kapat
                  </button>
                </div>
              </div>
            )}

            {reviewResult && (
              <div className="space-y-4 text-xs leading-relaxed max-h-[70vh] overflow-y-auto pr-1">
                {/* Kalite Skoru ve Mimari Değerlendirme Özeti */}
                <div className="p-4 rounded-xl border border-[#BCC7D2] bg-[#EDF3EE] space-y-2 shadow-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[#DBE6DD] text-[#253341] border border-[#BCC7D2] inline-block">
                      Mimari Özet
                    </span>
                    {reviewResult.codeQualityScore !== undefined && (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold border border-[#EC7D55] bg-[#F2A488] text-[#253341] shadow-xs">
                        Kalite Skoru: {reviewResult.codeQualityScore} / 100
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#253341] font-medium leading-relaxed">
                    {reviewResult.architectureOverview}
                  </p>
                  {/* Raporun yaşı gösterilir: sunucu taze incelemeyi 7 güne kadar
                      önbellekten servis eder (bkz. FirestoreService.REVIEW_TTL_MS),
                      tarih yazılmazsa günler önce üretilmiş bir rapor güncel
                      sanılırdı. Yeniden üretme yolu da bu satırda anılır. */}
                  <p className="text-[10px] text-[#3E5164] font-medium pt-1 border-t border-[#BCC7D2]">
                    İnceleme tarihi: {formatDate(reviewResult.reviewedAt) || 'bilinmiyor'} · Rapor 7 gün boyunca önbellekten servis edilir; güncel telemetriyle yeniden üretmek için "Yeniden Üret" düğmesini kullanın.
                  </p>
                </div>

                {/* Güçlü Yönler */}
                {Array.isArray(reviewResult.strengths) && reviewResult.strengths.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-bold text-xs text-[#253341] uppercase tracking-wider flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#253341]" aria-hidden="true" />
                      <span>Güçlü Yönler</span>
                    </h4>
                    <ul className="space-y-1.5">
                      {reviewResult.strengths.map((str: string, idx: number) => (
                        <li
                          key={idx}
                          className="p-2.5 rounded-lg border border-[#BCC7D2] bg-[#EDF3EE] text-[#3E5164] flex items-start gap-2 font-medium"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-[#253341] mt-1.5 shrink-0" />
                          <span>{str}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Kritik İyileştirme Alanları & Teknik Borçlar */}
                {reviewResult.technicalDebts && reviewResult.technicalDebts.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-bold text-xs text-[#253341] uppercase tracking-wider flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-[#AB421C]" aria-hidden="true" />
                      <span>Teknik Borçlar & Zayıf Yönler</span>
                    </h4>
                    <ul className="space-y-1.5">
                      {reviewResult.technicalDebts.map((debt: string, idx: number) => (
                        <li
                          key={idx}
                          className="p-2.5 rounded-lg border border-[#BCC7D2] bg-[#EDF3EE] text-[#3E5164] flex items-start gap-2 font-medium"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-[#AB421C] mt-1.5 shrink-0" />
                          <span>{debt}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Güvenlik Gözlemleri */}
                {Array.isArray(reviewResult.securityObservations) && reviewResult.securityObservations.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-bold text-xs text-[#253341] uppercase tracking-wider flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-[#253341]" aria-hidden="true" />
                      <span>Güvenlik Gözlemleri</span>
                    </h4>
                    <ul className="space-y-1.5">
                      {reviewResult.securityObservations.map((sec: string, idx: number) => (
                        <li
                          key={idx}
                          className="p-2.5 rounded-lg border border-[#BCC7D2] bg-[#EDF3EE] text-[#3E5164] flex items-start gap-2 font-medium"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-[#3E5164] mt-1.5 shrink-0" />
                          <span>{sec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Önceliklendirilmiş Mühendislik Aksiyon Planı: model yalnızca
                    başlık/açıklama/öncelik üretir (bkz. RepoAiReview.recommendedRoadmap),
                    gün bazlı bir takvim değildir. */}
                {reviewResult.recommendedRoadmap && reviewResult.recommendedRoadmap.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-bold text-xs text-[#253341] uppercase tracking-wider flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-[#253341]" aria-hidden="true" />
                      <span>Önceliklendirilmiş Mühendislik Aksiyon Planı</span>
                    </h4>
                    <div className="space-y-2">
                      {reviewResult.recommendedRoadmap.map((item, idx: number) => {
                        const priority = item.priority || 'MEDIUM';
                        return (
                          <div
                            key={idx}
                            className="p-3 rounded-xl border border-[#BCC7D2] bg-[#EDF3EE] space-y-1 text-[#253341] shadow-xs"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-xs flex items-center gap-2">
                                <span className="w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 bg-[#F2A488] text-[#253341] border border-[#EC7D55]">
                                  {idx + 1}
                                </span>
                                <span>{item.title}</span>
                              </span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${getSeverityBadgeClass(priority)}`}>
                                {priority}
                              </span>
                            </div>
                            {item.description && (
                              <p className="text-[11px] text-[#3E5164] pl-6 font-medium leading-relaxed">
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
                <div className="pt-3 border-t border-[#BCC7D2] flex justify-end gap-2">
                  <button
                    onClick={() => handleTriggerReview(activeRepoForReview, true)}
                    disabled={isReviewInFlight}
                    className="px-3 py-2 rounded-lg text-xs font-bold border border-[#BCC7D2] bg-[#EDF3EE] text-[#253341] hover:bg-[#DBE6DD] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  >
                    Yeniden Üret
                  </button>
                  <button
                    onClick={() => {
                      onAskAboutRepo(activeRepoForReview.name);
                      setActiveRepoForReview(null);
                      setReviewResult(null);
                    }}
                    className="px-3.5 py-2 rounded-lg text-xs font-bold bg-[#EC7D55] text-[#253341] hover:bg-[#AB421C] hover:text-[#F5F9F5] transition-colors cursor-pointer border border-[#AB421C] shadow-xs"
                  >
                    Kensai Sor
                  </button>
                  <button
                    onClick={() => {
                      setActiveRepoForReview(null);
                      setReviewResult(null);
                    }}
                    className="px-3 py-2 rounded-lg text-xs font-bold border border-[#BCC7D2] bg-[#EDF3EE] text-[#253341] hover:bg-[#DBE6DD] transition-colors cursor-pointer"
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
