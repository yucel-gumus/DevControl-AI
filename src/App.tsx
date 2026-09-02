import React, { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Sidebar, ActiveTab } from './components/Sidebar.js';
import { Header } from './components/Header.js';
import { OverviewView } from './components/OverviewView.js';
import { HotspotsView } from './components/HotspotsView.js';
import { AskAiView } from './components/AskAiView.js';
import { RepositoriesView } from './components/RepositoriesView.js';
import { ExplainWhyModal, ExplainWhyData } from './components/ExplainWhyModal.js';
import { Repository } from './types.js';
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

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const queryClient = useQueryClient();

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
  const activityQuery = useActivityData(30);

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

  const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return 'İstek işlenirken beklenmeyen bir hata oluştu.';
  };

  const requestErrors = [
    authQuery.error,
    repositoriesQuery.error,
    healthQuery.error,
    hotspotsQuery.error,
    risksQuery.error,
    dailyBriefQuery.error,
    activityQuery.error,
    toggleRepoMutation.error,
    syncReposMutation.error,
  ]
    .filter(Boolean)
    .map(getErrorMessage);
  const visibleErrors = Array.from(new Set([syncError, ...requestErrors].filter(Boolean))) as string[];
  const isInitialLoading = [
    authQuery,
    repositoriesQuery,
    healthQuery,
    hotspotsQuery,
    risksQuery,
    dailyBriefQuery,
    activityQuery,
  ].some((query) => query.isLoading && !query.data);

  // Ask AI Hook
  const {
    chatMessages,
    isAiLoading,
    activeTrace,
    askAiPrompt,
    setAskAiPrompt,
    handleSendMessage,
  } = useAskAi();

  const handleToggleSelectRepo = (repoId: string) => {
    toggleRepoMutation.mutate(repoId);
  };

  const handleRetry = () => {
    if (authData?.authenticated) {
      syncReposMutation.mutate();
    }
    void queryClient.invalidateQueries();
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
        return 'Sıcak Noktalar ve Mimari Riskler';
      case 'ask':
        return 'Yapay Zeka Mühendislik Analisti';
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
      className="flex h-screen font-sans antialiased overflow-hidden bg-[#f6f3f4] text-[#241c1d]"
    >
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        user={user}
        authenticated={Boolean(authData?.authenticated)}
        hotspotsCount={hotspots.filter((h) => h.risk_level === 'CRITICAL' || h.risk_level === 'HIGH').length}
        risksCount={risks.filter((r) => r.severity === 'CRITICAL' || r.severity === 'HIGH').length}
      />

      <div className="flex-1 flex flex-col h-screen overflow-hidden relative bg-[#f6f3f4]">
        <Header
          title={getTabTitle()}
          subtitle={getTabSubtitle()}
          healthScore={healthScore || null}
          lastSyncAt={lastSyncAt}
          onSync={() => syncReposMutation.mutate()}
          isSyncing={isSyncing}
          onOpenAskAi={() => setActiveTab('ask')}
          rateLimitStatus={rateLimitStatus}
        />

        <main className="flex-1 overflow-y-auto px-6 py-6 lg:px-8 lg:py-7">
          <div className="max-w-7xl mx-auto space-y-6">
            {isInitialLoading && (
              <div
                className="rounded-xl border border-[#e8ded9] bg-[#f9efec] px-4 py-3 text-xs font-medium text-[#241c1d] flex items-center gap-2.5 shadow-xs"
                role="status"
                aria-live="polite"
              >
                <div className="w-2 h-2 rounded-full bg-[#241c1d] animate-ping shrink-0" />
                <span>GitHub telemetrisi ve mühendislik göstergeleri yükleniyor...</span>
              </div>
            )}

            {visibleErrors.length > 0 && (
              <div
                className="rounded-xl border border-[#e8ded9] bg-[#f9efec] px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs"
                role="alert"
                aria-live="assertive"
              >
                <div className="text-xs font-medium text-[#241c1d]">
                  <p>{visibleErrors[0]}</p>
                  {visibleErrors.length > 1 && (
                    <p className="text-[11px] mt-1 text-[#5c5254]">
                      Ayrıca {visibleErrors.length - 1} veri isteği daha tamamlanamadı.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleRetry}
                  className="shrink-0 px-3 py-1.5 rounded-lg border border-[#e8ded9] bg-[#fff4f0] text-[#241c1d] text-xs font-semibold hover:bg-white transition-colors cursor-pointer"
                >
                  Tekrar dene
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
                onExplainWhy={handleOpenExplain}
                onSelectRepo={setSelectedRepo}
                onNavigateToTab={setActiveTab}
              />
            )}

            {activeTab === 'hotspots' && (
              <HotspotsView
                hotspots={hotspots}
                risks={risks}
                healthScore={healthScore || null}
                onExplainWhy={handleOpenExplain}
                onAskAboutFile={handleAskAboutFile}
              />
            )}

            {activeTab === 'ask' && (
              <AskAiView
                messages={chatMessages}
                onSendMessage={handleSendMessage}
                isLoading={isAiLoading}
                activeTrace={activeTrace}
                defaultPrompt={askAiPrompt}
              />
            )}

            {activeTab === 'repositories' && (
              <RepositoriesView
                repositories={repositories}
                hotspots={hotspots}
                user={user}
                onToggleSelectRepo={handleToggleSelectRepo}
                onAskAboutRepo={handleAskAboutRepo}
                selectedRepo={selectedRepo}
                onSelectRepo={setSelectedRepo}
                onSync={() => {
                  syncReposMutation.mutate();
                }}
                syncStatus={authData?.syncStatus || reposData?.syncStatus}
                syncError={syncError}
                telemetryStatus={authData?.telemetryStatus || reposData?.telemetryStatus}
                isSyncing={isSyncing}
                rateLimitStatus={rateLimitStatus}
              />
            )}

            {/* Alt Bilgi (Footer) - Geliştirici & Referans Bağlantısı */}
            <footer className="pt-6 pb-4 mt-6 border-t border-[#e8ded9] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#5c5254]">
              <div className="flex items-center gap-2">
                <span className="font-bold text-[#241c1d]">DevControl AI</span>
                <span className="text-[#8c8082]">·</span>
                <span>Mühendislik Zekası ve Kişisel GitHub Telemetri Platformu</span>
              </div>
              <div className="flex items-center gap-2">
                <span>Geliştirici:</span>
                <a
                  href="https://yucelgumus.dev/"
                  target="_blank"
                  rel="author external"
                  title="Yücel Gümüş Kişisel Web Sitesi"
                  className="font-bold text-[#241c1d] hover:underline inline-flex items-center gap-1.5 bg-[#fff4f0] px-2.5 py-1 rounded-lg border border-[#e8ded9] shadow-xs transition-colors hover:bg-white"
                >
                  <span>Yücel Gümüş</span>
                  <ExternalLink className="w-3 h-3 text-[#241c1d]" />
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
