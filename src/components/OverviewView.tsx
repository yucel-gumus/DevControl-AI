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
  Star,
  GitFork,
  Clock,
  Code2,
} from 'lucide-react';
import { useDeveloperPersona } from '../hooks/useMetrics.js';
import { PRIORITY_TR_MAP } from '../constants.js';
import { formatDate } from '../utils/formatters.js';
import {
  Repository,
  EngineeringHealthScore,
  EngineeringRisk,
  FileHotspot,
  TodayBriefItem,
} from '../types.js';
import { ExplainWhyData } from './ExplainWhyModal.js';

const ActivityChart = React.lazy(() => import('./ActivityChart.js'));

interface Props {
  repositories: Repository[];
  healthScore: EngineeringHealthScore | null;
  risks: EngineeringRisk[];
  hotspots: FileHotspot[];
  dailyBrief: TodayBriefItem[];
  activityData?: any;
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

  const chartData = (Array.isArray(activityData?.timeSeries) ? activityData.timeSeries : []).slice(-7).map((d: any) => ({
    date: typeof d?.date === 'string' ? d.date.split('-').slice(1).join('/') : (d?.date ? String(d.date) : ''),
    commits: d?.commits || 0,
    bugFixes: d?.bugFixes || 0,
    prsMerged: d?.prsMerged || 0,
  }));

  const { data: persona, isLoading: isPersonaLoading } = useDeveloperPersona();

  // En Yüksek Etkili Odak Depolar (Son güncellemeye göre sıralı)
  const candidateRepos = activeRepos.length > 0 ? activeRepos : repositories;
  const topImpactRepos = [...candidateRepos]
    .sort((a, b) => new Date(b.pushed_at || b.updated_at).getTime() - new Date(a.pushed_at || a.updated_at).getTime())
    .slice(0, 4);

  // Dil Dağılımı (Gerçek bayt bazlı)
  const totalBytesByLang: Record<string, number> = {};
  let totalBytes = 0;
  for (const r of activeRepos) {
    if (r.languages) {
      for (const [lang, bytes] of Object.entries(r.languages)) {
        const byteCount = Number(bytes) || 0;
        totalBytesByLang[lang] = (totalBytesByLang[lang] || 0) + byteCount;
        totalBytes += byteCount;
      }
    }
  }
  const topLanguages = Object.entries(totalBytesByLang)
    .map(([name, bytes]) => ({
      name,
      percentage: totalBytes > 0 ? Math.round((bytes / totalBytes) * 100) : 0,
      sizeKb: Math.round(bytes / 1024),
    }))
    .sort((a, b) => b.percentage - a.percentage)
    .slice(0, 4);

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
                  KENSAI Analizi
                </span>
              </div>
              <h2 className="text-base font-bold text-[#231c1a] mt-0.5 tracking-tight">
                {persona?.personaTitle || (isPersonaLoading ? 'Geliştirici profili çıkarılıyor...' : 'Yazılım Mühendisi')}
              </h2>
            </div>
          </div>

          {/* Hızlı Metrik Rozetleri */}
          {persona && persona.productivityMetrics && (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="px-2.5 py-1 rounded-lg border border-[#231c1a]/15 bg-[#f9b88e] text-xs font-bold text-[#231c1a] flex items-center gap-1.5 shadow-xs">
                <Zap className="w-3.5 h-3.5 text-[#231c1a]" />
                <span>{persona.productivityMetrics.weeklyCommitFrequency ?? 0} commit/hf</span>
              </div>
              <div className="px-2.5 py-1 rounded-lg border border-[#231c1a]/15 bg-[#f9b88e] text-xs font-bold text-[#231c1a] flex items-center gap-1.5 shadow-xs">
                <Award className="w-3.5 h-3.5 text-[#231c1a]" />
                <span>Hijyen: {persona.productivityMetrics.conventionalCommitHygiene || 'Standart'}</span>
              </div>
              <div className="px-2.5 py-1 rounded-lg border border-[#a89997] bg-[#b9aba9]/40 text-xs font-bold text-[#231c1a] flex items-center gap-1.5">
                <span>Saatler: {persona.productivityMetrics.dominantWorkingHours || 'Esnek'}</span>
              </div>
            </div>
          )}
        </div>

        {/* Özet ve Çalışma Tarzı */}
        <p className="text-xs leading-relaxed text-[#4a3e3b] max-w-4xl font-medium">
          {persona?.summary || (isPersonaLoading
            ? 'Yapay zeka, son 7 gün içerisindeki tüm commitlerinizi, repo mimarilerinizi ve kod pratiklerinizi analiz ediyor...'
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
                {(persona.superpowers || []).map((power, idx) => (
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
                {(persona.growthAreas || []).map((area, idx) => (
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

        {/* KPI 3: Kritik Dosyalar */}
        <div
          onClick={() => onNavigateToTab('hotspots')}
          className="p-4 rounded-xl border border-[#a89997] bg-[#cdc1b5] hover:bg-[#cdc1b5]/80 transition-all cursor-pointer shadow-xs group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#4a3e3b]">Kritik Dosyalar</span>
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

      {/* Ana Satır: Günün Bülteni & 7 Günlük Hız Grafiği */}
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

        {/* 7 Günlük Hız Grafiği */}
        <div className="lg:col-span-2 p-5 rounded-xl border border-[#a89997] bg-[#cdc1b5] space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-[#a89997] pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#231c1a]" />
              <h3 className="text-xs font-bold text-[#231c1a]">
                Son 7 Günlük Aktivite & Hız
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
                Son 7 günde gösterilecek aktivite bulunmuyor.
              </div>
            ) : (
              <React.Suspense
                fallback={
                  <div className="h-full flex items-center justify-center text-xs text-[#6e5f5c] animate-pulse">
                    Grafik bileşeni yükleniyor...
                  </div>
                }
              >
                <ActivityChart chartData={chartData} />
              </React.Suspense>
            )}
          </div>
        </div>
      </div>

      {/* İkinci Satır: CI/CD Pipeline & Teknoloji Yığını (Languages) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* En Yüksek Etkili Odak Depolar Kartı */}
        <div className="p-5 rounded-xl border border-[#a89997] bg-[#cdc1b5] space-y-3.5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#a89997] pb-3">
              <div className="flex items-center gap-2">
                <FolderGit2 className="w-4 h-4 text-[#231c1a]" />
                <h3 className="text-xs font-bold text-[#231c1a]">En Yüksek Etkili Odak Depolar</h3>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/15">
                Aktif Çalışma Alanları
              </span>
            </div>

            <div className="space-y-2 pt-2.5">
              {topImpactRepos.length === 0 ? (
                <p className="text-xs text-[#6e5f5c] text-center py-6">Aktif proje bulunamadı.</p>
              ) : (
                topImpactRepos.map((repo) => (
                  <div
                    key={repo.id}
                    onClick={() => onSelectRepo(repo)}
                    className="p-2.5 rounded-lg border border-[#a89997] bg-[#b9aba9]/25 hover:bg-[#b9aba9]/45 transition-all flex items-center justify-between gap-3 cursor-pointer group shadow-2xs"
                    title="Bu depoyu Kensai AI ile analiz et"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-[#231c1a] group-hover:underline truncate">
                          {repo.name}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/15 font-bold">
                          {repo.language || 'Kod'}
                        </span>
                        {repo.stargazers_count > 0 && (
                          <span className="text-[10px] font-bold text-[#231c1a] flex items-center gap-0.5">
                            ⭐ {repo.stargazers_count}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#4a3e3b] truncate font-medium max-w-xs">
                        {repo.description || 'Proje açıklaması girilmemiş.'}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[10px] block text-[#4a3e3b] font-bold">Son Değişiklik</span>
                      <span className="text-xs font-bold text-[#231c1a]">
                        {formatDate(repo.pushed_at || repo.updated_at)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="pt-2 border-t border-[#a89997] flex items-center justify-between">
            <span className="text-[11px] text-[#4a3e3b] font-medium">
              Toplam {repositories.length} depo izleniyor ({activeRepos.length} aktif seçili)
            </span>
            <button
              onClick={() => onNavigateToTab('repositories')}
              className="text-xs font-bold text-[#231c1a] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>Tüm Depolar</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Teknoloji Yığını & Çoklu Dil Dağılımı */}
        <div className="p-5 rounded-xl border border-[#a89997] bg-[#cdc1b5] space-y-3.5 shadow-xs">
          <div className="flex items-center justify-between border-b border-[#a89997] pb-3">
            <div className="flex items-center gap-2">
              <Code2 className="w-4 h-4 text-[#231c1a]" />
              <h3 className="text-xs font-bold text-[#231c1a]">Doğrulanmış Teknoloji Yığını</h3>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/15">
              Bayt Tabanlı Analiz
            </span>
          </div>

          <div className="space-y-2.5 pt-1">
            {topLanguages.length === 0 ? (
              <p className="text-xs text-[#6e5f5c] text-center py-4">Seçili depolarda dil telemetrisi hesaplanıyor...</p>
            ) : (
              topLanguages.map((lang, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-bold text-[#231c1a]">
                    <span>{lang.name}</span>
                    <span className="text-[#4a3e3b] font-medium">%{lang.percentage} ({lang.sizeKb.toLocaleString()} KB)</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-[#b9aba9]/40 overflow-hidden border border-[#231c1a]/10">
                    <div
                      className="h-full bg-[#f9b88e] rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.max(4, lang.percentage))}%` }}
                    />
                  </div>
                </div>
              ))
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
                <span className="flex items-center gap-1 font-medium text-[#4a3e3b]">
                  <Star className="w-3 h-3 text-[#231c1a]" />
                  <span>{repo.stargazers_count || 0} Star</span>
                </span>
                <span className="flex items-center gap-1 font-bold text-[#231c1a]">
                  <GitFork className="w-3 h-3 text-[#231c1a]" />
                  <span>{repo.forks_count || 0} Fork</span>
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
