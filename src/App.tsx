import React, { useState } from 'react';
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
      className="flex h-screen font-sans antialiased overflow-hidden"
      style={{ backgroundColor: 'var(--dominant-bg)', color: 'var(--ink-primary)' }}
    >
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        user={user}
        authenticated={Boolean(authData?.authenticated)}
        hotspotsCount={hotspots.filter((h) => h.risk_level === 'CRITICAL' || h.risk_level === 'HIGH').length}
        risksCount={risks.filter((r) => r.severity === 'CRITICAL' || r.severity === 'HIGH').length}
      />

      <div className="flex-1 flex flex-col h-screen overflow-hidden relative" style={{ backgroundColor: 'var(--dominant-bg)' }}>
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

        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-7xl mx-auto">
            {isInitialLoading && (
              <div
                className="mb-5 rounded-2xl border px-4 py-3 text-sm font-semibold"
                style={{
                  backgroundColor: 'rgba(var(--c1-rgb), 0.3)',
                  borderColor: 'var(--c1)',
                  color: 'var(--ink-secondary)',
                }}
                role="status"
                aria-live="polite"
              >
                GitHub telemetrisi ve mühendislik göstergeleri yükleniyor...
              </div>
            )}

            {visibleErrors.length > 0 && (
              <div
                className="mb-5 rounded-2xl border px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                style={{
                  backgroundColor: 'rgba(var(--c3-rgb), 0.35)',
                  borderColor: 'var(--c3)',
                  color: 'var(--ink-primary)',
                }}
                role="alert"
                aria-live="assertive"
              >
                <div className="text-sm font-semibold">
                  <p>{visibleErrors[0]}</p>
                  {visibleErrors.length > 1 && (
                    <p className="text-xs mt-1" style={{ color: 'var(--ink-secondary)' }}>
                      Ayrıca {visibleErrors.length - 1} veri isteği daha tamamlanamadı.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleRetry}
                  className="shrink-0 px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer"
                  style={{
                    backgroundColor: 'var(--c2)',
                    borderColor: 'var(--c1)',
                    color: 'var(--ink-primary)',
                  }}
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
