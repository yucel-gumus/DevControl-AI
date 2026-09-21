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
  Code2,
} from 'lucide-react';
import { useDeveloperPersona } from '../hooks/useMetrics.js';
import { PRIORITY_TR_MAP } from '../constants.js';
import { ACTIVITY_WINDOW_DAYS } from '../../server/constants.js';
import { CHART_THEME } from '../theme.js';
import { formatDate, formatTrNumber, formatMeasuredCount } from '../utils/formatters.js';
import {
  ActivityData,
  Repository,
  EngineeringHealthScore,
  EngineeringRisk,
  FileHotspot,
  TodayBriefItem,
} from '../types.js';
import { ExplainWhyData } from './ExplainWhyModal.js';
import { ActiveTab } from './Sidebar.js';

const ActivityChart = React.lazy(() => import('./ActivityChart.js'));

/**
 * Grafik paketi çekilemediğinde uygulamayı ayakta tutar.
 *
 * `React.lazy` içe aktarması REDDEDİLİRSE (yeniden dağıtım sonrası eski chunk
 * 404'ü, kısa çevrimdışı pencere) Suspense sınırı bunu yakalayamaz: Suspense
 * yalnızca "henüz hazır değil" durumunu bekler, reddi yukarı taşır. Sınır
 * yoksa React 19 tüm kökü söker — kullanıcı için tek çıkış elle yeniden
 * yükleme olan boş bir sayfa kalırdı. Bu sınır yalnızca grafiği düşürür;
 * kartın geri kalanı ölçülmüş telemetriyi göstermeye devam eder.
 */
class ChartErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render(): React.ReactNode {
    if (this.state.failed) {
      return (
        <div className="h-full flex items-center justify-center text-xs text-[#4a3e3b] text-center">
          Grafik bileşeni yüklenemedi; diğer telemetri kartları bu durumdan etkilenmedi.
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Grafik paketini ilk boyamadan sonra, tarayıcı boştayken önceden çeker.
 *
 * `React.lazy` içe aktarması, Suspense sınırı ilk kez render edildiğinde
 * başlar; bu sınır da ancak aktivite isteği yanıtlandıktan sonra render edilir.
 * Ön yükleme olmadan iki istek sırayla beklenir: `/api/metrics/activity` → grafik
 * paketi (Recharts). Paket, ağ üzerindeki en büyük varlıktır; API isteğiyle
 * paralel çekildiğinde grafik, veri geldikten hemen sonra çizilir.
 * Aynı modül URL'i kullanıldığı için tarayıcı paketi bir kez indirir ve
 * `React.lazy` onu modül önbelleğinden anında çözer.
 */
function useActivityChartPreload(): void {
  React.useEffect(() => {
    const preload = () => {
      // Ön yükleme bir iyileştirmedir, gereklilik değil: paket çekilemezse
      // (yeniden dağıtım sonrası eski chunk, kısa çevrimdışı pencere) hata
      // yutulur. Yakalanmazsa `unhandledrejection` olarak raporlanır ve
      // uygulama hatası gibi görünür. Bu yakalama `React.lazy`nin kendi
      // içe aktarmasını KAPSAMAZ (ayrı bir modül sözü): grafik yine
      // gerektiğinde istenir ve reddedilirse ChartErrorBoundary devreye girer.
      void import('./ActivityChart.js').catch(() => undefined);
    };

    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(preload, { timeout: 2000 });
      return () => window.cancelIdleCallback(handle);
    }

    // `requestIdleCallback` desteklenmeyen tarayıcılarda (ör. eski Safari)
    // ilk boyamayı geciktirmeyen kısa bir gecikmeyle yine de ön yükle.
    const timer = window.setTimeout(preload, 200);
    return () => window.clearTimeout(timer);
  }, []);
}

interface Props {
  repositories: Repository[];
  healthScore: EngineeringHealthScore | null;
  risks: EngineeringRisk[];
  hotspots: FileHotspot[];
  dailyBrief: TodayBriefItem[];
  activityData?: ActivityData | null;
  dailyBriefLoading?: boolean;
  dailyBriefError?: string | null;
  activityLoading?: boolean;
  activityError?: string | null;
  healthError?: string | null;
  hotspotsError?: string | null;
  risksError?: string | null;
  /** Depo listesi isteği başarısızsa hata metni; boş listeyle karıştırılmaz. */
  reposError?: string | null;
  /**
   * KPI kartlarının ölçüm durumu — SORGU BAŞINA.
   *
   * Sürerken ilgili sayaç "0" basmaz: henüz alınmamış bir veriyi "hiç yok" diye
   * göstermek, ölçümsüz durumu ölçülmüş gibi sunardı (ölçüm dürüstlüğü kuralının
   * tek kaynağı: src/utils/formatters.ts). Bayrak tek bir ortak değer değil,
   * kartın okuduğu sorguya özeldir: dört sorgunun ortak bayrağı, biri hâlâ
   * uçuşta diye ÖLÇÜLMÜŞ bir kartı "--" gösterirdi (kuralın ters yönü: ölçülmüş
   * veri ölçümsüz gibi sunulamaz).
   */
  healthLoading?: boolean;
  reposLoading?: boolean;
  hotspotsLoading?: boolean;
  risksLoading?: boolean;
  onExplainWhy: (data: ExplainWhyData) => void;
  onSelectRepo: (repo: Repository) => void;
  onNavigateToTab: (tab: ActiveTab) => void;
}

interface KpiCardProps {
  label: string;
  icon: React.ReactNode;
  description: string;
  onActivate: () => void;
  children: React.ReactNode;
}

/**
 * KPI kartı. Gerçek bir `button` olarak render edilir; böylece klavye ile
 * odaklanabilir, Enter/Space ile tetiklenebilir ve ekran okuyucular tarafından
 * düğme olarak duyurulur (tıklanabilir bir `div` bu erişilebilirliği sağlamaz).
 *
 * Düğme içeriği yalnızca ifade (phrasing) öğelerinden kurulur: `button` içinde
 * `div`/`p` geçersiz bir içerik modelidir. Erişilebilir ad `aria-labelledby` ile
 * yalnızca etiket + değere bağlanır; açıklama (hatada ham hata cümlesi olabilir,
 * ör. "HTTP 502") `aria-describedby` ile ayrı duyurulur — aksi halde ad, kartın
 * tüm metniyle birlikte hata cümlesini de içerir ve düğmenin ne yaptığı
 * anlaşılmaz.
 */
const KpiCard: React.FC<KpiCardProps> = ({ label, icon, description, onActivate, children }) => {
  const labelId = React.useId();
  const valueId = React.useId();
  const descriptionId = React.useId();
  return (
    <button
      type="button"
      onClick={onActivate}
      aria-labelledby={`${labelId} ${valueId}`}
      aria-describedby={descriptionId}
      className="w-full text-left p-4 rounded-xl border border-[#a89997] bg-[#cdc1b5] hover:bg-[#cdc1b5]/80 transition-all cursor-pointer shadow-xs group focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#231c1a]"
    >
      <span className="flex items-center justify-between">
        <span id={labelId} className="text-xs font-bold text-[#4a3e3b]">{label}</span>
        <span className="p-1.5 rounded-lg bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/15 group-hover:scale-105 transition-transform inline-flex">
          {icon}
        </span>
      </span>
      <span id={valueId} className="mt-3 flex items-baseline gap-2">{children}</span>
      <span id={descriptionId} className="block text-[11px] mt-2 text-[#4a3e3b]">{description}</span>
    </button>
  );
};

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
  healthError = null,
  hotspotsError = null,
  risksError = null,
  reposError = null,
  healthLoading = false,
  reposLoading = false,
  hotspotsLoading = false,
  risksLoading = false,
  onExplainWhy,
  onSelectRepo,
  onNavigateToTab,
}) => {
  /**
   * Süzme, sıralama ve agrega işleri tek memo altında toplanır.
   *
   * Bileşen her durum güncellemesinde (ör. modal açılması) yeniden render
   * edilir; türetilen dizilerin her render'da yeni kimlik alması hem boşuna
   * iş yapar hem de ileride memo'lu bir alt bileşene verildiklerinde onu
   * gereksiz yere yeniden çizerdi. Girdiler değişmediğinde sonuç aynı kalır.
   */
  const { criticalRisks, criticalHotspots, activeRepos, topImpactRepos, topLanguages } = React.useMemo(() => {
    const criticalRisks = risks.filter((r) => r.severity === 'CRITICAL' || r.severity === 'HIGH');
    const criticalHotspots = hotspots.filter((h) => h.risk_level === 'CRITICAL' || h.risk_level === 'HIGH');
    const activeRepos = repositories.filter((r) => r.selected_for_analysis);

    // En Yüksek Etkili Odak Depolar (Son güncellemeye göre sıralı)
    //
    // Damgası okunamayan depolar için karşılaştırma NaN üretmemelidir: NaN
    // döndüren bir sıralayıcı V8'de öğeleri yerinde bırakır, yani liste ne
    // istenen ölçüte göre sıralanır ne de hata verir — sessizce yanlış bir
    // "en güncel depolar" sırası gösterilir. Ölçülemeyen tarih en eski sayılır.
    const repoRecency = (repo: Repository): number => {
      const timestamp = new Date(repo.pushed_at || repo.updated_at || '').getTime();
      return Number.isFinite(timestamp) ? timestamp : 0;
    };
    const candidateRepos = activeRepos.length > 0 ? activeRepos : repositories;
    const topImpactRepos = [...candidateRepos]
      .sort((a, b) => repoRecency(b) - repoRecency(a))
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

    return { criticalRisks, criticalHotspots, activeRepos, topImpactRepos, topLanguages };
  }, [repositories, risks, hotspots]);

  const hasHealthData = Boolean(healthScore?.hasData);

  // Grafik verisi her render'da yeniden kurulmaz: Recharts `data` referansı
  // değiştiğinde serileri baştan hesaplar, yani karttaki ilgisiz bir durum
  // güncellemesi (ör. modal açılması) grafiği yeniden çizerdi. Kırpma yok:
  // pencere sorgu penceresiyle aynıdır (`useActivityData(7)`) ve sunucu tam
  // olarak istenen gün sayısı kadar kova döner.
  //
  // `date` alanı burada string varsayılarak `split` ile biçimlendirilir; alan
  // eksik gelirse (kayıtlı anlık görüntü şema doğrulamasından geçse de kova
  // bazında boş olabilir) render sırasında atılan hata uygulamayı boş sayfaya
  // düşürürdü — hiçbir hata sınırı (error boundary) bu hatayı yakalamaz.
  // Bu yüzden bozuk kovalar atlanır, geçerli kovalar çizilmeye devam eder.
  const chartData = React.useMemo(
    () =>
      (Array.isArray(activityData?.timeSeries) ? activityData.timeSeries : [])
        .filter((point) => typeof point?.date === 'string')
        .map((point) => ({
          date: point.date.split('-').slice(1).join('/'),
          commits: point.commits,
          bugFixes: point.bugFixes,
        })),
    [activityData],
  );

  const { data: persona, isLoading: isPersonaLoading, error: personaError } = useDeveloperPersona();
  useActivityChartPreload();
  // Sunucu, modelin bildirmediği başlıklar için boş liste döndürür (uydurma
  // madde üretilmez); kartlar boş durumu açıkça gösterir.
  const superpowers = persona?.superpowers ?? [];
  const growthAreas = persona?.growthAreas ?? [];

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
                {/* Üretilemeyen kimlik için uydurma bir unvan gösterilmez
                    (bkz. README: sistemde sahte veri bulunmaz); üç durum ayrı
                    yazılır. */}
                {persona?.personaTitle || (isPersonaLoading
                  ? 'Geliştirici profili çıkarılıyor...'
                  : personaError
                    ? 'Profil üretilemedi'
                    : 'Telemetri bekleniyor')}
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
                {/* Ölçüm üretilemediğinde sunucu bunu açıkça belirten bir dize
                    üretir. `|| 'Ölçüm yok'` yalnızca alanı hiç taşımayan eski
                    önbellek kayıtları içindir; uydurulmuş bir değer değildir. */}
                <span>Hijyen: {persona.productivityMetrics.conventionalCommitHygiene || 'Ölçüm yok'}</span>
              </div>
              <div className="px-2.5 py-1 rounded-lg border border-[#a89997] bg-[#b9aba9]/40 text-xs font-bold text-[#231c1a] flex items-center gap-1.5">
                <span>Saatler: {persona.productivityMetrics.dominantWorkingHours || 'Ölçüm yok'}</span>
              </div>
            </div>
          )}
        </div>

        {/* Özet ve Çalışma Tarzı */}
        <p className="text-xs leading-relaxed text-[#4a3e3b] max-w-4xl font-medium">
          {persona?.summary || (isPersonaLoading
            // Kapsam İDDİASI yok: persona istemi telemetri penceresinin tamamını
            // (30 gün) ve seçili depoların mimarisini okur; buraya "son 7 gün"
            // yazmak, ölçümü olduğundan dar gösteren bir kapsam beyanı olurdu.
            ? 'Yapay zeka; commitlerinizi, repo mimarilerinizi ve kod pratiklerinizi analiz ediyor...'
            : personaError
              ? 'Geliştirici personası şu anda üretilemedi: yapay zeka uç noktasına ulaşılamadı. Diğer telemetri kartları bu durumdan etkilenmez.'
              : 'Yapay zeka personası henüz üretilmedi; GitHub telemetriniz eşitlendiğinde bu kart doldurulur.')}
        </p>

        {persona && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {/* Süper Güçler */}
            <div className="p-3.5 rounded-lg border border-[#a89997] bg-[#b9aba9]/30 space-y-2">
              <span className="text-xs font-bold text-[#231c1a] flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#231c1a]" />
                <span>Tespit Edilen Güçlü Yönler</span>
              </span>
              {superpowers.length === 0 ? (
                // Boş bir başlık listesi "bozuk kart" gibi görünür; sunucu artık
                // uydurma madde üretmediği için bu durum gerçekten oluşabilir.
                <p className="text-[11px] text-[#4a3e3b] font-medium">
                  Bu kapsamda tespit edilen güçlü yön bulunmuyor.
                </p>
              ) : (
                <ul className="space-y-1">
                  {superpowers.map((power, idx) => (
                    <li key={idx} className="text-xs text-[#4a3e3b] flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#231c1a] mt-1.5 shrink-0" />
                      <span className="font-medium">{power}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Büyüme & İyileştirme Alanları */}
            <div className="p-3.5 rounded-lg border border-[#a89997] bg-[#b9aba9]/30 space-y-2">
              <span className="text-xs font-bold text-[#231c1a] flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-[#231c1a]" />
                <span>Mühendislik Tavsiyeleri</span>
              </span>
              {growthAreas.length === 0 ? (
                <p className="text-[11px] text-[#4a3e3b] font-medium">
                  Bu kapsamda tespit edilen iyileştirme alanı bulunmuyor.
                </p>
              ) : (
                <ul className="space-y-1">
                  {growthAreas.map((area, idx) => (
                    <li key={idx} className="text-xs text-[#4a3e3b] flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#4a3e3b] mt-1.5 shrink-0" />
                      <span className="font-medium">{area}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Üst 4 KPI Metrik Kartı.
          İstek başarısız olduğunda sayı gösterilmez: sorgu hatasında elde kalan
          boş dizi "0 kritik dosya" diye basılırsa, hesabı temiz bir kullanıcıyla
          aynı görünür — ölçüm yokken ölçüm varmış gibi. Kart bu yüzden "--" ve
          nedeni (hata mesajı) gösterir. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Mühendislik Sağlığı"
          icon={<Activity className="w-4 h-4" />}
          description={healthError ?? 'Boyutsal ağırlıklı hesaplama'}
          onActivate={() => onNavigateToTab('hotspots')}
        >
          <span className="text-2xl font-extrabold text-[#231c1a] tracking-tight">
            {formatMeasuredCount(healthScore?.overallScore ?? 0, healthError, healthLoading || !hasHealthData)}
          </span>
          <span className="text-xs text-[#4a3e3b]">/ 100</span>
          <span className="ml-auto text-[11px] font-bold px-2 py-0.5 rounded bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/15">
            {healthError
              ? 'Veri Alınamadı'
              : healthLoading
                ? 'Ölçüm yükleniyor'
                : hasHealthData
                  ? `Seviye ${healthScore?.grade}${healthScore?.dataStatus === 'partial' ? ' · Kısmi' : ''}`
                  : 'Veri Yok'}
          </span>
        </KpiCard>

        <KpiCard
          label="Bağlı Depolar"
          icon={<FolderGit2 className="w-4 h-4" />}
          description={reposError ?? 'Telemetri analizi için seçili'}
          onActivate={() => onNavigateToTab('repositories')}
        >
          <span className="text-2xl font-extrabold text-[#231c1a] tracking-tight">
            {formatMeasuredCount(activeRepos.length, reposError, reposLoading)}
          </span>
          {/* Liste alınamadığında ya da henüz yüklenmediğinde "0 / 0 Aktif"
              yazmak, ölçülemeyen bir durumu "hiç deponuz yok" gibi gösterirdi;
              diğer KPI kartlarıyla aynı biçimde durum açıkça bildirilir. */}
          <span className="text-xs text-[#4a3e3b]">
            {reposError
              ? 'Veri Alınamadı'
              : reposLoading
                ? 'Ölçüm yükleniyor'
                : `/ ${repositories.length} Aktif`}
          </span>
        </KpiCard>

        <KpiCard
          label="Kritik Dosyalar"
          icon={<Flame className="w-4 h-4" />}
          description={hotspotsError ?? 'Yüksek oynaklık ve hata riski'}
          onActivate={() => onNavigateToTab('hotspots')}
        >
          <span className="text-2xl font-extrabold text-[#231c1a] tracking-tight">
            {formatMeasuredCount(hotspots.length, hotspotsError, hotspotsLoading)}
          </span>
          {!hotspotsError && !hotspotsLoading && criticalHotspots.length > 0 && (
            <span className="text-xs text-[#231c1a] font-bold">
              ({criticalHotspots.length} kritik)
            </span>
          )}
        </KpiCard>

        <KpiCard
          label="Tespit Edilen Riskler"
          icon={<AlertTriangle className="w-4 h-4" />}
          description={risksError ?? 'Kural motoru denetimleri'}
          onActivate={() => onNavigateToTab('hotspots')}
        >
          <span className="text-2xl font-extrabold text-[#231c1a] tracking-tight">
            {formatMeasuredCount(risks.length, risksError, risksLoading)}
          </span>
          {!risksError && !risksLoading && criticalRisks.length > 0 && (
            <span className="text-xs text-[#231c1a] font-bold">
              ({criticalRisks.length} yüksek)
            </span>
          )}
        </KpiCard>
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
                <p className="text-xs text-[#4a3e3b] py-6 text-center">
                  Bülten maddeleri hazırlanıyor...
                </p>
              ) : dailyBriefError ? (
                <p className="text-xs text-[#231c1a] py-4">
                  Bülten alınamadı: {dailyBriefError}
                </p>
              ) : dailyBrief.length === 0 ? (
                <p className="text-xs text-[#4a3e3b] py-6 text-center">
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
                    <div className="flex items-center justify-between pt-1 text-[11px] text-[#4a3e3b]">
                      <span className="truncate">{item.relatedRepo || 'Genel Platform'}</span>
                      <button
                        onClick={() =>
                          onExplainWhy({
                            title: item.title,
                            category: item.relatedRepo || 'Mühendislik Bülteni',
                            summary: item.description,
                            // Ölçülmemiş skor "0/100" olarak yazılmaz (bkz.
                            // ExplainWhyModal: tanımsız etki satırı hiç çizilmez).
                            // Sağlık telemetrisi yüklenmemişken buraya 0 yazmak,
                            // "Etki: 0/100" gibi ölçülmüş görünen bir değer üretirdi.
                            impactScore: healthScore?.hasData ? healthScore.overallScore : undefined,
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

        {/* Haftalık Hız Grafiği (pencere: ACTIVITY_WINDOW_DAYS) */}
        <div className="lg:col-span-2 p-5 rounded-xl border border-[#a89997] bg-[#cdc1b5] space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-[#a89997] pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#231c1a]" />
              <h3 className="text-xs font-bold text-[#231c1a]">
                Son {ACTIVITY_WINDOW_DAYS} Günlük Aktivite & Hız
              </h3>
            </div>
            <div className="flex items-center gap-4 text-xs">
              {/* Lejant renkleri grafikle tek kaynaktan (CHART_THEME) gelir: sabit
                  bir sınıf, seri rengi değiştiğinde lejantı sessizce ayrıştırır
                  ve okur hangi noktanın hangi seri olduğunu eşleyemez. */}
              <div className="flex items-center gap-1.5 text-[#4a3e3b] font-bold">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CHART_THEME.seriesPrimaryFill }} />
                <span>Commit Hızı</span>
              </div>
              <div className="flex items-center gap-1.5 text-[#4a3e3b] font-bold">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CHART_THEME.seriesSecondaryFill }} />
                <span>Hata Düzeltmeleri</span>
              </div>
            </div>
          </div>

          <div className="h-[300px] w-full pt-2">
            {activityLoading ? (
              <div className="h-full flex items-center justify-center text-xs text-[#4a3e3b]">
                Aktivite verisi yükleniyor...
              </div>
            ) : activityError ? (
              <div className="h-full flex items-center justify-center text-xs text-[#231c1a] text-center">
                Aktivite verisi alınamadı: {activityError}
              </div>
            ) : chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-[#4a3e3b] text-center">
                Son {ACTIVITY_WINDOW_DAYS} günde gösterilecek aktivite bulunmuyor.
              </div>
            ) : (
              <ChartErrorBoundary>
                <React.Suspense
                  fallback={
                    <div className="h-full flex items-center justify-center text-xs text-[#4a3e3b] animate-pulse">
                      Grafik bileşeni yükleniyor...
                    </div>
                  }
                >
                  <ActivityChart chartData={chartData} />
                </React.Suspense>
              </ChartErrorBoundary>
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
              {/* Boş liste ölçüm YOKLUĞUDUR, "proje yok" değil: istek
                  başarısızsa ya da ilk yükleme sürüyorsa kullanıcıya hesabının
                  boş olduğu izlenimi verilmez (bkz. formatMeasuredCount). */}
              {topImpactRepos.length === 0 ? (
                <p className="text-xs text-[#4a3e3b] text-center py-6">
                  {reposError
                    ? 'Depo telemetrisi alınamadığı için odak depolar hesaplanamadı.'
                    : reposLoading
                      ? 'Ölçüm yükleniyor'
                      : 'Aktif proje bulunamadı.'}
                </p>
              ) : (
                topImpactRepos.map((repo) => (
                  <button
                    key={repo.id}
                    type="button"
                    onClick={() => onSelectRepo(repo)}
                    className="w-full text-left p-2.5 rounded-lg border border-[#a89997] bg-[#b9aba9]/25 hover:bg-[#b9aba9]/45 transition-all flex items-center justify-between gap-3 cursor-pointer group shadow-2xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#231c1a]"
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
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="pt-2 border-t border-[#a89997] flex items-center justify-between">
            <span className="text-[11px] text-[#4a3e3b] font-medium">
              {/* Hata önce gelir: başarısız bir istek, başka bir sorgu hâlâ
                  beklerken "yükleniyor" diye gösterilirse kullanıcı hiç
                  gelmeyecek bir sonucu bekler (aynı sıra ölçüm rozetlerinde de
                  geçerlidir, bkz. formatMeasuredCount çağrıları). */}
              {reposError
                ? 'Depo telemetrisi alınamadı'
                : reposLoading
                  ? 'Depo telemetrisi yükleniyor'
                  : `Toplam ${repositories.length} depo izleniyor (${activeRepos.length} aktif seçili)`}
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
            {/* "Hesaplanıyor..." METİN SABİTİ olamaz: istek başarısız olduğunda
                da süren bir işlem izlenimi verir ve kullanıcı hiç gelmeyecek
                bir sonucu bekler. Durum, kartın altbilgisiyle aynı sırayla
                (hata → yükleniyor → boş) bildirilir. */}
            {topLanguages.length === 0 ? (
              <p className="text-xs text-[#4a3e3b] text-center py-4">
                {reposError
                  ? 'Dil telemetrisi alınamadı.'
                  : reposLoading
                    ? 'Ölçüm yükleniyor'
                    : 'Seçili depolarda dil telemetrisi bulunmuyor.'}
              </p>
            ) : (
              topLanguages.map((lang, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-bold text-[#231c1a]">
                    <span>{lang.name}</span>
                    <span className="text-[#4a3e3b] font-medium">%{lang.percentage} ({formatTrNumber(lang.sizeKb)} KB)</span>
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
            <button
              key={repo.id}
              type="button"
              onClick={() => onSelectRepo(repo)}
              className="w-full text-left p-3.5 rounded-lg border border-[#a89997] bg-[#b9aba9]/30 hover:bg-[#b9aba9]/50 transition-all cursor-pointer shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#231c1a]"
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
              <div className="flex items-center justify-between mt-3 pt-2 border-t border-[#a89997] text-[11px] text-[#4a3e3b]">
                <span className="flex items-center gap-1 font-medium text-[#4a3e3b]">
                  <Star className="w-3 h-3 text-[#231c1a]" />
                  <span>{repo.stargazers_count || 0} Star</span>
                </span>
                <span className="flex items-center gap-1 font-bold text-[#231c1a]">
                  <GitFork className="w-3 h-3 text-[#231c1a]" />
                  <span>{repo.forks_count || 0} Fork</span>
                </span>
              </div>
            </button>
          ))}
          {/* Bir bağlantı YÖNLENDİRMESİ ("önce depolarınızı bağlayın") yalnızca
              gerçekten depo yokken doğrudur; istek başarısızken ya da yükleme
              sürerken kullanıcıyı olmayan bir eksiği gidermeye göndermek
              ölçümsüz durumu yanlış teşhis ettirirdi. */}
          {repositories.length === 0 && (
            <p className="col-span-full text-xs text-[#4a3e3b] text-center py-6">
              {reposError
                ? 'Depo telemetrisi alınamadı; sağlık matrisi hesaplanamadı.'
                : reposLoading
                  ? 'Ölçüm yükleniyor'
                  : 'Depo sağlık matrisini görmek için önce kişisel GitHub depolarınızı bağlayın.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
