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
    <div id="overview-view" className="space-y-6 font-sans text-[#241c1d]">
      {/* AI Geliştirici Kimliği & Hız Karnesi (Developer Persona Hero) */}
      <div className="p-5 rounded-xl border border-[#e8ded9] bg-[#f9efec] space-y-4 shadow-xs relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-[#e8ded9] pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#fff4f0] border border-[#e8ded9] flex items-center justify-center shrink-0 text-[#241c1d] shadow-xs">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#fff4f0] text-[#241c1d] border border-[#e8ded9]">
                  AI Mühendislik Kimliği
                </span>
                <span className="text-[11px] text-[#5c5254]">
                  Gemini Flash Analizi
                </span>
              </div>
              <h2 className="text-base font-bold text-[#241c1d] mt-0.5 tracking-tight">
                {persona?.personaTitle || (isPersonaLoading ? 'Geliştirici profili çıkarılıyor...' : 'Yazılım Mühendisi')}
              </h2>
            </div>
          </div>

          {/* Hızlı Metrik Rozetleri */}
          {persona && (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="px-2.5 py-1 rounded-lg border border-[#e8ded9] bg-[#fff4f0] text-xs font-semibold text-[#241c1d] flex items-center gap-1.5 shadow-xs">
                <Zap className="w-3.5 h-3.5 text-[#241c1d]" />
                <span>{persona.productivityMetrics.weeklyCommitFrequency} commit/hf</span>
              </div>
              <div className="px-2.5 py-1 rounded-lg border border-[#e8ded9] bg-[#fff4f0] text-xs font-semibold text-[#241c1d] flex items-center gap-1.5 shadow-xs">
                <Award className="w-3.5 h-3.5 text-[#241c1d]" />
                <span>Hijyen: {persona.productivityMetrics.conventionalCommitHygiene}</span>
              </div>
              <div className="px-2.5 py-1 rounded-lg border border-[#e8ded9] bg-[#fff4f0] text-xs font-medium text-[#5c5254] flex items-center gap-1.5">
                <span>Saatler: {persona.productivityMetrics.dominantWorkingHours}</span>
              </div>
            </div>
          )}
        </div>

        {/* Özet ve Çalışma Tarzı */}
        <p className="text-xs leading-relaxed text-[#5c5254] max-w-4xl">
          {persona?.summary || (isPersonaLoading
            ? 'Yapay zeka, son 30 gün içerisindeki tüm commitlerinizi, repo mimarilerinizi ve kod pratiklerinizi analiz ediyor...'
            : 'Depo telemetrisi üzerinden geliştirici kimliği sentezlenmektedir.')}
        </p>

        {persona && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {/* Süper Güçler */}
            <div className="p-3.5 rounded-lg border border-[#e8ded9] bg-[#fff4f0] space-y-2">
              <span className="text-xs font-bold text-[#241c1d] flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#241c1d]" />
                <span>Tespit Edilen Güçlü Yönler</span>
              </span>
              <ul className="space-y-1">
                {persona.superpowers.map((power, idx) => (
                  <li key={idx} className="text-xs text-[#5c5254] flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#241c1d] mt-1.5 shrink-0" />
                    <span>{power}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Büyüme & İyileştirme Alanları */}
            <div className="p-3.5 rounded-lg border border-[#e8ded9] bg-[#fff4f0] space-y-2">
              <span className="text-xs font-bold text-[#241c1d] flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-[#241c1d]" />
                <span>Mühendislik Tavsiyeleri</span>
              </span>
              <ul className="space-y-1">
                {persona.growthAreas.map((area, idx) => (
                  <li key={idx} className="text-xs text-[#5c5254] flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#5c5254] mt-1.5 shrink-0" />
                    <span>{area}</span>
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
          className="p-4 rounded-xl border border-[#e8ded9] bg-[#f9efec] hover:bg-[#fff4f0] transition-all cursor-pointer shadow-xs group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#5c5254]">Mühendislik Sağlığı</span>
            <div className="p-1.5 rounded-lg bg-[#fff4f0] text-[#241c1d] border border-[#e8ded9] group-hover:scale-105 transition-transform">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-[#241c1d] tracking-tight">
              {hasHealthData ? healthScore?.overallScore : '--'}
            </span>
            <span className="text-xs text-[#8c8082]">/ 100</span>
            <span className="ml-auto text-[11px] font-bold px-2 py-0.5 rounded bg-[#fff4f0] text-[#241c1d] border border-[#e8ded9]">
              {hasHealthData
                ? `Seviye ${healthScore?.grade}${healthScore?.dataStatus === 'partial' ? ' · Kısmi' : ''}`
                : 'Veri Yok'}
            </span>
          </div>
          <p className="text-[11px] mt-2 text-[#8c8082]">
            Boyutsal ağırlıklı hesaplama
          </p>
        </div>

        {/* KPI 2: Bağlı Depolar */}
        <div
          onClick={() => onNavigateToTab('repositories')}
          className="p-4 rounded-xl border border-[#e8ded9] bg-[#f9efec] hover:bg-[#fff4f0] transition-all cursor-pointer shadow-xs group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#5c5254]">Bağlı Depolar</span>
            <div className="p-1.5 rounded-lg bg-[#fff4f0] text-[#241c1d] border border-[#e8ded9] group-hover:scale-105 transition-transform">
              <FolderGit2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-[#241c1d] tracking-tight">
              {activeRepos.length}
            </span>
            <span className="text-xs text-[#8c8082]">/ {repositories.length} Aktif</span>
          </div>
          <p className="text-[11px] mt-2 text-[#8c8082]">
            Telemetri analizi için seçili
          </p>
        </div>

        {/* KPI 3: Sıcak Noktalar */}
        <div
          onClick={() => onNavigateToTab('hotspots')}
          className="p-4 rounded-xl border border-[#e8ded9] bg-[#f9efec] hover:bg-[#fff4f0] transition-all cursor-pointer shadow-xs group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#5c5254]">Sıcak Noktalar</span>
            <div className="p-1.5 rounded-lg bg-[#fff4f0] text-[#241c1d] border border-[#e8ded9] group-hover:scale-105 transition-transform">
              <Flame className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-[#241c1d] tracking-tight">
              {hotspots.length}
            </span>
            {criticalHotspots.length > 0 && (
              <span className="text-xs text-[#241c1d] font-bold">
                ({criticalHotspots.length} kritik)
              </span>
            )}
          </div>
          <p className="text-[11px] mt-2 text-[#8c8082]">
            Yüksek oynaklık ve hata riski
          </p>
        </div>

        {/* KPI 4: Mühendislik Riskleri */}
        <div
          onClick={() => onNavigateToTab('hotspots')}
          className="p-4 rounded-xl border border-[#e8ded9] bg-[#f9efec] hover:bg-[#fff4f0] transition-all cursor-pointer shadow-xs group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#5c5254]">Tespit Edilen Riskler</span>
            <div className="p-1.5 rounded-lg bg-[#fff4f0] text-[#241c1d] border border-[#e8ded9] group-hover:scale-105 transition-transform">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-[#241c1d] tracking-tight">
              {risks.length}
            </span>
            {criticalRisks.length > 0 && (
              <span className="text-xs text-[#241c1d] font-bold">
                ({criticalRisks.length} yüksek)
              </span>
            )}
          </div>
          <p className="text-[11px] mt-2 text-[#8c8082]">
            Kural motoru denetimleri
          </p>
        </div>
      </div>

      {/* Ana Satır: Günün Bülteni & 14 Günlük Hız Grafiği */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Günün Mühendislik Bülteni */}
        <div className="p-5 rounded-xl border border-[#e8ded9] bg-[#f9efec] space-y-3 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#e8ded9] pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#241c1d]" />
                <h3 className="text-xs font-bold text-[#241c1d]">
                  Günün Mühendislik Bülteni
                </h3>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#fff4f0] text-[#241c1d] border border-[#e8ded9]">
                AI Sentezi
              </span>
            </div>

            <div className="space-y-2.5 mt-3 max-h-[350px] overflow-y-auto pr-1">
              {dailyBriefLoading ? (
                <p className="text-xs text-[#8c8082] py-6 text-center">
                  Bülten maddeleri hazırlanıyor...
                </p>
              ) : dailyBriefError ? (
                <p className="text-xs text-[#241c1d] py-4">
                  Bülten alınamadı: {dailyBriefError}
                </p>
              ) : dailyBrief.length === 0 ? (
                <p className="text-xs text-[#8c8082] py-6 text-center">
                  Bu dönem için gösterilecek bülten maddesi bulunmuyor.
                </p>
              ) : (
                dailyBrief.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-lg border border-[#e8ded9] bg-[#fff4f0] hover:bg-white transition-colors space-y-1.5 shadow-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#241c1d] shrink-0" />
                        <span className="text-xs font-bold text-[#241c1d] truncate">
                          {item.title}
                        </span>
                      </div>
                      <span className="text-[10px] font-semibold text-[#5c5254] shrink-0">
                        {PRIORITY_TR_MAP[item.priority] || item.priority}
                      </span>
                    </div>
                    <p className="text-xs text-[#5c5254] leading-relaxed line-clamp-2">
                      {item.description}
                    </p>
                    <div className="flex items-center justify-between pt-1 text-[11px] text-[#8c8082]">
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
                        className="flex items-center gap-1 text-xs font-bold text-[#241c1d] hover:underline transition-colors cursor-pointer shrink-0 ml-2"
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
        <div className="lg:col-span-2 p-5 rounded-xl border border-[#e8ded9] bg-[#f9efec] space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-[#e8ded9] pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#241c1d]" />
              <h3 className="text-xs font-bold text-[#241c1d]">
                Son 14 Günlük Aktivite & Hız
              </h3>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5 text-[#5c5254] font-medium">
                <span className="w-2 h-2 rounded-full bg-[#241c1d]" />
                <span>Commit Hızı</span>
              </div>
              <div className="flex items-center gap-1.5 text-[#5c5254] font-medium">
                <span className="w-2 h-2 rounded-full bg-[#8c8082]" />
                <span>Hata Düzeltmeleri</span>
              </div>
            </div>
          </div>

          <div className="h-[300px] w-full pt-2">
            {activityLoading ? (
              <div className="h-full flex items-center justify-center text-xs text-[#8c8082]">
                Aktivite verisi yükleniyor...
              </div>
            ) : activityError ? (
              <div className="h-full flex items-center justify-center text-xs text-[#241c1d] text-center">
                Aktivite verisi alınamadı: {activityError}
              </div>
            ) : chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-[#8c8082] text-center">
                Son 14 günde gösterilecek aktivite bulunmuyor.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="commitGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#fff4f0" stopOpacity={0.9} />
                      <stop offset="95%" stopColor="#fff4f0" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="bugGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f6f3f4" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#f6f3f4" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    stroke="#8c8082"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: '#e8ded9' }}
                  />
                  <YAxis
                    stroke="#8c8082"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: '#e8ded9' }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: CHART_THEME.tooltipBg,
                      borderColor: CHART_THEME.tooltipBorder,
                      borderRadius: '8px',
                      color: CHART_THEME.textInk,
                      fontSize: '12px',
                      boxShadow: '0 4px 12px rgba(36, 28, 29, 0.08)',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="commits"
                    stroke="#241c1d"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#commitGrad)"
                    name="Commit Sayısı"
                  />
                  <Area
                    type="monotone"
                    dataKey="bugFixes"
                    stroke="#8c8082"
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
      <div className="p-5 rounded-xl border border-[#e8ded9] bg-[#f9efec] space-y-4 shadow-xs">
        <div className="flex items-center justify-between border-b border-[#e8ded9] pb-3">
          <h3 className="text-xs font-bold text-[#241c1d]">
            Depo Bazlı Sağlık ve Risk Matrisi
          </h3>
          <button
            onClick={() => onNavigateToTab('repositories')}
            className="text-xs font-bold text-[#241c1d] hover:underline flex items-center gap-1 cursor-pointer transition-colors"
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
              className="p-3.5 rounded-lg border border-[#e8ded9] bg-[#fff4f0] hover:bg-white hover:border-[#d9cbc5] transition-all cursor-pointer shadow-xs"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#241c1d] truncate">
                  {repo.name}
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#f6f3f4] text-[#241c1d] border border-[#e8ded9]">
                  {repo.language || 'Code'}
                </span>
              </div>
              <p className="text-xs mt-1 text-[#5c5254] line-clamp-2">
                {repo.description || 'Aktif GitHub deposu'}
              </p>
              <div className="flex items-center justify-between mt-3 pt-2 border-t border-[#e8ded9] text-[11px] text-[#8c8082]">
                <span>{repo.open_issues_count} Açık Issue</span>
                <span className="font-bold text-[#241c1d]">
                  {repo.forks_count} Fork
                </span>
              </div>
            </div>
          ))}
          {repositories.length === 0 && (
            <p className="col-span-full text-xs text-[#8c8082] text-center py-6">
              Depo sağlık matrisini görmek için önce kişisel GitHub depolarınızı bağlayın.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
