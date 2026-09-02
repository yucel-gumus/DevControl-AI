import React, { useState } from 'react';
import {
  FileCode,
  GitCommit,
  Users,
  Code2,
  Bug,
  HelpCircle,
  ShieldAlert,
  Sparkles,
  Brain,
  Code,
  X,
} from 'lucide-react';
import { FileHotspot, EngineeringRisk, EngineeringHealthScore, HotspotRefactorRecommendation } from '../types.js';
import { ExplainWhyData } from './ExplainWhyModal.js';
import { useHotspotRefactor } from '../hooks/useMetrics.js';
import { RISK_TR_MAP } from '../constants.js';

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
            Sıcak Noktalar ve Mimari Risk Merkezi
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

      {/* Alt Sekme & Filtre Kontrolleri */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        {/* Görünüm Seçimi (Segmented Control) */}
        <div className="flex items-center gap-1 p-1 rounded-lg border border-[#a89997] bg-[#cdc1b5]">
          <button
            onClick={() => setActiveSubTab('all')}
            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
              activeSubTab === 'all'
                ? 'bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/20 shadow-xs'
                : 'text-[#4a3e3b] hover:text-[#231c1a]'
            }`}
          >
            Tümü ({safeHotspots.length + safeRisks.length})
          </button>
          <button
            onClick={() => setActiveSubTab('hotspots')}
            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
              activeSubTab === 'hotspots'
                ? 'bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/20 shadow-xs'
                : 'text-[#4a3e3b] hover:text-[#231c1a]'
            }`}
          >
            Sıcak Noktalar ({safeHotspots.length})
          </button>
          <button
            onClick={() => setActiveSubTab('risks')}
            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
              activeSubTab === 'risks'
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
                className={`px-2.5 py-1 text-[11px] font-bold rounded transition-all cursor-pointer ${
                  filterRisk === lvl.id
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
                        evidence: risk.evidence,
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

      {/* 2. Sıcak Noktalar Listesi Bölümü */}
      {(activeSubTab === 'all' || activeSubTab === 'hotspots') && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <FileCode className="w-4 h-4 text-[#231c1a]" />
            <h3 className="text-xs font-bold text-[#231c1a]">
              Kaynak Kod Sıcak Noktaları ({filteredHotspots.length})
            </h3>
          </div>

          <div className="space-y-3">
            {filteredHotspots.length === 0 ? (
              <div className="p-8 rounded-xl border border-[#a89997] bg-[#cdc1b5] text-center text-xs text-[#6e5f5c]">
                Seçilen filtrede sıcak nokta bulunamadı.
              </div>
            ) : (
              filteredHotspots.map((hotspot, idx) => {
                const modificationsCount = hotspot.modifications_count ?? 0;
                const bugFixesCount = hotspot.bug_fix_commits_count ?? 0;
                const codeChurn = hotspot.code_churn ?? 0;
                const contributorsCount = hotspot.contributors_count ?? 0;
                const confidenceScore = hotspot.confidence ?? 0;
                const bugFixRatio = modificationsCount > 0 ? Math.round((bugFixesCount / modificationsCount) * 100) : 0;

                const evidenceList = Array.isArray(hotspot.evidence) && hotspot.evidence.length > 0
                  ? hotspot.evidence.map((e) => `${e.metric}: ${e.value} - ${e.description}`)
                  : [
                      `Son dönemde ${codeChurn.toLocaleString()} satır kod dalgalanması gerçekleşti.`,
                      `${contributorsCount} farklı geliştirici bu dosyayı düzenledi.`,
                      `Hata düzeltme oranı %${bugFixRatio} seviyesinde (${bugFixesCount} düzeltme).`,
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
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/15 font-bold">
                              {hotspot.repo_name}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-[#231c1a]/15 bg-[#f9b88e] text-[#231c1a]">
                              {RISK_TR_MAP[hotspot.risk_level] || hotspot.risk_level} Risk
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
                              title: `${hotspot.path} Neden Sıcak Nokta?`,
                              category: hotspot.repo_name,
                              summary: `${modificationsCount} commit ve ${bugFixesCount} hata düzeltmesi ile yüksek oynaklık skoruna sahip.`,
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
                          AI İncele
                        </button>
                      </div>
                    </div>

                    {/* Metrik Rozetleri Izgarası */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                      <div className="p-2 rounded-lg bg-[#b9aba9]/35 border border-[#a89997] flex items-center gap-2">
                        <GitCommit className="w-3.5 h-3.5 text-[#4a3e3b]" />
                        <div>
                          <span className="text-[10px] block text-[#4a3e3b] font-bold">Commit</span>
                          <span className="text-xs font-bold text-[#231c1a]">{modificationsCount}</span>
                        </div>
                      </div>

                      <div className="p-2 rounded-lg bg-[#b9aba9]/35 border border-[#a89997] flex items-center gap-2">
                        <Bug className="w-3.5 h-3.5 text-[#4a3e3b]" />
                        <div>
                          <span className="text-[10px] block text-[#4a3e3b] font-bold">Hata Çözümü</span>
                          <span className="text-xs font-bold text-[#231c1a]">{bugFixesCount}</span>
                        </div>
                      </div>

                      <div className="p-2 rounded-lg bg-[#b9aba9]/35 border border-[#a89997] flex items-center gap-2">
                        <Code2 className="w-3.5 h-3.5 text-[#4a3e3b]" />
                        <div>
                          <span className="text-[10px] block text-[#4a3e3b] font-bold">Toplam Churn</span>
                          <span className="text-xs font-bold text-[#231c1a]">{codeChurn.toLocaleString()} satır</span>
                        </div>
                      </div>

                      <div className="p-2 rounded-lg bg-[#b9aba9]/35 border border-[#a89997] flex items-center gap-2">
                        <Users className="w-3.5 h-3.5 text-[#4a3e3b]" />
                        <div>
                          <span className="text-[10px] block text-[#4a3e3b] font-bold">Geliştirici</span>
                          <span className="text-xs font-bold text-[#231c1a]">{contributorsCount} yazar</span>
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
                    AI Analistine Soru Sor
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
