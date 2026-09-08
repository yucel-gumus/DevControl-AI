import React, { useState } from 'react';
import {
  FileCode,
  GitCommit,
  Clock,
  Code2,
  Bug,
  HelpCircle,
  ShieldAlert,
  ShieldCheck,
  Activity,
  Sparkles,
  Brain,
  Code,
  X,
  AlertCircle,
} from 'lucide-react';
import { FileHotspot, EngineeringRisk, EngineeringHealthScore, HotspotRefactorRecommendation } from '../types.js';
import { ExplainWhyData } from './ExplainWhyModal.js';
import { useHotspotRefactor } from '../hooks/useMetrics.js';
import { RISK_TR_MAP } from '../constants.js';
import { formatDate } from '../utils/formatters.js';

interface Props {
  hotspots: FileHotspot[];
  risks?: EngineeringRisk[];
  healthScore?: EngineeringHealthScore | null;
  onExplainWhy: (data: ExplainWhyData) => void;
  onAskAboutFile: (path: string, repo: string) => void;
}

export const HotspotsView: React.FC<Props> = ({
  hotspots = [],
  risks = [],
  healthScore,
  onExplainWhy,
  onAskAboutFile,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'all' | 'hotspots' | 'risks'>('all');
  const [filterRisk, setFilterRisk] = useState<string>('ALL');

  // AI Refactor Modal Durumu
  const [activeHotspotForRefactor, setActiveHotspotForRefactor] = useState<{ path: string; repo: string } | null>(null);
  const [refactorData, setRefactorData] = useState<HotspotRefactorRecommendation | null>(null);
  const hotspotRefactorMutation = useHotspotRefactor();

  const handleTriggerRefactor = async (path: string, repo: string) => {
    setActiveHotspotForRefactor({ path, repo });
    setRefactorData(null);
    try {
      const res = await hotspotRefactorMutation.mutateAsync({ filePath: path, repoName: repo });
      setRefactorData(res);
    } catch (err) {
      console.error('Refactor önerisi alınamadı:', err);
    }
  };

  const safeHotspots = Array.isArray(hotspots) ? hotspots : [];
  const safeRisks = Array.isArray(risks) ? risks : [];

  const criticalHotspots = safeHotspots.filter((h) => h.risk_level === 'CRITICAL');
  const highHotspots = safeHotspots.filter((h) => h.risk_level === 'HIGH');
  const bugFixHotspots = safeHotspots.filter((h) => (h.bug_fix_commits_count ?? 0) > 0);
  const totalHotspotChurn = safeHotspots.reduce((acc, h) => acc + (h.code_churn || 0), 0);

  const filteredHotspots = safeHotspots.filter(
    (h) => filterRisk === 'ALL' || h.risk_level === filterRisk
  );

  return (
    <div id="hotspots-view" className="space-y-6 font-sans text-[#231c1a]">
      {/* Başlık ve Boyut Dağılımı */}
      <div className="p-5 rounded-xl border border-[#a89997] bg-[#cdc1b5] flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/15">
              Kod Kalitesi & Risk Radarı
            </span>
          </div>
          <h2 className="text-base font-bold text-[#231c1a] mt-1 tracking-tight">
            Kritik Dosyalar ve Mimari Risk Merkezi
          </h2>
          <p className="text-xs mt-1 text-[#4a3e3b] max-w-2xl leading-relaxed font-medium">
            Kod dalgalanması yüksek olan kaynak dosyalarını, inceleme bekleyen PR darboğazlarını ve mimari riskleri tek bir merkezden yönetin.
          </p>
        </div>

        {/* Sağlık Boyutları Mini Özeti */}
        {healthScore && (
          <div className="flex items-center gap-3 p-2.5 rounded-lg border border-[#a89997] bg-[#b9aba9]/35 shadow-xs">
            <div className="text-center px-2">
              <span className="text-[10px] block text-[#4a3e3b] font-bold">Kod Sağlığı</span>
              <span className="text-xs font-bold text-[#231c1a]">
                {healthScore.hasData ? `${healthScore.dimensions.codeHealth}/100` : '--'}
              </span>
            </div>
            <div className="w-px h-6 bg-[#a89997]" />
            <div className="text-center px-2">
              <span className="text-[10px] block text-[#4a3e3b] font-bold">Teslimat</span>
              <span className="text-xs font-bold text-[#231c1a]">
                {healthScore.hasData ? `${healthScore.dimensions.delivery}/100` : '--'}
              </span>
            </div>
            <div className="w-px h-6 bg-[#a89997]" />
            <div className="text-center px-2">
              <span className="text-[10px] block text-[#4a3e3b] font-bold">Dokümantasyon</span>
              <span className="text-xs font-bold text-[#231c1a]">
                {healthScore.hasData ? `${healthScore.dimensions.documentation}/100` : '--'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Mimari Radar KPI Şeridi */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl border border-[#a89997] bg-[#cdc1b5] flex items-center gap-3 shadow-xs">
          <div className="p-2.5 rounded-lg bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/15">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] block text-[#4a3e3b] font-bold uppercase tracking-wider">Aktif Darboğaz</span>
            <span className="text-sm font-bold text-[#231c1a]">{safeRisks.length} Mimari Risk</span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-[#a89997] bg-[#cdc1b5] flex items-center gap-3 shadow-xs">
          <div className="p-2.5 rounded-lg bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/15">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] block text-[#4a3e3b] font-bold uppercase tracking-wider">Kritik Sıcak Nokta</span>
            <span className="text-sm font-bold text-[#231c1a]">{criticalHotspots.length} Acil Modül</span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-[#a89997] bg-[#cdc1b5] flex items-center gap-3 shadow-xs">
          <div className="p-2.5 rounded-lg bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/15">
            <Bug className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] block text-[#4a3e3b] font-bold uppercase tracking-wider">Hata Odağı Dosya</span>
            <span className="text-sm font-bold text-[#231c1a]">{bugFixHotspots.length} Regresyon Riski</span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-[#a89997] bg-[#cdc1b5] flex items-center gap-3 shadow-xs">
          <div className="p-2.5 rounded-lg bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/15">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] block text-[#4a3e3b] font-bold uppercase tracking-wider">Kod Dalgalanması</span>
            <span className="text-sm font-bold text-[#231c1a]">{totalHotspotChurn.toLocaleString()} Satır</span>
          </div>
        </div>
      </div>

      {/* Alt Sekme & Filtre Kontrolleri */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        {/* Görünüm Seçimi (Segmented Control) */}
        <div className="flex items-center gap-1 p-1 rounded-lg border border-[#a89997] bg-[#cdc1b5]">
          <button
            onClick={() => setActiveSubTab('all')}
            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${activeSubTab === 'all'
              ? 'bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/20 shadow-xs'
              : 'text-[#4a3e3b] hover:text-[#231c1a]'
              }`}
          >
            Tümü ({safeHotspots.length + safeRisks.length})
          </button>
          <button
            onClick={() => setActiveSubTab('hotspots')}
            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${activeSubTab === 'hotspots'
              ? 'bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/20 shadow-xs'
              : 'text-[#4a3e3b] hover:text-[#231c1a]'
              }`}
          >
            Kritik Dosyalar ({safeHotspots.length})
          </button>
          <button
            onClick={() => setActiveSubTab('risks')}
            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${activeSubTab === 'risks'
              ? 'bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/20 shadow-xs'
              : 'text-[#4a3e3b] hover:text-[#231c1a]'
              }`}
          >
            Riskler ({safeRisks.length})
          </button>
        </div>

        {/* Risk Seviyesi Filtresi */}
        {activeSubTab !== 'risks' && (
          <div className="flex items-center gap-1 p-1 rounded-lg border border-[#a89997] bg-[#cdc1b5]">
            {[
              { id: 'ALL', label: 'Tümü' },
              { id: 'CRITICAL', label: 'Kritik' },
              { id: 'HIGH', label: 'Yüksek' },
              { id: 'MEDIUM', label: 'Orta' },
              { id: 'LOW', label: 'Düşük' },
            ].map((lvl) => (
              <button
                key={lvl.id}
                onClick={() => setFilterRisk(lvl.id)}
                className={`px-2.5 py-1 text-[11px] font-bold rounded transition-all cursor-pointer ${filterRisk === lvl.id
                  ? 'bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/20 shadow-xs'
                  : 'text-[#4a3e3b] hover:text-[#231c1a]'
                  }`}
              >
                {lvl.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 1. Mühendislik Riskleri Bölümü */}
      {(activeSubTab === 'all' || activeSubTab === 'risks') && safeRisks.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-[#231c1a]" />
            <h3 className="text-xs font-bold text-[#231c1a]">
              Aktif Mühendislik Riskleri & Darboğazlar ({safeRisks.length})
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {safeRisks.map((risk, rIdx) => (
              <div
                key={rIdx}
                className="p-4 rounded-xl border border-[#a89997] bg-[#cdc1b5] hover:bg-[#cdc1b5]/85 transition-all flex flex-col justify-between gap-3 shadow-xs"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/15 font-bold">
                      {risk.affectedRepository || risk.repo_name}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-[#231c1a]/15 bg-[#f9b88e] text-[#231c1a]">
                      {RISK_TR_MAP[risk.severity] || risk.severity}
                    </span>
                  </div>

                  <h4 className="text-xs font-bold text-[#231c1a]">
                    {risk.title}
                  </h4>
                  <p className="text-xs text-[#4a3e3b] leading-relaxed font-medium">
                    {risk.summary}
                  </p>
                </div>

                <div className="pt-2 border-t border-[#a89997] flex items-center justify-between gap-2">
                  <span className="text-[11px] text-[#4a3e3b] truncate font-medium">
                    {risk.recommendedAction}
                  </span>
                  <button
                    onClick={() =>
                      onExplainWhy({
                        title: risk.title,
                        category: risk.affectedRepository || risk.repo_name,
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
                    className="px-2.5 py-1 text-xs font-bold rounded-lg bg-[#f9b88e] border border-[#231c1a]/15 text-[#231c1a] hover:brightness-105 transition-all shrink-0 cursor-pointer shadow-xs"
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
            <FileCode className="w-4 h-4 text-[#231c1a]" />
            <h3 className="text-xs font-bold text-[#231c1a]">
              Kritik Kod Dosyaları ({filteredHotspots.length})
            </h3>
          </div>

          <div className="space-y-3">
            {filteredHotspots.length === 0 ? (
              <div className="p-8 rounded-xl border border-[#a89997] bg-[#cdc1b5] text-center text-xs text-[#6e5f5c]">
                Seçilen filtrede kritik dosya bulunamadı.
              </div>
            ) : (
              filteredHotspots.map((hotspot, idx) => {
                const modificationsCount = hotspot.modifications_count ?? 0;
                const bugFixesCount = hotspot.bug_fix_commits_count ?? 0;
                const codeChurn = hotspot.code_churn ?? 0;
                const avgChurnPerCommit = hotspot.avg_churn_per_commit ?? (modificationsCount > 0 ? Math.round(codeChurn / modificationsCount) : 0);
                const contributorsCount = hotspot.contributors_count ?? 0;
                const confidenceScore = hotspot.confidence ?? 0;
                const bugFixRatio = modificationsCount > 0 ? Math.round((bugFixesCount / modificationsCount) * 100) : 0;

                const evidenceList = Array.isArray(hotspot.evidence) && hotspot.evidence.length > 0
                  ? hotspot.evidence.map((e) => `${e.metric}: ${e.value} - ${e.description}`)
                  : [
                    `Son dönemde ${codeChurn.toLocaleString()} satır kod dalgalanması gerçekleşti (Ortalama ~${avgChurnPerCommit} satır/commit).`,
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
                    className="p-4 rounded-xl border border-[#a89997] bg-[#cdc1b5] hover:bg-[#cdc1b5]/85 transition-all space-y-3 shadow-xs"
                  >
                    {/* Üst Satır: Dosya Yolu & Eylemler */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 rounded-lg bg-[#f9b88e] border border-[#231c1a]/15 text-[#231c1a] shrink-0">
                          <FileCode className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/15 font-bold">
                              {hotspot.repo_name}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-[#231c1a]/15 bg-[#f9b88e] text-[#231c1a]">
                              {RISK_TR_MAP[hotspot.risk_level] || hotspot.risk_level} Risk
                            </span>
                            {bugFixesCount > 0 && (
                              <span
                                className="text-[10px] font-bold px-2 py-0.5 rounded border border-[#231c1a]/15 bg-[#f9b88e] text-[#231c1a] flex items-center gap-1 shrink-0"
                                title={`${bugFixesCount} adet hata düzeltmesi (${modificationsCount > 0 ? `%${bugFixRatio}` : ''})`}
                              >
                                <Bug className="w-2.5 h-2.5" />
                                <span>{bugFixesCount} Hata Çözümü</span>
                              </span>
                            )}
                            <span className="text-[10px] font-mono text-[#4a3e3b] font-medium px-1.5 py-0.5 rounded bg-[#b9aba9]/30 border border-[#a89997]/60">
                              {hotspot.language}
                            </span>
                          </div>
                          <span className="font-mono text-xs font-bold text-[#231c1a] block mt-1 truncate">
                            {hotspot.path}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
                        <button
                          onClick={() => handleTriggerRefactor(hotspot.path, hotspot.repo_name)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#f9b88e] text-[#231c1a] hover:brightness-105 transition-all cursor-pointer border border-[#231c1a]/15 shadow-xs"
                          title="Gemini ile mimari refactoring planı al"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-[#231c1a]" />
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
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-[#f9b88e] border border-[#231c1a]/15 text-[#231c1a] hover:brightness-105 transition-all cursor-pointer shadow-xs"
                        >
                          <HelpCircle className="w-3.5 h-3.5 text-[#231c1a]" />
                          <span>Neden?</span>
                        </button>

                        <button
                          onClick={() => onAskAboutFile(hotspot.path, hotspot.repo_name)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-[#f9b88e] border border-[#231c1a]/15 text-[#231c1a] hover:brightness-105 transition-all cursor-pointer shadow-xs"
                        >
                          Kensai
                        </button>
                      </div>
                    </div>

                    {/* Mimari Teşhis & Eylem Tavsiyesi (Doğrudan Kart Üzerinde) */}
                    <div className="p-3 rounded-lg bg-[#b9aba9]/25 border border-[#a89997] space-y-1">
                      <div className="flex items-center gap-1.5 text-[#231c1a] font-bold text-[11px]">
                        <Brain className="w-3.5 h-3.5 text-[#231c1a]" />
                        <span>Mimari Teşhis & Eylem Tavsiyesi</span>
                      </div>
                      <p className="text-xs text-[#3a2e2b] leading-relaxed font-medium">
                        {hotspot.recommendation}
                      </p>
                    </div>

                    {/* Metrik Rozetleri Izgarası */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-0.5">
                      <div className="p-2 rounded-lg bg-[#b9aba9]/35 border border-[#a89997] flex items-center gap-2">
                        <GitCommit className="w-3.5 h-3.5 text-[#4a3e3b]" />
                        <div>
                          <span className="text-[10px] block text-[#4a3e3b] font-bold">Değişim Sıklığı</span>
                          <span className="text-xs font-bold text-[#231c1a]">{modificationsCount} Commit</span>
                        </div>
                      </div>

                      <div
                        className="p-2 rounded-lg bg-[#b9aba9]/35 border border-[#a89997] flex items-center gap-2"
                        title={`Toplam ${codeChurn.toLocaleString()} satır dalgalanma (Commit başına ort. ~${avgChurnPerCommit} satır)`}
                      >
                        <Activity className="w-3.5 h-3.5 text-[#4a3e3b]" />
                        <div className="min-w-0">
                          <span className="text-[10px] block text-[#4a3e3b] font-bold">Kod Dalgalanması</span>
                          <span className="text-xs font-bold text-[#231c1a] truncate block">
                            {codeChurn.toLocaleString()} satır (~{avgChurnPerCommit}/commit)
                          </span>
                        </div>
                      </div>

                      <div className="p-2 rounded-lg bg-[#b9aba9]/35 border border-[#a89997] flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-[#4a3e3b]" />
                        <div>
                          <span className="text-[10px] block text-[#4a3e3b] font-bold">Son Düzenleme</span>
                          <span className="text-xs font-bold text-[#231c1a]">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm overflow-y-auto font-sans">
          <div className="w-full max-w-2xl p-6 rounded-2xl border border-[#a89997] bg-[#cdc1b5] space-y-5 shadow-2xl animate-in zoom-in-95 my-8 text-[#231c1a]">
            {/* Modal Başlığı */}
            <div className="flex items-center justify-between border-b border-[#a89997] pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[#f9b88e] border border-[#231c1a]/15 text-[#231c1a] shadow-xs">
                  <Brain className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs font-bold font-mono text-[#231c1a]">
                    {activeHotspotForRefactor.path}
                  </span>
                  <span className="text-[11px] text-[#4a3e3b] block mt-0.5 font-medium">
                    {activeHotspotForRefactor.repo} deposu için Gemini Refactoring Planı
                  </span>
                </div>
              </div>

              <button
                onClick={() => {
                  setActiveHotspotForRefactor(null);
                  setRefactorData(null);
                }}
                className="p-1.5 rounded-lg border border-[#231c1a]/15 bg-[#f9b88e] text-[#231c1a] hover:brightness-105 cursor-pointer transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Yükleniyor Durumu */}
            {hotspotRefactorMutation.isPending && !refactorData && (
              <div className="py-12 text-center space-y-3">
                <div className="inline-block animate-spin p-3 rounded-full border-2 border-dashed border-[#231c1a] text-[#231c1a]">
                  <Sparkles className="w-6 h-6" />
                </div>
                <p className="text-sm font-bold text-[#231c1a]">
                  Gemini kod churn ve hata paternlerini inceleyerek mimari refactoring planı hazırlıyor...
                </p>
                <p className="text-xs text-[#4a3e3b]">
                  SOLID prensipleri ve tasarım kalıpları modelleniyor
                </p>
              </div>
            )}

            {/* Hata Durumu */}
            {hotspotRefactorMutation.isError && !refactorData && (
              <div className="py-8 text-center space-y-3">
                <div className="p-3 rounded-full bg-[#f9b88e]/40 border border-[#231c1a]/20 inline-flex text-[#231c1a]">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <p className="text-xs font-bold text-[#231c1a]">
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
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/15 hover:brightness-105 transition-all cursor-pointer shadow-xs"
                  >
                    Tekrar Dene
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveHotspotForRefactor(null);
                      setRefactorData(null);
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold border border-[#a89997] bg-[#b9aba9]/35 text-[#231c1a] hover:bg-[#b9aba9]/50 transition-all cursor-pointer"
                  >
                    Kapat
                  </button>
                </div>
              </div>
            )}

            {refactorData && (
              <div className="space-y-4 text-xs leading-relaxed max-h-[70vh] overflow-y-auto pr-1">
                {/* Tasarım Kalıbı ve Etki */}
                <div className="p-4 rounded-xl border border-[#a89997] bg-[#b9aba9]/35 flex items-start gap-3.5 shadow-xs">
                  <div className="p-2 rounded-lg bg-[#f9b88e] border border-[#231c1a]/15 text-[#231c1a] shrink-0">
                    <Code className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/15 inline-block mb-1">
                      Önerilen Tasarım Kalıbı
                    </span>
                    <h4 className="font-bold text-sm text-[#231c1a] mb-1">
                      {refactorData.proposedDesignPattern}
                    </h4>
                    <p className="text-[#4a3e3b] font-medium">{refactorData.expectedImpact}</p>
                  </div>
                </div>

                {/* Tespit Edilen Anti-Pattern'ler */}
                <div className="space-y-2">
                  <h4 className="font-bold text-xs text-[#231c1a] uppercase tracking-wider">
                    Tespit Edilen Anti-Pattern ve Riskler
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {refactorData.antiPatternsDetected.map((pattern, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 rounded-md border border-[#231c1a]/15 bg-[#f9b88e] text-[11px] font-bold text-[#231c1a]"
                      >
                        {pattern}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Adım Adım Refactoring Rehberi */}
                <div className="space-y-2">
                  <h4 className="font-bold text-xs text-[#231c1a] uppercase tracking-wider">
                    Uygulama Adımları
                  </h4>
                  <ol className="space-y-2">
                    {refactorData.refactorSteps.map((step, idx) => (
                      <li
                        key={idx}
                        className="p-3 rounded-lg border border-[#a89997] bg-[#b9aba9]/30 flex items-start gap-2.5"
                      >
                        <span className="w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/15">
                          {idx + 1}
                        </span>
                        <span className="text-[#4a3e3b] leading-relaxed font-medium">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Örnek Kod Şablonu (Varsa) */}
                {refactorData.sampleCodeSnippet && (
                  <div className="space-y-2">
                    <h4 className="font-bold text-xs text-[#231c1a] uppercase tracking-wider">
                      Örnek Yeniden Yapılandırma Kodu
                    </h4>
                    <pre className="p-3.5 rounded-lg border border-[#a89997] bg-[#b9aba9]/35 font-mono text-[11px] text-[#231c1a] overflow-x-auto whitespace-pre-wrap leading-relaxed">
                      {refactorData.sampleCodeSnippet}
                    </pre>
                  </div>
                )}

                {/* Alt Eylemler */}
                <div className="pt-3 border-t border-[#a89997] flex justify-end gap-2">
                  <button
                    onClick={() => {
                      onAskAboutFile(activeHotspotForRefactor.path, activeHotspotForRefactor.repo);
                      setActiveHotspotForRefactor(null);
                      setRefactorData(null);
                    }}
                    className="px-3.5 py-2 rounded-lg text-xs font-bold bg-[#f9b88e] text-[#231c1a] hover:brightness-105 transition-all cursor-pointer border border-[#231c1a]/15 shadow-xs"
                  >
                    Kensai Soru Sor
                  </button>
                  <button
                    onClick={() => {
                      setActiveHotspotForRefactor(null);
                      setRefactorData(null);
                    }}
                    className="px-3 py-2 rounded-lg text-xs font-bold border border-[#a89997] bg-[#b9aba9]/35 text-[#231c1a] hover:bg-[#b9aba9]/50 transition-all cursor-pointer"
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
