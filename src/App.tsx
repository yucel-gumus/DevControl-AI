import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Sidebar, ActiveTab } from './components/Sidebar.js';
import { Header } from './components/Header.js';
import { OverviewView } from './components/OverviewView.js';
import { HotspotsView } from './components/HotspotsView.js';
import { AskAiView } from './components/AskAiView.js';
import { RepositoriesView } from './components/RepositoriesView.js';
import { ExplainWhyModal, ExplainWhyData } from './components/ExplainWhyModal.js';
import {
  useAuthStatus,
  useRepositories,
  useHealthScore,
  useHotspots,
  useRisks,
  useDailyBrief,
  useActivityData,
  useToggleRepo,
  useSyncRepos,
} from './hooks/useMetrics.js';
import { useAskAi } from './hooks/useAskAi.js';
import { getErrorMessage } from './utils/apiClient.js';
import { trackAction, trackVisit } from './utils/telemetry.js';
import { ACTIVITY_WINDOW_DAYS } from '../server/constants.js';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const queryClient = useQueryClient();

  useEffect(() => {
    trackVisit();
  }, []);

  const handleSelectTab = (nextTab: ActiveTab) => {
    setActiveTab(nextTab);
    trackAction('tab_view', nextTab);
  };

  // Modal State
  const [explainData, setExplainData] = useState<ExplainWhyData | null>(null);
  const [isExplainOpen, setIsExplainOpen] = useState<boolean>(false);

  // Queries
  const authQuery = useAuthStatus();
  const repositoriesQuery = useRepositories();
  const healthQuery = useHealthScore();
  const hotspotsQuery = useHotspots();
  const risksQuery = useRisks();
  const dailyBriefQuery = useDailyBrief();
  // Grafik "Son N Günlük Aktivite" olarak render edilir (N: ACTIVITY_WINDOW_DAYS,
  // başlık da aynı sabiti kullanır); 30 günlük bir pencere isteyip 23 gününü
  // atmak sunucuda boşuna kova/bayt üretirdi.
  const activityQuery = useActivityData(ACTIVITY_WINDOW_DAYS);

  const { data: authData } = authQuery;
  const { data: reposData } = repositoriesQuery;
  const { data: healthScore } = healthQuery;
  const { data: hotspots = [] } = hotspotsQuery;
  const { data: risks = [] } = risksQuery;
  const { data: dailyBrief = [] } = dailyBriefQuery;
  const { data: activityData } = activityQuery;

  // Mutations
  const toggleRepoMutation = useToggleRepo();
  const syncReposMutation = useSyncRepos();

  const user = authData?.user || null;
  const lastSyncAt = authData?.lastSyncAt || reposData?.lastSyncAt || '';
  const repositories = reposData?.repositories || [];
  const rateLimitStatus = authData?.rateLimitStatus || reposData?.rateLimitStatus;
  const isSyncing = syncReposMutation.isPending || toggleRepoMutation.isPending;
  const syncError = authData?.syncError || reposData?.syncError;

  // Okunan sorguların TEK listesi: hata şeridi, ilk yükleme göstergesi ve
  // telemetri yükleme sinyali buradan türetilir. Aynı sorgular üç diziye elle
  // dağıtıldığında, yeni bir sorgu birine eklenip diğerinde unutulur ve
  // sayaçlar yükleme sırasında ölçülmemiş değeri ölçüm gibi gösterirdi.
  const readQueries = [
    authQuery,
    repositoriesQuery,
    healthQuery,
    hotspotsQuery,
    risksQuery,
    dailyBriefQuery,
    activityQuery,
  ] as const;
  const requestErrors = [
    ...readQueries.map((query) => query.error),
    toggleRepoMutation.error,
    syncReposMutation.error,
  ]
    .filter(Boolean)
    .map(getErrorMessage);
  const visibleErrors = Array.from(new Set([syncError, ...requestErrors].filter(Boolean))) as string[];
  const isInitialLoading = readQueries.some((query) => query.isLoading && !query.data);

  // KPI kartlarının ve depo listesinin okuduğu telemetri sorguları.
  //
  // `dailyBrief` ve `activityData` BİLİNÇLİ olarak dışarıdadır: ikisinin de
  // kendi yükleme sinyali vardır (dailyBriefLoading / activityLoading) ve
  // brifing bir yapay zeka zinciridir — soğuk başlangıçta eşitlemeyi bekleyip
  // dakikalarca sürebilir. Onları buraya katmak, brifing üretilirken çoktan
  // bellekte olan ölçümleri "--" / "Ölçüm yükleniyor" diye gösterip ölçülmüş
  // veriyi yokmuş gibi saklardı (bkz. formatMeasuredCount).
  //
  // Sinyal SORGU BAŞINADIR ve her görünüme kendi okuduğu sorguların sinyali
  // verilir: dört sorgunun ortak bir bayrağı, bir sorgu hâlâ uçuşta diye
  // ÖLÇÜLMÜŞ bir değeri "--" gösterirdi (ölçüm dürüstlüğü kuralının ters yönü:
  // ölçülmüş veri ölçümsüz gibi sunulamaz). Ör. yalnızca /api/metrics/health
  // 502 alıp yeniden denenirken hotspot listesi çoktan gelmişse, hotspot
  // sayaçları "--" değil gerçek sayıyı göstermelidir.
  const queryUnmeasured = (query: { isLoading: boolean; data: unknown }): boolean =>
    query.isLoading && !query.data;
  const healthLoading = queryUnmeasured(healthQuery);
  const reposLoading = queryUnmeasured(repositoriesQuery);
  const hotspotsLoading = queryUnmeasured(hotspotsQuery);
  const risksLoading = queryUnmeasured(risksQuery);

  // Ask AI Hook
  const {
    chatMessages,
    isAiLoading,
    activeTrace,
    askAiPrompt,
    chatSessionId,
    setAskAiPrompt,
    handleSendMessage,
    clearChat,
  } = useAskAi();

  const handleToggleSelectRepo = (repoId: string) => {
    toggleRepoMutation.mutate(repoId);
  };

  /**
   * Kenar çubuğu rozetinin sayaçları; ölçülmemiş kaynak `null` olarak geçer.
   *
   * Hata hâlinde React Query'nin `data` alanı boş kalır ve ham dizi `[]` olur:
   * buradan hesaplanan bir sayı, ölçülmemiş bir risk kümesini "0 kritik sorun"
   * diye toplar ve rozeti ölçülmüş gösterir (aynı sayfa "Tespit Edilen Riskler
   * --" derken rozet bir sayı yazardı). Rozet bu yüzden ölçümsüz durumu kendi
   * işaretiyle bildirir (bkz. Sidebar -> countsMeasured).
   */
  const criticalHotspotsCount = hotspotsLoading || hotspotsQuery.error
    ? null
    : hotspots.filter((h) => h.risk_level === 'CRITICAL' || h.risk_level === 'HIGH').length;
  const criticalRisksCount = risksLoading || risksQuery.error
    ? null
    : risks.filter((r) => r.severity === 'CRITICAL' || r.severity === 'HIGH').length;

  /**
   * "Tekrar dene" düğmesinin kilidi YALNIZCA bu düğmenin tetiklediği işi
   * izler (tazelenen sorguların `isFetching`i değil). Neden: hatadan sonraki
   * `retry: 1` denemesi sırasında ilgisiz bir sorgu da uçuşta olur ve
   * `isFetching` tabanlı bir kilit, hata ekranındaki tek elle kurtarma yolunu
   * dakikalarca kapatırdı — kullanıcı düğmeye basamaz, beklemek zorunda kalırdı.
   * Kendi dalgamızın sözü (invalidateQueries, tazelenen sorgular oturana kadar
   * çözülmez) kilidi tam olarak gerektiği sürede tutar; süren bir eşitleme de
   * (kullanıcının az önce başlattığı kurtarma) kilidi hak eder.
   */
  const [isRetryWaveActive, setIsRetryWaveActive] = useState(false);
  const isRetrying = isRetryWaveActive || syncReposMutation.isPending;

  /**
   * "Tekrar dene" YALNIZCA hata veren sorguları tazeler.
   *
   * Önceden anahtarsız `invalidateQueries()` ile koşullu bir eşitleme POST'u
   * çalışıyordu: tek bir başarısız okuma (ör. /api/metrics/hotspots 502) tüm
   * telemetri sorgularını ve türevlerini (persona dahil) yeniden ister, üstüne
   * tam bir GitHub eşitlemesi başlatırdı. Bu dalga sunucuda uçuştaki eşitlemeyi
   * beklediği için kullanıcının beklediği süre dakikalara çıkar; brifing ve
   * persona gibi faturalanan üretimler önbellek ıskasında yeniden üretilirdi.
   * Eşitlemenin kendisi zaten sunucu tarafında yeniden denenir (uç noktalar
   * `getActiveTelemetryContext` üzerinden geçer); kullanıcının AÇIK eşitleme
   * isteği için ayrı bir düğme vardır (bkz. Header -> "Yenile").
   *
   * Hata şeridi üç ayrı kaynaktan beslenir (bkz. visibleErrors); kurtarma da
   * üçünü kapsamazsa düğme şeridi temizleyemez ve ölü kalır:
   *
   *  1. Hata veren sorgular tazelenir.
   *  2. Mutasyon hataları React Query'de yalnızca `reset` ile düşer; yoksa
   *     şeritteki metin (ör. başarısız bir depo seçimi) kalıcı olurdu.
   *  3. Sunucunun yanıtta bildirdiği eşitleme hatası (`syncError`) bir sorgu
   *     hatası DEĞİLDİR: hata veren sorgu yokken 1. adım hiçbir şey yapmaz ve
   *     kullanıcı şeridi kapatamazdı. Kurtarma, eşitlemeyi yeniden başlatmaktır
   *     (Header'daki "Yenile" ile aynı eylem); koşul bu yüzden eşitlemeye özgü
   *     hata sinyalidir, her hatada tam bir GitHub eşitlemesi değil.
   */
  const handleRetry = () => {
    setIsRetryWaveActive(true);
    void queryClient
      .invalidateQueries({
        predicate: (query) => query.state.status === 'error',
      })
      .finally(() => setIsRetryWaveActive(false));
    // Yalnızca YERLEŞMİŞ bir hata temizlenir: `reset()` gözlemciyi mutasyondan
    // kopartır, uçuştaki bir seçim değişikliğine uygulanırsa istek sunucuda
    // sürerken düğme "Kaydediliyor..." durumundan çıkar ve isteğin sonucu
    // (özellikle hatası) hiçbir yüzeyde görünmez — kullanıcı seçiminin
    // uygulandığını sanar. `error` yalnızca mutasyon oturduğunda doludur.
    if (toggleRepoMutation.error) {
      toggleRepoMutation.reset();
    }
    // Eşitleme tarafında bir başarısızlık sinyali varsa (sunucunun bildirdiği
    // `syncError` ya da istemcinin kendi eşitleme isteğinin hatası) kurtarma,
    // eşitlemeyi yeniden başlatmaktır; `mutate` aynı zamanda mutasyonun hata
    // durumunu da tazeler. Sinyal yokken istek başlatılmaz: her okuma hatasında
    // tam bir GitHub eşitlemesini tetiklemek dakikalarca sürer ve hatayla
    // ilgisiz olurdu (bkz. yukarıdaki eski `invalidateQueries()` notu).
    // `authenticated` koşulu: token yokken eşitleme zaten yapılamaz (sunucu
    // 409 döner), istek atmanın anlamı yoktur.
    if (
      authData?.authenticated &&
      (syncError || syncReposMutation.error) &&
      !syncReposMutation.isPending
    ) {
      syncReposMutation.mutate();
    }
  };

  const handleOpenExplain = (data: ExplainWhyData) => {
    setExplainData(data);
    setIsExplainOpen(true);
  };

  const handleAskAboutRepo = (repoName: string) => {
    setAskAiPrompt(`"${repoName}" deposunun mimari durumunu, son commitlerini ve risklerini analiz et.`);
    setActiveTab('ask');
  };

  const handleAskAboutFile = (filePath: string, repoName: string) => {
    setAskAiPrompt(`"${filePath}" (${repoName}) dosyasındaki yüksek kod değişiminin ve bakım riskinin nedenlerini açıkla, somut adımlar öner.`);
    setActiveTab('ask');
  };

  const getTabTitle = () => {
    switch (activeTab) {
      case 'overview':
        return 'Mühendislik Zekası Genel Bakış';
      case 'hotspots':
        return 'Kritik Dosyalar ve Mimari Riskler';
      case 'ask':
        return 'KENSAI — Yapay Zeka Mühendislik Analisti';
      case 'repositories':
        return 'Kişisel Depolar';
    }
  };

  const getTabSubtitle = () => {
    switch (activeTab) {
      case 'overview':
        return 'Kod sağlığı, günün bülteni ve aktivite telemetrisi';
      case 'hotspots':
        return 'Yüksek oynaklıktaki kaynak kodlar ve tespit edilen darboğazlar';
      case 'ask':
        return 'Gemini otonom sorgu planlayıcısı ve araç motoru';
      case 'repositories':
        return 'Kişisel GitHub depolarınızı ve kod tabanlarınızı inceleyin';
    }
  };

  return (
    <div
      className="flex h-screen font-sans antialiased overflow-hidden bg-[#EDF3EE] text-[#253341]"
    >
      <Sidebar
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        user={user}
        authenticated={Boolean(authData?.authenticated)}
        hotspotsCount={criticalHotspotsCount}
        risksCount={criticalRisksCount}
      />

      <div className="flex-1 flex flex-col h-screen overflow-hidden relative bg-gradient-to-b from-[#EDF3EE] via-[#DBE6DD]/60 to-[#DCE3EA]/50">
        <Header
          title={getTabTitle()}
          subtitle={getTabSubtitle()}
          healthScore={healthScore || null}
          lastSyncAt={lastSyncAt}
          onSync={() => {
            trackAction('repo_sync');
            syncReposMutation.mutate();
          }}
          isSyncing={isSyncing}
          onOpenAskAi={() => {
            const next = activeTab === 'ask' ? 'overview' : 'ask';
            handleSelectTab(next);
          }}
          isAskAiActive={activeTab === 'ask'}
          rateLimitStatus={rateLimitStatus}
          isCachedFromDb={Boolean(reposData?.isCachedFromDb || authData?.isCachedFromDb)}
        />

        <main className="flex-1 overflow-y-auto px-6 py-6 lg:px-8 lg:py-7">
          <div className="max-w-7xl mx-auto space-y-6">
            {isInitialLoading && (
              <div
                className="rounded-xl border border-[#BCC7D2] bg-[#DCE3EA] px-4 py-3 text-xs font-semibold text-[#253341] flex items-center gap-2.5 shadow-xs"
                role="status"
                aria-live="polite"
              >
                <div className="w-2 h-2 rounded-full bg-[#EC7D55] animate-ping shrink-0" />
                <span>GitHub telemetrisi ve mühendislik göstergeleri yükleniyor...</span>
              </div>
            )}

            {visibleErrors.length > 0 && (
              <div
                className="rounded-xl border border-[#AB421C] bg-[#DCE3EA] px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs"
                role="alert"
                aria-live="assertive"
              >
                <div className="text-xs font-semibold text-[#AB421C]">
                  <p>{visibleErrors[0]}</p>
                  {visibleErrors.length > 1 && (
                    <p className="text-[11px] mt-1 text-[#3E5164]">
                      Ayrıca {visibleErrors.length - 1} veri isteği daha tamamlanamadı.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleRetry}
                  disabled={isRetrying}
                  className="shrink-0 px-3 py-1.5 rounded-lg border border-[#AB421C] bg-[#EC7D55] text-[#253341] hover:bg-[#AB421C] hover:text-[#F5F9F5] text-xs font-bold transition-colors cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isRetrying ? 'Deneniyor...' : 'Tekrar dene'}
                </button>
              </div>
            )}

            {activeTab === 'overview' && (
              <OverviewView
                repositories={repositories}
                healthScore={healthScore || null}
                risks={risks}
                hotspots={hotspots}
                dailyBrief={dailyBrief}
                activityData={activityData}
                dailyBriefLoading={dailyBriefQuery.isLoading}
                dailyBriefError={dailyBriefQuery.error ? getErrorMessage(dailyBriefQuery.error) : null}
                activityLoading={activityQuery.isLoading}
                activityError={activityQuery.error ? getErrorMessage(activityQuery.error) : null}
                healthError={healthQuery.error ? getErrorMessage(healthQuery.error) : null}
                hotspotsError={hotspotsQuery.error ? getErrorMessage(hotspotsQuery.error) : null}
                risksError={risksQuery.error ? getErrorMessage(risksQuery.error) : null}
                reposError={repositoriesQuery.error ? getErrorMessage(repositoriesQuery.error) : null}
                healthLoading={healthLoading}
                reposLoading={reposLoading}
                hotspotsLoading={hotspotsLoading}
                risksLoading={risksLoading}
                onExplainWhy={handleOpenExplain}
                onSelectRepo={(repo) => handleAskAboutRepo(repo.name)}
                onNavigateToTab={setActiveTab}
              />
            )}

            {activeTab === 'hotspots' && (
              <HotspotsView
                hotspots={hotspots}
                risks={risks}
                healthScore={healthScore || null}
                risksError={risksQuery.error ? getErrorMessage(risksQuery.error) : null}
                hotspotsError={hotspotsQuery.error ? getErrorMessage(hotspotsQuery.error) : null}
                hotspotsLoading={hotspotsLoading}
                risksLoading={risksLoading}
                onExplainWhy={handleOpenExplain}
                onAskAboutFile={handleAskAboutFile}
              />
            )}

            {activeTab === 'ask' && (
              <AskAiView
                // Sohbet temizlendiğinde bileşen yeniden bağlanır: mesajları
                // sıfırlamak bileşenin yerel durumunu (giriş kutusundaki yazı)
                // sıfırlamaz (bkz. useAskAi -> chatSessionId).
                key={chatSessionId}
                messages={chatMessages}
                onSendMessage={handleSendMessage}
                isLoading={isAiLoading}
                activeTrace={activeTrace}
                defaultPrompt={askAiPrompt}
                onClearChat={clearChat}
              />
            )}

            {activeTab === 'repositories' && (
              <RepositoriesView
                repositories={repositories}
                user={user}
                onToggleRepo={handleToggleSelectRepo}
                onAskAboutRepo={handleAskAboutRepo}
                pendingRepoId={
                  toggleRepoMutation.isPending && toggleRepoMutation.variables !== undefined
                    ? String(toggleRepoMutation.variables)
                    : null
                }
                reposError={repositoriesQuery.error ? getErrorMessage(repositoriesQuery.error) : null}
                telemetryLoading={reposLoading}
              />
            )}

            {/* Alt Bilgi (Footer) - Geliştirici & Referans Bağlantısı */}
            <footer className="pt-6 pb-4 mt-6 border-t border-[#BCC7D2] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#3E5164]">
              <div className="flex items-center gap-2">
                <span className="font-bold text-[#253341]">DevControl AI</span>
                <span className="text-[#3E5164]">·</span>
                <span>Mühendislik Zekası ve Kişisel GitHub Telemetri Platformu</span>
              </div>
              <div className="flex items-center gap-2">
                <span>Geliştirici:</span>
                <a
                  href="https://yucelgumus.dev/"
                  target="_blank"
                  rel="noopener noreferrer author external"
                  title="Yücel Gümüş Kişisel Web Sitesi"
                  className="font-bold inline-flex items-center gap-1.5 bg-[#EC7D55] text-[#253341] hover:bg-[#AB421C] hover:text-[#F5F9F5] px-2.5 py-1 rounded-lg border border-[#AB421C] shadow-xs transition-colors"
                >
                  <span>Yücel Gümüş</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </footer>
          </div>
        </main>
      </div>

      <ExplainWhyModal
        isOpen={isExplainOpen}
        onClose={() => setIsExplainOpen(false)}
        data={explainData}
      />
    </div>
  );
}
