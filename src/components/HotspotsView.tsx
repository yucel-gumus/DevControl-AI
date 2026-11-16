import React, { useMemo, useRef, useState } from 'react';
import {
  FileCode,
  GitCommit,
  Clock,
  Bug,
  HelpCircle,
  ShieldAlert,
  Activity,
  Sparkles,
  Brain,
  Code,
  X,
  AlertCircle,
} from 'lucide-react';
import { FileHotspot, EngineeringRisk, EngineeringHealthScore, HealthScoreDimensions, HotspotRefactorRecommendation } from '../types.js';
import { ExplainWhyData } from './ExplainWhyModal.js';
import { useHotspotRefactor, HOTSPOT_REFACTOR_MUTATION_KEY } from '../hooks/useMetrics.js';
import { useModalA11y } from '../hooks/useModalA11y.js';
import { useIsMutating } from '@tanstack/react-query';
import { HEALTH_DIMENSION_LABELS, RISK_TR_MAP, describeRiskScope } from '../constants.js';
import { getSeverityBadgeClass } from '../theme.js';
import {
  formatTrNumber,
  formatDate,
  formatMeasuredText,
  formatMeasuredCount,
} from '../utils/formatters.js';

interface Props {
  hotspots: FileHotspot[];
  risks?: EngineeringRisk[];
  healthScore?: EngineeringHealthScore | null;
  /** Risk isteği başarısızsa hata metni; "risk yok" sonucundan ayrılır. */
  risksError?: string | null;
  /** Hotspot isteği başarısızsa hata metni; "kritik dosya yok" sonucundan ayrılır. */
  hotspotsError?: string | null;
  /**
   * Görünümün okuduğu İKİ telemetri kaynağının ilk yükleme bayrakları.
   *
   * Yüklenirken sayaçlar "0" yerine "yükleniyor" gösterir: yazılan bir sıfır
   * ölçülmüş sonuç gibi okunurdu. Bayraklar SORGU BAŞINADIR ve her sayaç
   * kendi kaynağının bayrağını kullanır: iki kaynağın ortak bir bayrağı, biri
   * hâlâ uçuşta (ya da hatadan sonra yeniden deneniyor) diye ÖLÇÜLMÜŞ bir
   * sayacı "--" gösterirdi — ölçüm dürüstlüğü kuralının ters yönü: ölçülmüş
   * veri ölçümsüz gibi sunulamaz (bkz. App.tsx -> queryUnmeasured). Yalnızca
   * İKİ kaynağı birden toplayan tek bir sayaç ("Tümü") iki bayrağı OR'lar.
   * Bayraklar, görünümün okumadığı sorguların durumunu İÇERMEZ.
   */
  hotspotsLoading?: boolean;
  risksLoading?: boolean;
  onExplainWhy: (data: ExplainWhyData) => void;
  onAskAboutFile: (path: string, repo: string) => void;
}

export const HotspotsView: React.FC<Props> = ({
  hotspots = [],
  risks = [],
  healthScore,
  risksError = null,
  hotspotsError = null,
  hotspotsLoading = false,
  risksLoading = false,
  onExplainWhy,
  onAskAboutFile,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'all' | 'hotspots' | 'risks'>('all');
  const [filterRisk, setFilterRisk] = useState<string>('ALL');

  // AI Refactor Modal Durumu
  const [activeHotspotForRefactor, setActiveHotspotForRefactor] = useState<{ path: string; repo: string } | null>(null);
  const [refactorData, setRefactorData] = useState<HotspotRefactorRecommendation | null>(null);
  const hotspotRefactorMutation = useHotspotRefactor();

  // Aynı anda yalnızca tek bir istek anlamlıdır: kullanıcı modalı kapatıp başka
  // bir dosya için istem başlatırsa, geç dönen eski yanıt yeni dosyanın planı
  // gibi görünmemelidir. Bu yüzden her istek artan bir sıra numarası alır ve
  // yanıt yalnızca **en son** isteğe aitse uygulanır. İstek kimliğini
  // {path, repo} ile karşılaştırmak yetmezdi: aynı dosya için ikinci istek
  // başlatıldığında (modal kapatılıp yeniden açılsa bile) geç gelen eski yanıt
  // da eşleşir ve taze planın üzerine yazardı (bkz. RepositoriesView, useAskAi).
  const refactorRequestRef = useRef(0);

  const closeRefactorModal = () => {
    // Modal kapandığında sayaç ilerletilir: kapanıştan sonra dönen bir yanıt
    // artık güncel sayılmaz ve açık olmayan bir modalın planı olarak uygulanmaz.
    refactorRequestRef.current += 1;
    setActiveHotspotForRefactor(null);
    setRefactorData(null);
  };
  const refactorDialogRef = useModalA11y(Boolean(activeHotspotForRefactor), closeRefactorModal);

  /**
   * Uçuştaki refactor isteği KÜRESEL olarak okunur (bkz. RepositoriesView):
   * bileşen sökülüp yeniden kurulduğunda yerel `isPending` sıfırlanır ve aynı
   * dosya için ikinci bir faturalanan üretim başlatılabilirdi.
   */
  const isRefactorInFlight = useIsMutating({ mutationKey: HOTSPOT_REFACTOR_MUTATION_KEY }) > 0;

  const handleTriggerRefactor = async (path: string, repo: string) => {
    // Uçuşta bir istek varken ikinci kez tetiklemek sunucuda ikinci bir yapay
    // zeka üretimi (faturalanan çağrı) başlatır; istek yok sayılır.
    if (isRefactorInFlight) return;
    const requestId = ++refactorRequestRef.current;
    setActiveHotspotForRefactor({ path, repo });
    setRefactorData(null);
    try {
      const res = await hotspotRefactorMutation.mutateAsync({ filePath: path, repoName: repo });
      if (refactorRequestRef.current === requestId) {
        setRefactorData(res);
      }
    } catch (err) {
      if (refactorRequestRef.current === requestId) {
        console.error('Refactor önerisi alınamadı:', err);
      }
    }
  };

  const safeHotspots = Array.isArray(hotspots) ? hotspots : [];
  const safeRisks = Array.isArray(risks) ? risks : [];

  // Türev listeler yalnızca girdileri değiştiğinde yeniden hesaplanır: görünüm,
  // her telemetri sorgusunun durum geçişinde (yükleniyor -> başarılı) yeniden
  // render edilir ve bu türevlerin her seferinde tüm hotspot listesi üzerinde
  // yeniden gezinmesi gerekmez.
  const { criticalHotspots, bugFixHotspots, totalHotspotChurn } = useMemo(
    () => ({
      criticalHotspots: safeHotspots.filter((h) => h.risk_level === 'CRITICAL'),
      bugFixHotspots: safeHotspots.filter((h) => (h.bug_fix_commits_count ?? 0) > 0),
      totalHotspotChurn: safeHotspots.reduce((acc, h) => acc + (h.code_churn || 0), 0),
    }),
    [safeHotspots],
  );

  const filteredHotspots = useMemo(
    () => safeHotspots.filter((h) => filterRisk === 'ALL' || h.risk_level === filterRisk),
    [safeHotspots, filterRisk],
  );

  /**
   * Ölçülmemiş bir sayı "0" olarak yazılmaz: istek sürerken ya da
   * başarısızken yazılan sıfır, ölçülmüş bir sonuç gibi okunur ("risk yok" /
   * "kritik dosya yok"). Üç durum üç ayrı cümleyle anılır. KPI şeridi tam
   * cümle kurar (`measuredValue`), sekme ve bölüm başlıkları yalnızca sayaç
   * gösterir (`measuredCount`). Kuralın kendisi tek kaynakta
   * (bkz. formatters.formatMeasuredText/Count); burada yalnızca sayacın
   * KAYNAĞININ yükleme bayrağı bağlanır.
   */
  const measuredValue = (value: string, error: string | null, loading: boolean): string =>
    formatMeasuredText(value, error, loading);
  const measuredCount = (count: number, error: string | null, loading: boolean): string =>
    formatMeasuredCount(count, error, loading);
  /** İki kaynağı birden toplayan sayaç, ancak İKİSİ de ölçülünce ölçülmüştür. */
  const bothSourcesLoading = hotspotsLoading || risksLoading;
  const bothSourcesError = hotspotsError || risksError;

  /**
   * Sağlık boyutunun mini özet girdisi. Boyut ölçülmemişse değeri `0` olsa da
   * "0/100" yazılmaz: o sıfır ölçüm sonucu değil, ölçüm yokluğudur (bkz.
   * formatMeasuredCount ile aynı kural).
   */
  const measuredDimension = (dimension: keyof HealthScoreDimensions): string => {
    if (!healthScore?.hasData) return '--';
    if (!healthScore.measuredDimensions?.includes(dimension)) return '--';
    return `${healthScore.dimensions[dimension]}/100`;
  };

  return (
    <div id="hotspots-view" className="space-y-6 font-sans text-[#253341]">
      {/* Başlık ve Boyut Dağılımı */}
      <div className="p-5 rounded-xl border border-[#BCC7D2] bg-[#DCE3EA] flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#F2A488] text-[#253341] border border-[#EC7D55]">
              Kod Kalitesi & Risk Radarı
            </span>
          </div>
          <h2 className="text-base font-bold text-[#253341] mt-1 tracking-tight">
            Kritik Dosyalar ve Mimari Risk Merkezi
          </h2>
          <p className="text-xs mt-1 text-[#3E5164] max-w-2xl leading-relaxed font-medium">
            Kod dalgalanması yüksek olan kaynak dosyalarını, inceleme bekleyen PR darboğazlarını ve mimari riskleri tek bir merkezden yönetin.
          </p>
        </div>

        {/* Sağlık Boyutları Mini Özeti.
            Boyut başına "ölçüldü mü?" sorusu `measuredDimensions` ile yanıtlanır:
            ölçülmemiş bir boyutun değeri de `0`'dır ve `hasData` tek başına
            "ölçüldü, sıfır çıktı" ile "hiç ölçülmedi"yi ayırmaz (bkz.
            src/types.ts -> EngineeringHealthScore.measuredDimensions). */}
        {healthScore && (
          <div className="flex items-center gap-3 p-2.5 rounded-lg border border-[#BCC7D2] bg-[#EDF3EE] shadow-xs">
            <div className="text-center px-2">
              <span className="text-[10px] block text-[#3E5164] font-bold">{HEALTH_DIMENSION_LABELS.codeHealth}</span>
              <span className="text-xs font-bold text-[#253341]">
                {measuredDimension('codeHealth')}
              </span>
            </div>
            <div className="w-px h-6 bg-[#BCC7D2]" />
            <div className="text-center px-2">
              <span className="text-[10px] block text-[#3E5164] font-bold">{HEALTH_DIMENSION_LABELS.delivery}</span>
              <span className="text-xs font-bold text-[#253341]">
                {measuredDimension('delivery')}
              </span>
            </div>
            <div className="w-px h-6 bg-[#BCC7D2]" />
            <div className="text-center px-2">
              <span className="text-[10px] block text-[#3E5164] font-bold">{HEALTH_DIMENSION_LABELS.documentation}</span>
              <span className="text-xs font-bold text-[#253341]">
                {measuredDimension('documentation')}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Mimari Radar KPI Şeridi */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl border border-[#BCC7D2] bg-[#DCE3EA] flex items-center gap-3 shadow-xs">
          <div className="p-2.5 rounded-lg bg-[#DBE6DD] text-[#253341] border border-[#BCC7D2]">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] block text-[#3E5164] font-bold uppercase tracking-wider">Aktif Darboğaz</span>
            {/* İstek başarısızsa ya da ölçüm hâlâ sürüyorsa "0 risk" yazılmaz:
                bu bir ölçüm değil, eksik veridir ve "risk yok" diye okunurdu. */}
            <span className="text-sm font-bold text-[#253341]">
              {measuredValue(`${safeRisks.length} Mimari Risk`, risksError, risksLoading)}
            </span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-[#BCC7D2] bg-[#DCE3EA] flex items-center gap-3 shadow-xs">
          <div className="p-2.5 rounded-lg bg-[#F2A488] text-[#253341] border border-[#EC7D55]">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] block text-[#3E5164] font-bold uppercase tracking-wider">Kritik Sıcak Nokta</span>
            <span className="text-sm font-bold text-[#253341]">
              {measuredValue(`${criticalHotspots.length} Acil Modül`, hotspotsError, hotspotsLoading)}
            </span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-[#BCC7D2] bg-[#DCE3EA] flex items-center gap-3 shadow-xs">
          <div className="p-2.5 rounded-lg bg-[#DBE6DD] text-[#253341] border border-[#BCC7D2]">
            <Bug className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] block text-[#3E5164] font-bold uppercase tracking-wider">Hata Odağı Dosya</span>
            <span className="text-sm font-bold text-[#253341]">
              {measuredValue(`${bugFixHotspots.length} Regresyon Riski`, hotspotsError, hotspotsLoading)}
            </span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-[#BCC7D2] bg-[#DCE3EA] flex items-center gap-3 shadow-xs">
          <div className="p-2.5 rounded-lg bg-[#DBE6DD] text-[#253341] border border-[#BCC7D2]">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] block text-[#3E5164] font-bold uppercase tracking-wider">Kod Dalgalanması</span>
            <span className="text-sm font-bold text-[#253341]">
              {measuredValue(`${formatTrNumber(totalHotspotChurn)} Satır`, hotspotsError, hotspotsLoading)}
            </span>
          </div>
        </div>
      </div>

      {/* Alt Sekme & Filtre Kontrolleri */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        {/* Görünüm Seçimi (Segmented Control) */}
        <div className="flex items-center gap-1 p-1 rounded-lg border border-[#BCC7D2] bg-[#DCE3EA]">
          {/* `aria-pressed`: etkin sekme yalnızca arka plan rengiyle ayırt
              ediliyor; ekran okuyucu kullanıcısı için basılı durumu bildiren
              tek kanal bu özniteliktir (renk tek başına yeterli değildir,
              WCAG 1.4.1). */}
          <button
            type="button"
            aria-pressed={activeSubTab === 'all'}
            onClick={() => setActiveSubTab('all')}
            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors cursor-pointer ${activeSubTab === 'all'
              ? 'bg-[#EC7D55] text-[#253341] border border-[#AB421C] shadow-xs'
              : 'text-[#3E5164] hover:text-[#253341] hover:bg-[#DBE6DD]'
              }`}
          >
            Tümü ({measuredCount(safeHotspots.length + safeRisks.length, bothSourcesError, bothSourcesLoading)})
          </button>
          <button
            type="button"
            aria-pressed={activeSubTab === 'hotspots'}
            onClick={() => setActiveSubTab('hotspots')}
            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors cursor-pointer ${activeSubTab === 'hotspots'
              ? 'bg-[#EC7D55] text-[#253341] border border-[#AB421C] shadow-xs'
              : 'text-[#3E5164] hover:text-[#253341] hover:bg-[#DBE6DD]'
              }`}
          >
            Kritik Dosyalar ({measuredCount(safeHotspots.length, hotspotsError, hotspotsLoading)})
          </button>
          <button
            type="button"
            aria-pressed={activeSubTab === 'risks'}
            onClick={() => setActiveSubTab('risks')}
            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors cursor-pointer ${activeSubTab === 'risks'
              ? 'bg-[#EC7D55] text-[#253341] border border-[#AB421C] shadow-xs'
              : 'text-[#3E5164] hover:text-[#253341] hover:bg-[#DBE6DD]'
              }`}
          >
            Riskler ({measuredCount(safeRisks.length, risksError, risksLoading)})
          </button>
        </div>

        {/* Risk Seviyesi Filtresi */}
        {activeSubTab !== 'risks' && (
          <div className="flex items-center gap-1 p-1 rounded-lg border border-[#BCC7D2] bg-[#DCE3EA]">
            {[
              { id: 'ALL', label: 'Tümü' },
              { id: 'CRITICAL', label: 'Kritik' },
              { id: 'HIGH', label: 'Yüksek' },
              { id: 'MEDIUM', label: 'Orta' },
              { id: 'LOW', label: 'Düşük' },
            ].map((lvl) => (
              <button
                key={lvl.id}
                type="button"
                aria-pressed={filterRisk === lvl.id}
                onClick={() => setFilterRisk(lvl.id)}
                className={`px-2.5 py-1 text-[11px] font-bold rounded transition-colors cursor-pointer ${filterRisk === lvl.id
                  ? 'bg-[#EC7D55] text-[#253341] border border-[#AB421C] shadow-xs'
                  : 'text-[#3E5164] hover:text-[#253341] hover:bg-[#DBE6DD]'
                  }`}
              >
                {lvl.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 1. Mühendislik Riskleri Bölümü.
          "Riskler" alt sekmesinde liste boş olsa da bölüm gösterilir; aksi
          hâlde sekme tamamen boş bir sayfa açardı ve kullanıcı "yükleniyor mu,
          istek mi başarısız, gerçekten risk yok mu" ayrımını yapamazdı.
          "Tümü" görünümünde ise boş risk bölümü gizlenir (kritik dosyalar
          zaten listelenir). */}
      {(activeSubTab === 'risks' || (activeSubTab === 'all' && safeRisks.length > 0)) && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-[#253341]" />
            <h3 className="text-xs font-bold text-[#253341]">
              Aktif Mühendislik Riskleri & Darboğazlar ({measuredCount(safeRisks.length, risksError, risksLoading)})
            </h3>
          </div>

          {safeRisks.length === 0 && (
            <div className="p-8 rounded-xl border border-[#BCC7D2] bg-[#DCE3EA] text-center text-xs text-[#3E5164]">
              {/* "Denetim yapıldı, risk yok" ile "denetim tamamlanamadı" ayrı
                  cümlelerdir: başarısız bir istekte "risk tespit edilmedi"
                  demek, ölçülmemiş bir sonucu ölçüm gibi sunardı. Süren bir
                  denetim için de aynısı geçerlidir: boş liste "risk yok"
                  değil, "henüz ölçülmedi" demektir. */}
              {risksError
                ? `Risk denetimi tamamlanamadı: ${risksError} Bu bir "risk yok" sonucu değildir.`
                : risksLoading
                  ? 'Risk denetimi sürüyor; sonuçlar alındığında burada listelenecek.'
                  : 'Seçili depolar için çalıştırılan kural motoru denetimlerinde risk tespit edilmedi.'}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {safeRisks.map((risk, rIdx) => (
              <div
                key={rIdx}
                className="p-4 rounded-xl border border-[#BCC7D2] bg-[#DCE3EA] hover:bg-[#DBE6DD] transition-colors flex flex-col justify-between gap-3 shadow-xs"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-[#EDF3EE] text-[#253341] border border-[#BCC7D2] font-bold">
                      {describeRiskScope(risk)}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${getSeverityBadgeClass(risk.severity)}`}>
                      {RISK_TR_MAP[risk.severity] || risk.severity}
                    </span>
                  </div>

                  <h4 className="text-xs font-bold text-[#253341]">
                    {risk.title}
                  </h4>
                  <p className="text-xs text-[#3E5164] leading-relaxed font-medium">
                    {risk.summary}
                  </p>
                </div>

                <div className="pt-2 border-t border-[#BCC7D2] flex items-center justify-between gap-2">
                  <span className="text-[11px] text-[#3E5164] truncate font-medium">
                    {risk.recommendedAction}
                  </span>
                  <button
                    onClick={() =>
                      onExplainWhy({
                        title: risk.title,
                        category: describeRiskScope(risk),
                        summary: risk.summary,
                        confidence: risk.confidence,
                        evidence: Array.isArray(risk.evidence)
                          ? risk.evidence.map((e: any) =>
                            typeof e === 'string'
                              ? e
                              : `${e.metric}: ${e.value}${e.description ? ` — ${e.description}` : ''}`
                          )
                          : [],
                        recommendedAction: risk.recommendedAction,
                      })
                    }
                    className="px-2.5 py-1 text-xs font-bold rounded-lg bg-[#EC7D55] border border-[#AB421C] text-[#253341] hover:bg-[#AB421C] hover:text-[#F5F9F5] transition-colors shrink-0 cursor-pointer shadow-xs"
                  >
                    Detay
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. Kritik Dosyalar Listesi Bölümü */}
      {(activeSubTab === 'all' || activeSubTab === 'hotspots') && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <FileCode className="w-4 h-4 text-[#253341]" />
            <h3 className="text-xs font-bold text-[#253341]">
              Kritik Kod Dosyaları ({measuredCount(filteredHotspots.length, hotspotsError, hotspotsLoading)})
            </h3>
          </div>

          <div className="space-y-3">
            {filteredHotspots.length === 0 ? (
              <div className="p-8 rounded-xl border border-[#BCC7D2] bg-[#DCE3EA] text-center text-xs text-[#3E5164]">
                {/* "Ölçüldü, kritik dosya yok" ile "ölçüm tamamlanamadı" ayrı
                    cümlelerdir (bkz. risk listesi): başarısız bir istekte
                    "bulunamadı" demek, ölçülmemiş bir sonucu ölçüm gibi
                    sunardı. Aynı ayrım süren bir ölçüm için de geçerlidir. */}
                {hotspotsError
                  ? `Hotspot analizi tamamlanamadı: ${hotspotsError} Bu bir "kritik dosya yok" sonucu değildir.`
                  : hotspotsLoading
                    ? 'Hotspot analizi sürüyor; sonuçlar alındığında burada listelenecek.'
                    : 'Seçilen filtrede kritik dosya bulunamadı.'}
              </div>
            ) : (
              filteredHotspots.map((hotspot, idx) => {
                const modificationsCount = hotspot.modifications_count ?? 0;
                const bugFixesCount = hotspot.bug_fix_commits_count ?? 0;
                const codeChurn = hotspot.code_churn ?? 0;
                const avgChurnPerCommit = hotspot.avg_churn_per_commit ?? (modificationsCount > 0 ? Math.round(codeChurn / modificationsCount) : 0);
                const confidenceScore = hotspot.confidence ?? 0;
                const bugFixRatio = modificationsCount > 0 ? Math.round((bugFixesCount / modificationsCount) * 100) : 0;

                const evidenceList = Array.isArray(hotspot.evidence) && hotspot.evidence.length > 0
                  ? hotspot.evidence.map((e) => `${e.metric}: ${e.value} - ${e.description}`)
                  : [
                    `Son dönemde ${formatTrNumber(codeChurn)} satır kod dalgalanması gerçekleşti (Ortalama ~${avgChurnPerCommit} satır/commit).`,
                    `Son düzenleme ${formatDate(hotspot.last_modified) || 'yakın zamanda'} tarihinde yapıldı.`,
                    bugFixesCount > 0
                      ? `Hata düzeltme oranı %${bugFixRatio} seviyesinde (${bugFixesCount} düzeltme).`
                      : 'Bu modülde henüz hata düzeltmesi yaşanmadı (Stabil modül).',
                  ];

                const actionPlanList = hotspot.recommendation
                  ? [
                    hotspot.recommendation,
                    'Kapsamlı birim ve entegrasyon testleri ekleyerek regresyon riskini düşürün.',
                  ]
                  : [
                    'Dosyayı daha küçük, odaklanmış modüllere bölün (Single Responsibility).',
                    'Kapsamlı birim ve entegrasyon testleri ekleyerek regresyon riskini düşürün.',
                  ];

                return (
                  <div
                    key={idx}
                    className="p-4 rounded-xl border border-[#BCC7D2] bg-[#DCE3EA] hover:bg-[#DBE6DD]/60 transition-colors space-y-3 shadow-xs"
                  >
                    {/* Üst Satır: Dosya Yolu & Eylemler */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 rounded-lg bg-[#EDF3EE] border border-[#BCC7D2] text-[#253341] shrink-0">
                          <FileCode className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-[#EDF3EE] text-[#253341] border border-[#BCC7D2] font-bold">
                              {hotspot.repo_name}
                            </span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${getSeverityBadgeClass(hotspot.risk_level)}`}>
                              {RISK_TR_MAP[hotspot.risk_level] || hotspot.risk_level} Risk
                            </span>
                            {bugFixesCount > 0 && (
                              <span
                                className="text-[10px] font-bold px-2 py-0.5 rounded border border-[#EC7D55] bg-[#F2A488] text-[#253341] flex items-center gap-1 shrink-0"
                                title={`${bugFixesCount} adet hata düzeltmesi (${modificationsCount > 0 ? `%${bugFixRatio}` : ''})`}
                              >
                                <Bug className="w-2.5 h-2.5" />
                                <span>{bugFixesCount} Hata Çözümü</span>
                              </span>
                            )}
                            <span className="text-[10px] font-mono text-[#3E5164] font-medium px-1.5 py-0.5 rounded bg-[#DBE6DD] border border-[#BCC7D2]">
                              {hotspot.language}
                            </span>
                          </div>
                          <span className="font-mono text-xs font-bold text-[#253341] block mt-1 truncate">
                            {hotspot.path}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
                        <button
                          onClick={() => handleTriggerRefactor(hotspot.path, hotspot.repo_name)}
                          disabled={isRefactorInFlight}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#EC7D55] text-[#253341] hover:bg-[#AB421C] hover:text-[#F5F9F5] transition-colors cursor-pointer border border-[#AB421C] shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
                          title={
                            isRefactorInFlight
                              ? 'Bir refactor isteği sürüyor; tamamlanınca yeniden deneyebilirsiniz'
                              : 'Gemini ile mimari refactoring planı al'
                          }
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Refactor</span>
                        </button>

                        <button
                          onClick={() =>
                            onExplainWhy({
                              title: `${hotspot.path} Neden Kritik Dosya?`,
                              category: hotspot.repo_name,
                              summary: bugFixesCount > 0
                                ? `${modificationsCount} commit ve ${bugFixesCount} hata düzeltmesi ile yüksek oynaklık skoruna sahip (Ortalama ~${avgChurnPerCommit} satır/commit).`
                                : `${modificationsCount} commit ile aktif kaynak dosya oynaklığına sahip (Ortalama ~${avgChurnPerCommit} satır/commit).`,
                              impactScore: confidenceScore,
                              evidence: evidenceList,
                              actionPlan: actionPlanList,
                            })
                          }
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-[#EDF3EE] border border-[#BCC7D2] text-[#253341] hover:bg-[#DBE6DD] transition-colors cursor-pointer shadow-xs"
                        >
                          <HelpCircle className="w-3.5 h-3.5 text-[#253341]" />
                          <span>Neden?</span>
                        </button>

                        <button
                          onClick={() => onAskAboutFile(hotspot.path, hotspot.repo_name)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-[#EDF3EE] border border-[#BCC7D2] text-[#253341] hover:bg-[#DBE6DD] transition-colors cursor-pointer shadow-xs"
                        >
                          Kensai
                        </button>
                      </div>
                    </div>

                    {/* Mimari Teşhis & Eylem Tavsiyesi (Doğrudan Kart Üzerinde) */}
                    <div className="p-3 rounded-lg bg-[#EDF3EE] border border-[#BCC7D2] space-y-1">
                      <div className="flex items-center gap-1.5 text-[#253341] font-bold text-[11px]">
                        <Brain className="w-3.5 h-3.5 text-[#253341]" />
                        <span>Mimari Teşhis & Eylem Tavsiyesi</span>
                      </div>
                      <p className="text-xs text-[#3E5164] leading-relaxed font-medium">
                        {hotspot.recommendation}
                      </p>
                    </div>

                    {/* Metrik Rozetleri Izgarası */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-0.5">
                      <div className="p-2 rounded-lg bg-[#EDF3EE] border border-[#BCC7D2] flex items-center gap-2">
                        <GitCommit className="w-3.5 h-3.5 text-[#3E5164]" />
                        <div>
                          <span className="text-[10px] block text-[#3E5164] font-bold">Değişim Sıklığı</span>
                          <span className="text-xs font-bold text-[#253341]">{modificationsCount} Commit</span>
                        </div>
                      </div>

                      <div
                        className="p-2 rounded-lg bg-[#EDF3EE] border border-[#BCC7D2] flex items-center gap-2"
                        title={`Toplam ${formatTrNumber(codeChurn)} satır dalgalanma (Commit başına ort. ~${avgChurnPerCommit} satır)`}
                      >
                        <Activity className="w-3.5 h-3.5 text-[#3E5164]" />
                        <div className="min-w-0">
                          <span className="text-[10px] block text-[#3E5164] font-bold">Kod Dalgalanması</span>
                          <span className="text-xs font-bold text-[#253341] truncate block">
                            {formatTrNumber(codeChurn)} satır (~{avgChurnPerCommit}/commit)
                          </span>
                        </div>
                      </div>

                      <div className="p-2 rounded-lg bg-[#EDF3EE] border border-[#BCC7D2] flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-[#3E5164]" />
                        <div>
                          <span className="text-[10px] block text-[#3E5164] font-bold">Son Düzenleme</span>
                          <span className="text-xs font-bold text-[#253341]">
                            {hotspot.last_modified ? formatDate(hotspot.last_modified) : 'Kayıt yok'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 3. Yapay Zeka Refactoring Önerisi Modalı */}
      {activeHotspotForRefactor && (
        <div
          ref={refactorDialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="hotspot-refactor-title"
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
                  <span id="hotspot-refactor-title" className="text-xs font-bold font-mono text-[#253341]">
                    {activeHotspotForRefactor.path}
                  </span>
                  <span className="text-[11px] text-[#3E5164] block mt-0.5 font-medium">
                    {activeHotspotForRefactor.repo} deposu için Gemini Refactoring Planı
                  </span>
                </div>
              </div>

              <button
                onClick={closeRefactorModal}
                aria-label="Refactoring penceresini kapat"
                className="p-1.5 rounded-lg border border-[#AB421C] bg-[#EC7D55] text-[#253341] hover:bg-[#AB421C] hover:text-[#F5F9F5] cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Yükleniyor Durumu */}
            {hotspotRefactorMutation.isPending && !refactorData && (
              <div className="py-12 text-center space-y-3">
                <div className="inline-block animate-spin p-3 rounded-full border-2 border-dashed border-[#253341] text-[#253341]">
                  <Sparkles className="w-6 h-6" />
                </div>
                <p className="text-sm font-bold text-[#253341]">
                  Gemini kod churn ve hata paternlerini inceleyerek mimari refactoring planı hazırlıyor...
                </p>
                <p className="text-xs text-[#3E5164]">
                  SOLID prensipleri ve tasarım kalıpları modelleniyor
                </p>
              </div>
            )}

            {/* Hata Durumu */}
            {hotspotRefactorMutation.isError && !refactorData && (
              <div className="py-8 text-center space-y-3">
                <div className="p-3 rounded-full bg-[#AB421C] border border-[#AB421C] inline-flex text-[#F5F9F5]">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <p className="text-xs font-bold text-[#AB421C]">
                  {hotspotRefactorMutation.error?.message || 'Refactoring analizi yapılırken bir hata oluştu.'}
                </p>
                <div className="flex justify-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (activeHotspotForRefactor) {
                        handleTriggerRefactor(activeHotspotForRefactor.path, activeHotspotForRefactor.repo);
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#EC7D55] text-[#253341] border border-[#AB421C] hover:bg-[#AB421C] hover:text-[#F5F9F5] transition-colors cursor-pointer shadow-xs"
                  >
                    Tekrar Dene
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveHotspotForRefactor(null);
                      setRefactorData(null);
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold border border-[#BCC7D2] bg-[#EDF3EE] text-[#253341] hover:bg-[#DBE6DD] transition-colors cursor-pointer"
                  >
                    Kapat
                  </button>
                </div>
              </div>
            )}

            {refactorData && (
              <div className="space-y-4 text-xs leading-relaxed max-h-[70vh] overflow-y-auto pr-1">
                {/* Tasarım Kalıbı ve Etki */}
                <div className="p-4 rounded-xl border border-[#BCC7D2] bg-[#EDF3EE] flex items-start gap-3.5 shadow-xs">
                  <div className="p-2 rounded-lg bg-[#F2A488] border border-[#EC7D55] text-[#253341] shrink-0">
                    <Code className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[#DBE6DD] text-[#253341] border border-[#BCC7D2] inline-block mb-1">
                      Önerilen Tasarım Kalıbı
                    </span>
                    <h4 className="font-bold text-sm text-[#253341] mb-1">
                      {refactorData.proposedDesignPattern}
                    </h4>
                    <p className="text-[#3E5164] font-medium">{refactorData.expectedImpact}</p>
                  </div>
                </div>

                {/* Tespit Edilen Anti-Pattern'ler */}
                <div className="space-y-2">
                  <h4 className="font-bold text-xs text-[#253341] uppercase tracking-wider">
                    Tespit Edilen Anti-Pattern ve Riskler
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {refactorData.antiPatternsDetected.map((pattern, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 rounded-md border border-[#EC7D55] bg-[#F2A488] text-[11px] font-bold text-[#253341]"
                      >
                        {pattern}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Adım Adım Refactoring Rehberi */}
                <div className="space-y-2">
                  <h4 className="font-bold text-xs text-[#253341] uppercase tracking-wider">
                    Uygulama Adımları
                  </h4>
                  <ol className="space-y-2">
                    {refactorData.refactorSteps.map((step, idx) => (
                      <li
                        key={idx}
                        className="p-3 rounded-lg border border-[#BCC7D2] bg-[#EDF3EE] flex items-start gap-2.5"
                      >
                        <span className="w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 bg-[#F2A488] text-[#253341] border border-[#EC7D55]">
                          {idx + 1}
                        </span>
                        <span className="text-[#3E5164] leading-relaxed font-medium">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Örnek Kod Şablonu (Varsa) */}
                {refactorData.sampleCodeSnippet && (
                  <div className="space-y-2">
                    <h4 className="font-bold text-xs text-[#253341] uppercase tracking-wider">
                      Örnek Yeniden Yapılandırma Kodu
                    </h4>
                    <pre className="p-3.5 rounded-lg border border-[#BCC7D2] bg-[#F5F9F5] font-mono text-[11px] text-[#253341] overflow-x-auto whitespace-pre-wrap leading-relaxed">
                      {refactorData.sampleCodeSnippet}
                    </pre>
                  </div>
                )}

                {/* Alt Eylemler */}
                <div className="pt-3 border-t border-[#BCC7D2] flex justify-end gap-2">
                  <button
                    onClick={() => {
                      onAskAboutFile(activeHotspotForRefactor.path, activeHotspotForRefactor.repo);
                      setActiveHotspotForRefactor(null);
                      setRefactorData(null);
                    }}
                    className="px-3.5 py-2 rounded-lg text-xs font-bold bg-[#EC7D55] text-[#253341] hover:bg-[#AB421C] hover:text-[#F5F9F5] transition-colors cursor-pointer border border-[#AB421C] shadow-xs"
                  >
                    Kensai Soru Sor
                  </button>
                  <button
                    onClick={() => {
                      setActiveHotspotForRefactor(null);
                      setRefactorData(null);
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
