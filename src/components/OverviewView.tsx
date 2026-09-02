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
import { THEME_PALETTE, CHART_THEME } from '../theme.js';

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
    <div id="overview-view" className="space-y-6 font-sans">
      {/* AI Geliştirici Kimliği & Hız Karnesi (Developer Persona Hero) */}
      <div
        className="p-6 rounded-2xl border space-y-4 shadow-sm relative overflow-hidden"
        style={{
          backgroundColor: 'rgba(var(--c1-rgb), 0.35)',
          borderColor: 'var(--c1)',
        }}
      >
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b pb-4" style={{ borderColor: 'var(--c1)' }}>
          <div className="flex items-center gap-3">
            <div
              className="p-2.5 rounded-xl border shadow-xs"
              style={{
                backgroundColor: 'var(--c3)',
                borderColor: 'rgba(var(--c3-rgb), 0.9)',
              }}
            >
              <Brain className="w-5 h-5" style={{ color: 'var(--ink-primary)' }} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span
                  className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border"
                  style={{
                    backgroundColor: 'var(--c3)',
                    borderColor: 'rgba(var(--c3-rgb), 0.9)',
                    color: 'var(--ink-primary)',
                  }}
                >
                  Yapay Zeka Destekli Mühendislik Kimliği
                </span>
                <span className="text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>
                  Gemini Flash Telemetri Analizi
                </span>
              </div>
              <h2 className="text-lg font-black mt-1" style={{ color: 'var(--ink-primary)' }}>
                {persona?.personaTitle || (isPersonaLoading ? 'Geliştirici Profili Çıkarılıyor...' : 'Yazılım Mühendisi')}
              </h2>
            </div>
          </div>

          {/* Hızlı Metrik Rozetleri */}
          {persona && (
            <div className="flex items-center gap-2 flex-wrap">
              <div
                className="px-3 py-1.5 rounded-xl border text-[11px] font-bold flex items-center gap-1.5 shadow-xs"
                style={{
                  backgroundColor: 'rgba(var(--c2-rgb), 0.9)',
                  borderColor: 'var(--c1)',
                  color: 'var(--ink-primary)',
                }}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>{persona.productivityMetrics.weeklyCommitFrequency} commit/hf</span>
              </div>
              <div
                className="px-3 py-1.5 rounded-xl border text-[11px] font-bold flex items-center gap-1.5 shadow-xs"
                style={{
                  backgroundColor: 'rgba(var(--c2-rgb), 0.9)',
                  borderColor: 'var(--c1)',
                  color: 'var(--ink-primary)',
                }}
              >
                <Award className="w-3.5 h-3.5" />
                <span>Hijyen: {persona.productivityMetrics.conventionalCommitHygiene}</span>
              </div>
              <div
                className="px-3 py-1.5 rounded-xl border text-[11px] font-bold flex items-center gap-1.5 shadow-xs"
                style={{
                  backgroundColor: 'rgba(var(--c2-rgb), 0.9)',
                  borderColor: 'var(--c1)',
                  color: 'var(--ink-secondary)',
                }}
              >
                <span>Saatler: {persona.productivityMetrics.dominantWorkingHours}</span>
              </div>
            </div>
          )}
        </div>

        {/* Özet ve Çalışma Tarzı */}
        <p className="text-xs leading-relaxed max-w-4xl" style={{ color: 'var(--ink-secondary)' }}>
          {persona?.summary || (isPersonaLoading
            ? 'Yapay zeka (Gemini), son 30 gün içerisindeki tüm commitlerinizi, repo mimarilerinizi ve kod temizleme disiplininizi sentezliyor...'
            : 'Depo analizleri üzerinden geliştirici kimliği çıkarılmaktadır.')}
        </p>

        {persona && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {/* Süper Güçler */}
            <div
              className="p-4 rounded-xl border space-y-2"
              style={{
                backgroundColor: 'rgba(var(--c2-rgb), 0.85)',
                borderColor: 'var(--c1)',
              }}
            >
              <span className="text-[11px] font-extrabold uppercase flex items-center gap-1.5 tracking-wide" style={{ color: 'var(--ink-primary)' }}>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Tespit Edilen Süper Güçler</span>
              </span>
              <ul className="space-y-1.5">
                {persona.superpowers.map((power, idx) => (
                  <li key={idx} className="text-[11px] leading-relaxed flex items-start gap-2" style={{ color: 'var(--ink-secondary)' }}>
                    <span className="w-1.5 h-1.5 rounded-full mt-1 shrink-0" style={{ backgroundColor: 'var(--c3)' }}></span>
                    <span>{power}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Büyüme & İyileştirme Alanları */}
            <div
              className="p-4 rounded-xl border space-y-2"
              style={{
                backgroundColor: 'rgba(var(--c2-rgb), 0.85)',
                borderColor: 'var(--c1)',
              }}
            >
              <span className="text-[11px] font-extrabold uppercase flex items-center gap-1.5 tracking-wide" style={{ color: 'var(--ink-primary)' }}>
                <Target className="w-3.5 h-3.5" />
                <span>Yapay Zeka Mühendislik Tavsiyeleri</span>
              </span>
              <ul className="space-y-1.5">
                {persona.growthAreas.map((area, idx) => (
                  <li key={idx} className="text-[11px] leading-relaxed flex items-start gap-2" style={{ color: 'var(--ink-secondary)' }}>
                    <span className="w-1.5 h-1.5 rounded-full mt-1 shrink-0" style={{ backgroundColor: 'var(--ink-muted)' }}></span>
                    <span>{area}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Üst 4 KPI Metrik Kartı (%30 Yüzey Kartları) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Genel Sağlık Skoru */}
        <div
          onClick={() => onNavigateToTab('hotspots')}
          className="p-5 rounded-2xl border transition-all hover:scale-101 cursor-pointer shadow-sm"
          style={{
            backgroundColor: 'rgba(var(--c1-rgb), 0.3)',
            borderColor: 'var(--c1)',
          }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold" style={{ color: 'var(--ink-secondary)' }}>Mühendislik Sağlığı</span>
            <div className="p-2 rounded-xl border" style={{ backgroundColor: 'var(--c3)', borderColor: 'rgba(var(--c3-rgb), 0.8)' }}>
              <Activity className="w-4 h-4" style={{ color: 'var(--ink-primary)' }} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black" style={{ color: 'var(--ink-primary)' }}>
              {hasHealthData ? healthScore?.overallScore : '--'}
            </span>
            <span className="text-xs font-bold" style={{ color: 'var(--ink-muted)' }}>/ 100</span>
            <span
              className="ml-auto text-xs font-black px-2 py-0.5 rounded-full border"
              style={{
                backgroundColor: 'var(--c3)',
                borderColor: 'rgba(var(--c3-rgb), 0.9)',
                color: 'var(--ink-primary)',
              }}
            >
              {hasHealthData
                ? `Seviye ${healthScore?.grade}${healthScore?.dataStatus === 'partial' ? ' · KISMİ VERİ' : ''}`
                : 'VERİ YOK'}
            </span>
          </div>
          <p className="text-[11px] mt-2 font-medium" style={{ color: 'var(--ink-muted)' }}>
            Boyutsal ağırlıklı hesaplama
          </p>
        </div>

        {/* KPI 2: Bağlı Depolar */}
        <div
          onClick={() => onNavigateToTab('repositories')}
          className="p-5 rounded-2xl border transition-all hover:scale-101 cursor-pointer shadow-sm"
          style={{
            backgroundColor: 'rgba(var(--c1-rgb), 0.3)',
            borderColor: 'var(--c1)',
          }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold" style={{ color: 'var(--ink-secondary)' }}>Bağlı Depolar</span>
            <div className="p-2 rounded-xl border" style={{ backgroundColor: 'var(--c1)', borderColor: 'rgba(var(--c1-rgb), 0.8)' }}>
              <FolderGit2 className="w-4 h-4" style={{ color: 'var(--ink-primary)' }} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black" style={{ color: 'var(--ink-primary)' }}>
              {activeRepos.length}
            </span>
            <span className="text-xs font-bold" style={{ color: 'var(--ink-muted)' }}>/ {repositories.length} Aktif</span>
          </div>
          <p className="text-[11px] mt-2 font-medium" style={{ color: 'var(--ink-muted)' }}>
            Telemetri analizi için seçildi
          </p>
        </div>

        {/* KPI 3: Sıcak Noktalar */}
        <div
          onClick={() => onNavigateToTab('hotspots')}
          className="p-5 rounded-2xl border transition-all hover:scale-101 cursor-pointer shadow-sm"
          style={{
            backgroundColor: 'rgba(var(--c1-rgb), 0.3)',
            borderColor: 'var(--c1)',
          }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold" style={{ color: 'var(--ink-secondary)' }}>Sıcak Noktalar</span>
            <div className="p-2 rounded-xl border" style={{ backgroundColor: 'var(--c3)', borderColor: 'rgba(var(--c3-rgb), 0.8)' }}>
              <Flame className="w-4 h-4" style={{ color: 'var(--ink-primary)' }} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black" style={{ color: 'var(--ink-primary)' }}>
              {hotspots.length}
            </span>
            <span className="text-xs font-bold" style={{ color: 'var(--ink-muted)' }}>
              ({criticalHotspots.length} Kritik)
            </span>
          </div>
          <p className="text-[11px] mt-2 font-medium" style={{ color: 'var(--ink-muted)' }}>
            Yüksek oynaklık ve hata yoğunluğu
          </p>
        </div>

        {/* KPI 4: Mühendislik Riskleri */}
        <div
          onClick={() => onNavigateToTab('hotspots')}
          className="p-5 rounded-2xl border transition-all hover:scale-101 cursor-pointer shadow-sm"
          style={{
            backgroundColor: 'rgba(var(--c1-rgb), 0.3)',
            borderColor: 'var(--c1)',
          }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold" style={{ color: 'var(--ink-secondary)' }}>Tespit Edilen Riskler</span>
            <div className="p-2 rounded-xl border" style={{ backgroundColor: 'var(--c3)', borderColor: 'rgba(var(--c3-rgb), 0.8)' }}>
              <AlertTriangle className="w-4 h-4" style={{ color: 'var(--ink-primary)' }} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black" style={{ color: 'var(--ink-primary)' }}>
              {risks.length}
            </span>
            <span className="text-xs font-bold" style={{ color: 'var(--ink-muted)' }}>
              ({criticalRisks.length} Öncelikli)
            </span>
          </div>
          <p className="text-[11px] mt-2 font-medium" style={{ color: 'var(--ink-muted)' }}>
            Deterministik kurallarla denetlendi
          </p>
        </div>
      </div>

      {/* Ana Satır: Günün Bülteni & 14 Günlük Hız Grafiği */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Günün Mühendislik Bülteni */}
        <div
          className="p-6 rounded-2xl border space-y-4 shadow-sm"
          style={{
            backgroundColor: 'rgba(var(--c1-rgb), 0.25)',
            borderColor: 'var(--c1)',
          }}
        >
          <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--c1)' }}>
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg border" style={{ backgroundColor: 'var(--c3)', borderColor: 'rgba(var(--c3-rgb), 0.8)' }}>
                <Sparkles className="w-4 h-4" style={{ color: 'var(--ink-primary)' }} />
              </div>
              <h2 className="text-sm font-extrabold" style={{ color: 'var(--ink-primary)' }}>
                Günün Mühendislik Bülteni
              </h2>
            </div>
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
              style={{
                backgroundColor: 'var(--c1)',
                borderColor: 'rgba(var(--c1-rgb), 0.9)',
                color: 'var(--ink-primary)',
              }}
            >
              Yapay Zeka
            </span>
          </div>

          <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
            {dailyBriefLoading ? (
              <p className="text-xs italic py-4" style={{ color: 'var(--ink-muted)' }}>
                Bülten maddeleri yükleniyor...
              </p>
            ) : dailyBriefError ? (
              <p className="text-xs py-4" style={{ color: 'var(--ink-secondary)' }}>
                Bülten alınamadı: {dailyBriefError}
              </p>
            ) : dailyBrief.length === 0 ? (
              <p className="text-xs italic py-4" style={{ color: 'var(--ink-muted)' }}>
                Bu dönem için gösterilecek bülten maddesi bulunmuyor.
              </p>
            ) : (
              dailyBrief.map((item) => (
                <div
                  key={item.id}
                  className="p-3.5 rounded-xl border space-y-1.5 transition-all hover:scale-101"
                  style={{
                    backgroundColor: 'rgba(var(--c2-rgb), 0.8)',
                    borderColor: 'var(--c1)',
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold line-clamp-1" style={{ color: 'var(--ink-primary)' }}>
                      {item.title}
                    </span>
                    <span
                      className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border shrink-0"
                      style={{
                        backgroundColor: 'var(--c3)',
                        borderColor: 'rgba(var(--c3-rgb), 0.8)',
                        color: 'var(--ink-primary)',
                      }}
                    >
                      {PRIORITY_TR_MAP[item.priority] || item.priority}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed line-clamp-2" style={{ color: 'var(--ink-secondary)' }}>
                    {item.description}
                  </p>
                  <div className="flex items-center justify-between pt-1 text-[10px] font-semibold" style={{ color: 'var(--ink-muted)' }}>
                    <span>{item.relatedRepo || 'Genel Platform'}</span>
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
                      className="flex items-center gap-1 font-bold cursor-pointer hover:underline"
                      style={{ color: 'var(--ink-primary)' }}
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

        {/* 14 Günlük Hız Grafiği */}
        <div
          className="lg:col-span-2 p-6 rounded-2xl border space-y-4 shadow-sm"
          style={{
            backgroundColor: 'rgba(var(--c1-rgb), 0.25)',
            borderColor: 'var(--c1)',
          }}
        >
          <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--c1)' }}>
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg border" style={{ backgroundColor: 'var(--c1)', borderColor: 'rgba(var(--c1-rgb), 0.9)' }}>
                <TrendingUp className="w-4 h-4" style={{ color: 'var(--ink-primary)' }} />
              </div>
              <h2 className="text-sm font-extrabold" style={{ color: 'var(--ink-primary)' }}>
                Son 14 Günlük Aktivite & Hız (Velocity)
              </h2>
            </div>
            <div className="flex items-center gap-4 text-xs font-bold">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full border" style={{ backgroundColor: 'var(--c3)', borderColor: 'rgba(var(--c3-rgb), 0.9)' }}></span>
                <span style={{ color: 'var(--ink-secondary)' }}>Commit Hızı</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full border" style={{ backgroundColor: 'var(--c1)', borderColor: 'rgba(var(--c1-rgb), 0.9)' }}></span>
                <span style={{ color: 'var(--ink-secondary)' }}>Hata Düzeltmeleri</span>
              </div>
            </div>
          </div>

          <div className="h-[320px] w-full pt-2">
            {activityLoading ? (
              <div className="h-full flex items-center justify-center text-xs italic" style={{ color: 'var(--ink-muted)' }}>
                Aktivite verisi yükleniyor...
              </div>
            ) : activityError ? (
              <div className="h-full flex items-center justify-center text-xs text-center" style={{ color: 'var(--ink-secondary)' }}>
                Aktivite verisi alınamadı: {activityError}
              </div>
            ) : chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs italic text-center" style={{ color: 'var(--ink-muted)' }}>
                Son 14 günde gösterilecek aktivite bulunmuyor.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="c3Grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={THEME_PALETTE.COLOR_3} stopOpacity={0.8} />
                      <stop offset="95%" stopColor={THEME_PALETTE.COLOR_3} stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="c1Grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={THEME_PALETTE.COLOR_1} stopOpacity={0.8} />
                      <stop offset="95%" stopColor={THEME_PALETTE.COLOR_1} stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    stroke="var(--ink-muted)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: 'var(--c1)' }}
                  />
                  <YAxis
                    stroke="var(--ink-muted)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: 'var(--c1)' }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: THEME_PALETTE.COLOR_2,
                      borderColor: THEME_PALETTE.COLOR_1,
                      borderRadius: '12px',
                      color: CHART_THEME.textInk,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="commits"
                    stroke={THEME_PALETTE.COLOR_3}
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#c3Grad)"
                    name="Commit Sayısı"
                  />
                  <Area
                    type="monotone"
                    dataKey="bugFixes"
                    stroke={THEME_PALETTE.COLOR_1}
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#c1Grad)"
                    name="Hata Düzeltmeleri"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Alt Satır: Depo Bazlı Sağlık Matrisi */}
      <div
        className="p-6 rounded-2xl border space-y-4 shadow-sm"
        style={{
          backgroundColor: 'rgba(var(--c1-rgb), 0.25)',
          borderColor: 'var(--c1)',
        }}
      >
        <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--c1)' }}>
          <h2 className="text-sm font-extrabold" style={{ color: 'var(--ink-primary)' }}>
            Depo Bazlı Sağlık ve Risk Matrisi
          </h2>
          <button
            onClick={() => onNavigateToTab('repositories')}
            className="text-xs font-bold flex items-center gap-1 cursor-pointer hover:underline"
            style={{ color: 'var(--ink-primary)' }}
          >
            <span>Tüm Depoları Gör</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {repositories.slice(0, 6).map((repo) => (
            <div
              key={repo.id}
              onClick={() => onSelectRepo(repo)}
              className="p-4 rounded-xl border transition-all hover:scale-101 cursor-pointer shadow-xs"
              style={{
                backgroundColor: 'rgba(var(--c2-rgb), 0.8)',
                borderColor: 'var(--c1)',
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold line-clamp-1" style={{ color: 'var(--ink-primary)' }}>
                  {repo.name}
                </span>
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                  style={{
                    backgroundColor: 'var(--c3)',
                    borderColor: 'rgba(var(--c3-rgb), 0.8)',
                    color: 'var(--ink-primary)',
                  }}
                >
                  {repo.language || 'Code'}
                </span>
              </div>
              <p className="text-xs mt-1.5 line-clamp-2" style={{ color: 'var(--ink-secondary)' }}>
                {repo.description || 'Aktif GitHub deposu'}
              </p>
              <div className="flex items-center justify-between mt-3 pt-2 border-t text-[11px] font-semibold" style={{ borderColor: 'rgba(var(--c1-rgb), 0.4)', color: 'var(--ink-muted)' }}>
                <span>{repo.open_issues_count} Açık Issue</span>
                <span className="font-bold" style={{ color: 'var(--ink-primary)' }}>
                  {repo.forks_count} Fork
                </span>
              </div>
            </div>
          ))}
          {repositories.length === 0 && (
            <p className="col-span-full text-sm text-center py-6" style={{ color: 'var(--ink-muted)' }}>
              Depo sağlık matrisini görmek için önce kişisel GitHub depolarınızı bağlayın.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
