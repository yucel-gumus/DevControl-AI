import React from 'react';
import {
  Activity,
  FolderGit2,
  AlertTriangle,
  Flame,
  Sparkles,
  ArrowUpRight,
  TrendingUp,
  ArrowRight,
  Brain,
  Zap,
  Award,
  Target,
  CheckCircle2,
} from 'lucide-react';
import { useDeveloperPersona } from '../hooks/useMetrics.js';
import { PRIORITY_TR_MAP } from '../constants.js';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Repository,
  EngineeringHealthScore,
  EngineeringRisk,
  FileHotspot,
  TodayBriefItem,
} from '../types.js';
import { ExplainWhyData } from './ExplainWhyModal.js';
import { CHART_THEME } from '../theme.js';

interface Props {
  repositories: Repository[];
  healthScore: EngineeringHealthScore | null;
  risks: EngineeringRisk[];
  hotspots: FileHotspot[];
  dailyBrief: TodayBriefItem[];
  activityData: any;
  dailyBriefLoading?: boolean;
  dailyBriefError?: string | null;
  activityLoading?: boolean;
  activityError?: string | null;
  onExplainWhy: (data: ExplainWhyData) => void;
  onSelectRepo: (repo: Repository) => void;
  onNavigateToTab: (tab: any) => void;
}

export const OverviewView: React.FC<Props> = ({
  repositories = [],
  healthScore,
  risks = [],
  hotspots = [],
  dailyBrief = [],
  activityData,
  dailyBriefLoading = false,
  dailyBriefError = null,
  activityLoading = false,
  activityError = null,
  onExplainWhy,
  onSelectRepo,
  onNavigateToTab,
}) => {
  const criticalRisks = risks.filter((r) => r.severity === 'CRITICAL' || r.severity === 'HIGH');
  const criticalHotspots = hotspots.filter((h) => h.risk_level === 'CRITICAL' || h.risk_level === 'HIGH');
  const activeRepos = repositories.filter((r) => r.selected_for_analysis);
  const hasHealthData = Boolean(healthScore?.hasData);

  const chartData = (Array.isArray(activityData?.timeSeries) ? activityData.timeSeries : []).slice(-14).map((d: any) => ({
    date: typeof d?.date === 'string' ? d.date.split('-').slice(1).join('/') : (d?.date ? String(d.date) : ''),
    commits: d?.commits || 0,
    bugFixes: d?.bugFixes || 0,
    prsMerged: d?.prsMerged || 0,
  }));

  const { data: persona, isLoading: isPersonaLoading } = useDeveloperPersona();

  return (
    <div id="overview-view" className="space-y-6 font-sans text-[#231c1a]">
      {/* AI Geliştirici Kimliği & Hız Karnesi (Developer Persona Hero) */}
      <div className="p-5 rounded-xl border border-[#a89997] bg-[#cdc1b5] space-y-4 shadow-xs relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-[#a89997] pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#f9b88e] border border-[#231c1a]/15 flex items-center justify-center shrink-0 text-[#231c1a] shadow-xs">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/15">
                  AI Mühendislik Kimliği
                </span>
                <span className="text-[11px] text-[#4a3e3b] font-medium">
                  Gemini Flash Analizi
                </span>
              </div>
              <h2 className="text-base font-bold text-[#231c1a] mt-0.5 tracking-tight">
                {persona?.personaTitle || (isPersonaLoading ? 'Geliştirici profili çıkarılıyor...' : 'Yazılım Mühendisi')}
              </h2>
            </div>
          </div>

          {/* Hızlı Metrik Rozetleri */}
          {persona && (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="px-2.5 py-1 rounded-lg border border-[#231c1a]/15 bg-[#f9b88e] text-xs font-bold text-[#231c1a] flex items-center gap-1.5 shadow-xs">
                <Zap className="w-3.5 h-3.5 text-[#231c1a]" />
                <span>{persona.productivityMetrics.weeklyCommitFrequency} commit/hf</span>
              </div>
              <div className="px-2.5 py-1 rounded-lg border border-[#231c1a]/15 bg-[#f9b88e] text-xs font-bold text-[#231c1a] flex items-center gap-1.5 shadow-xs">
                <Award className="w-3.5 h-3.5 text-[#231c1a]" />
                <span>Hijyen: {persona.productivityMetrics.conventionalCommitHygiene}</span>
              </div>
              <div className="px-2.5 py-1 rounded-lg border border-[#a89997] bg-[#b9aba9]/40 text-xs font-bold text-[#231c1a] flex items-center gap-1.5">
                <span>Saatler: {persona.productivityMetrics.dominantWorkingHours}</span>
              </div>
            </div>
          )}
        </div>

        {/* Özet ve Çalışma Tarzı */}
        <p className="text-xs leading-relaxed text-[#4a3e3b] max-w-4xl font-medium">
          {persona?.summary || (isPersonaLoading
            ? 'Yapay zeka, son 30 gün içerisindeki tüm commitlerinizi, repo mimarilerinizi ve kod pratiklerinizi analiz ediyor...'
            : 'Depo telemetrisi üzerinden geliştirici kimliği sentezlenmektedir.')}
        </p>

        {persona && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {/* Süper Güçler */}
            <div className="p-3.5 rounded-lg border border-[#a89997] bg-[#b9aba9]/30 space-y-2">
              <span className="text-xs font-bold text-[#231c1a] flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#231c1a]" />
                <span>Tespit Edilen Güçlü Yönler</span>
              </span>
              <ul className="space-y-1">
                {persona.superpowers.map((power, idx) => (
                  <li key={idx} className="text-xs text-[#4a3e3b] flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#231c1a] mt-1.5 shrink-0" />
                    <span className="font-medium">{power}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Büyüme & İyileştirme Alanları */}
            <div className="p-3.5 rounded-lg border border-[#a89997] bg-[#b9aba9]/30 space-y-2">
              <span className="text-xs font-bold text-[#231c1a] flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-[#231c1a]" />
                <span>Mühendislik Tavsiyeleri</span>
              </span>
              <ul className="space-y-1">
                {persona.growthAreas.map((area, idx) => (
                  <li key={idx} className="text-xs text-[#4a3e3b] flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#4a3e3b] mt-1.5 shrink-0" />
                    <span className="font-medium">{area}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Üst 4 KPI Metrik Kartı */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Genel Sağlık Skoru */}
        <div
          onClick={() => onNavigateToTab('hotspots')}
          className="p-4 rounded-xl border border-[#a89997] bg-[#cdc1b5] hover:bg-[#cdc1b5]/80 transition-all cursor-pointer shadow-xs group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#4a3e3b]">Mühendislik Sağlığı</span>
            <div className="p-1.5 rounded-lg bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/15 group-hover:scale-105 transition-transform">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-[#231c1a] tracking-tight">
              {hasHealthData ? healthScore?.overallScore : '--'}
            </span>
            <span className="text-xs text-[#6e5f5c]">/ 100</span>
            <span className="ml-auto text-[11px] font-bold px-2 py-0.5 rounded bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/15">
              {hasHealthData
                ? `Seviye ${healthScore?.grade}${healthScore?.dataStatus === 'partial' ? ' · Kısmi' : ''}`
                : 'Veri Yok'}
            </span>
          </div>
          <p className="text-[11px] mt-2 text-[#6e5f5c]">
            Boyutsal ağırlıklı hesaplama
          </p>
        </div>

        {/* KPI 2: Bağlı Depolar */}
        <div
          onClick={() => onNavigateToTab('repositories')}
          className="p-4 rounded-xl border border-[#a89997] bg-[#cdc1b5] hover:bg-[#cdc1b5]/80 transition-all cursor-pointer shadow-xs group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#4a3e3b]">Bağlı Depolar</span>
            <div className="p-1.5 rounded-lg bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/15 group-hover:scale-105 transition-transform">
              <FolderGit2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-[#231c1a] tracking-tight">
              {activeRepos.length}
            </span>
            <span className="text-xs text-[#6e5f5c]">/ {repositories.length} Aktif</span>
          </div>
          <p className="text-[11px] mt-2 text-[#6e5f5c]">
            Telemetri analizi için seçili
          </p>
        </div>

        {/* KPI 3: Sıcak Noktalar */}
        <div
          onClick={() => onNavigateToTab('hotspots')}
          className="p-4 rounded-xl border border-[#a89997] bg-[#cdc1b5] hover:bg-[#cdc1b5]/80 transition-all cursor-pointer shadow-xs group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#4a3e3b]">Sıcak Noktalar</span>
            <div className="p-1.5 rounded-lg bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/15 group-hover:scale-105 transition-transform">
              <Flame className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-[#231c1a] tracking-tight">
              {hotspots.length}
            </span>
            {criticalHotspots.length > 0 && (
              <span className="text-xs text-[#231c1a] font-bold">
                ({criticalHotspots.length} kritik)
              </span>
            )}
          </div>
          <p className="text-[11px] mt-2 text-[#6e5f5c]">
            Yüksek oynaklık ve hata riski
          </p>
        </div>

        {/* KPI 4: Mühendislik Riskleri */}
        <div
          onClick={() => onNavigateToTab('hotspots')}
          className="p-4 rounded-xl border border-[#a89997] bg-[#cdc1b5] hover:bg-[#cdc1b5]/80 transition-all cursor-pointer shadow-xs group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#4a3e3b]">Tespit Edilen Riskler</span>
            <div className="p-1.5 rounded-lg bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/15 group-hover:scale-105 transition-transform">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-[#231c1a] tracking-tight">
              {risks.length}
            </span>
            {criticalRisks.length > 0 && (
              <span className="text-xs text-[#231c1a] font-bold">
                ({criticalRisks.length} yüksek)
              </span>
            )}
          </div>
          <p className="text-[11px] mt-2 text-[#6e5f5c]">
            Kural motoru denetimleri
          </p>
        </div>
      </div>

      {/* Ana Satır: Günün Bülteni & 14 Günlük Hız Grafiği */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Günün Mühendislik Bülteni */}
        <div className="p-5 rounded-xl border border-[#a89997] bg-[#cdc1b5] space-y-3 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#a89997] pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#231c1a]" />
                <h3 className="text-xs font-bold text-[#231c1a]">
                  Günün Mühendislik Bülteni
                </h3>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/15">
                AI Sentezi
              </span>
            </div>

            <div className="space-y-2.5 mt-3 max-h-[350px] overflow-y-auto pr-1">
              {dailyBriefLoading ? (
                <p className="text-xs text-[#6e5f5c] py-6 text-center">
                  Bülten maddeleri hazırlanıyor...
                </p>
              ) : dailyBriefError ? (
                <p className="text-xs text-[#231c1a] py-4">
                  Bülten alınamadı: {dailyBriefError}
                </p>
              ) : dailyBrief.length === 0 ? (
                <p className="text-xs text-[#6e5f5c] py-6 text-center">
                  Bu dönem için gösterilecek bülten maddesi bulunmuyor.
                </p>
              ) : (
                dailyBrief.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-lg border border-[#a89997] bg-[#b9aba9]/30 hover:bg-[#b9aba9]/50 transition-colors space-y-1.5 shadow-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#231c1a] shrink-0" />
                        <span className="text-xs font-bold text-[#231c1a] truncate">
                          {item.title}
                        </span>
                      </div>
                      <span className="text-[10px] font-bold text-[#4a3e3b] shrink-0">
                        {PRIORITY_TR_MAP[item.priority] || item.priority}
                      </span>
                    </div>
                    <p className="text-xs text-[#4a3e3b] leading-relaxed line-clamp-2">
                      {item.description}
                    </p>
                    <div className="flex items-center justify-between pt-1 text-[11px] text-[#6e5f5c]">
                      <span className="truncate">{item.relatedRepo || 'Genel Platform'}</span>
                      <button
                        onClick={() =>
                          onExplainWhy({
                            title: item.title,
                            category: item.relatedRepo || 'Mühendislik Bülteni',
                            summary: item.description,
                            impactScore: healthScore?.hasData ? healthScore.overallScore : 0,
                            evidence: [
                              item.evidenceSummary || 'Bu madde için ek kanıt bulunmuyor.',
                            ],
                            actionPlan: item.actionable
                              ? ['İlgili GitHub kaydını inceleyin ve gerekli mühendislik aksiyonunu planlayın.']
                              : [],
                          })
                        }
                        className="flex items-center gap-1 text-xs font-bold text-[#231c1a] hover:underline transition-colors cursor-pointer shrink-0 ml-2"
                      >
                        <span>Detay</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* 14 Günlük Hız Grafiği */}
        <div className="lg:col-span-2 p-5 rounded-xl border border-[#a89997] bg-[#cdc1b5] space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-[#a89997] pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#231c1a]" />
              <h3 className="text-xs font-bold text-[#231c1a]">
                Son 14 Günlük Aktivite & Hız
              </h3>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5 text-[#4a3e3b] font-bold">
                <span className="w-2 h-2 rounded-full bg-[#f9b88e]" />
                <span>Commit Hızı</span>
              </div>
              <div className="flex items-center gap-1.5 text-[#4a3e3b] font-bold">
                <span className="w-2 h-2 rounded-full bg-[#b9aba9]" />
                <span>Hata Düzeltmeleri</span>
              </div>
            </div>
          </div>

          <div className="h-[300px] w-full pt-2">
            {activityLoading ? (
              <div className="h-full flex items-center justify-center text-xs text-[#6e5f5c]">
                Aktivite verisi yükleniyor...
              </div>
            ) : activityError ? (
              <div className="h-full flex items-center justify-center text-xs text-[#231c1a] text-center">
                Aktivite verisi alınamadı: {activityError}
              </div>
            ) : chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-[#6e5f5c] text-center">
                Son 14 günde gösterilecek aktivite bulunmuyor.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="commitGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f9b88e" stopOpacity={0.9} />
                      <stop offset="95%" stopColor="#f9b88e" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="bugGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#b9aba9" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#b9aba9" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    stroke="#6e5f5c"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: '#a89997' }}
                  />
                  <YAxis
                    stroke="#6e5f5c"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: '#a89997' }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: CHART_THEME.tooltipBg,
                      borderColor: CHART_THEME.tooltipBorder,
                      borderRadius: '8px',
                      color: CHART_THEME.textInk,
                      fontSize: '12px',
                      boxShadow: '0 4px 12px rgba(35, 28, 26, 0.15)',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="commits"
                    stroke="#231c1a"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#commitGrad)"
                    name="Commit Sayısı"
                  />
                  <Area
                    type="monotone"
                    dataKey="bugFixes"
                    stroke="#6e5f5c"
                    strokeWidth={1.5}
                    fillOpacity={1}
                    fill="url(#bugGrad)"
                    name="Hata Düzeltmeleri"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Alt Satır: Depo Bazlı Sağlık Matrisi */}
      <div className="p-5 rounded-xl border border-[#a89997] bg-[#cdc1b5] space-y-4 shadow-xs">
        <div className="flex items-center justify-between border-b border-[#a89997] pb-3">
          <h3 className="text-xs font-bold text-[#231c1a]">
            Depo Bazlı Sağlık ve Risk Matrisi
          </h3>
          <button
            onClick={() => onNavigateToTab('repositories')}
            className="text-xs font-bold text-[#231c1a] hover:underline flex items-center gap-1 cursor-pointer transition-colors"
          >
            <span>Tüm Depoları Gör</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {repositories.slice(0, 6).map((repo) => (
            <div
              key={repo.id}
              onClick={() => onSelectRepo(repo)}
              className="p-3.5 rounded-lg border border-[#a89997] bg-[#b9aba9]/30 hover:bg-[#b9aba9]/50 transition-all cursor-pointer shadow-xs"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#231c1a] truncate">
                  {repo.name}
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/15">
                  {repo.language || 'Code'}
                </span>
              </div>
              <p className="text-xs mt-1 text-[#4a3e3b] line-clamp-2">
                {repo.description || 'Aktif GitHub deposu'}
              </p>
              <div className="flex items-center justify-between mt-3 pt-2 border-t border-[#a89997] text-[11px] text-[#6e5f5c]">
                <span>{repo.open_issues_count} Açık Issue</span>
                <span className="font-bold text-[#231c1a]">
                  {repo.forks_count} Fork
                </span>
              </div>
            </div>
          ))}
          {repositories.length === 0 && (
            <p className="col-span-full text-xs text-[#6e5f5c] text-center py-6">
              Depo sağlık matrisini görmek için önce kişisel GitHub depolarınızı bağlayın.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
