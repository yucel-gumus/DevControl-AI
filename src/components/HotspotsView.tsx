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
    <div id="hotspots-view" className="space-y-6 font-sans">
      {/* Başlık ve Boyut Dağılımı (%30 Yüzey Kartı) */}
      <div
        className="p-6 rounded-2xl border flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 shadow-sm"
        style={{
          backgroundColor: 'rgba(var(--c1-rgb), 0.3)',
          borderColor: 'var(--c1)',
        }}
      >
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
              Kod Kalitesi & Risk Radarı
            </span>
          </div>
          <h2 className="text-base font-extrabold mt-1" style={{ color: 'var(--ink-primary)' }}>
            Sıcak Noktalar ve Mimari Risk Merkezi
          </h2>
          <p className="text-xs mt-1 max-w-2xl leading-relaxed" style={{ color: 'var(--ink-secondary)' }}>
            Kod dalgalanması yüksek olan kaynak dosyalarını, inceleme bekleyen PR darboğazlarını ve mimari riskleri tek bir merkezden yönetin.
          </p>
        </div>

        {/* Sağlık Boyutları Mini Özeti */}
        {healthScore && (
          <div
            className="flex items-center gap-3 p-3 rounded-xl border shadow-xs"
            style={{
              backgroundColor: 'rgba(var(--c2-rgb), 0.9)',
              borderColor: 'var(--c1)',
            }}
          >
            <div className="text-center px-2">
              <span className="text-[10px] block opacity-75">Kod Sağlığı</span>
              <span className="text-xs font-black">{healthScore.hasData ? `${healthScore.dimensions.codeHealth}/100` : '--'}</span>
            </div>
            <div className="w-px h-6 bg-current opacity-20"></div>
            <div className="text-center px-2">
              <span className="text-[10px] block opacity-75">Teslimat</span>
              <span className="text-xs font-black">{healthScore.hasData ? `${healthScore.dimensions.delivery}/100` : '--'}</span>
            </div>
            <div className="w-px h-6 bg-current opacity-20"></div>
            <div className="text-center px-2">
              <span className="text-[10px] block opacity-75">Dokümantasyon</span>
              <span className="text-xs font-black">{healthScore.hasData ? `${healthScore.dimensions.documentation}/100` : '--'}</span>
            </div>
          </div>
        )}
      </div>

      {/* Alt Sekme & Filtre Kontrolleri */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Görünüm Seçimi */}
        <div
          className="flex items-center gap-1.5 p-1 rounded-xl border shadow-xs"
          style={{
            backgroundColor: 'rgba(var(--c2-rgb), 0.9)',
            borderColor: 'var(--c1)',
          }}
        >
          <button
            onClick={() => setActiveSubTab('all')}
            className="px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer"
            style={{
              backgroundColor: activeSubTab === 'all' ? 'var(--c3)' : 'transparent',
              color: 'var(--ink-primary)',
              border: activeSubTab === 'all' ? '1px solid rgba(var(--c3-rgb), 0.9)' : '1px solid transparent',
            }}
          >
            Tüm Bulgular ({safeHotspots.length + safeRisks.length})
          </button>
          <button
            onClick={() => setActiveSubTab('hotspots')}
            className="px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer"
            style={{
              backgroundColor: activeSubTab === 'hotspots' ? 'var(--c3)' : 'transparent',
              color: 'var(--ink-primary)',
              border: activeSubTab === 'hotspots' ? '1px solid rgba(var(--c3-rgb), 0.9)' : '1px solid transparent',
            }}
          >
            Sıcak Noktalar ({safeHotspots.length})
          </button>
          <button
            onClick={() => setActiveSubTab('risks')}
            className="px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer"
            style={{
              backgroundColor: activeSubTab === 'risks' ? 'var(--c3)' : 'transparent',
              color: 'var(--ink-primary)',
              border: activeSubTab === 'risks' ? '1px solid rgba(var(--c3-rgb), 0.9)' : '1px solid transparent',
            }}
          >
            Mühendislik Riskleri ({safeRisks.length})
          </button>
        </div>

        {/* Risk Seviyesi Filtresi */}
        {activeSubTab !== 'risks' && (
          <div
            className="flex items-center gap-1.5 p-1 rounded-xl border shadow-xs"
            style={{
              backgroundColor: 'rgba(var(--c2-rgb), 0.9)',
              borderColor: 'var(--c1)',
            }}
          >
            {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((level) => (
              <button
                key={level}
                onClick={() => setFilterRisk(level)}
                className="px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer"
                style={{
                  backgroundColor: filterRisk === level ? 'var(--c3)' : 'transparent',
                  color: 'var(--ink-primary)',
                  border: filterRisk === level ? '1px solid rgba(var(--c3-rgb), 0.9)' : '1px solid transparent',
                }}
              >
                {level === 'ALL' ? 'TÜMÜ' : level === 'CRITICAL' ? 'KRİTİK' : level === 'HIGH' ? 'YÜKSEK' : level === 'MEDIUM' ? 'ORTA' : 'DÜŞÜK'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 1. Mühendislik Riskleri Bölümü */}
      {(activeSubTab === 'all' || activeSubTab === 'risks') && safeRisks.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4" />
            <h3 className="text-xs font-black uppercase tracking-wider">
              Aktif Mühendislik Riskleri & Darboğazlar ({safeRisks.length})
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {safeRisks.map((risk, rIdx) => (
              <div
                key={rIdx}
                className="p-5 rounded-2xl border flex flex-col justify-between gap-4 shadow-sm"
                style={{
                  backgroundColor: 'rgba(var(--c1-rgb), 0.25)',
                  borderColor: 'var(--c1)',
                }}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md border"
                      style={{
                        backgroundColor: 'rgba(var(--c2-rgb), 0.9)',
                        borderColor: 'var(--c1)',
                        color: 'var(--ink-primary)',
                      }}
                    >
                      {risk.affectedRepository || risk.repo_name}
                    </span>
                    <span
                      className="text-[10px] font-extrabold px-2 py-0.5 rounded-full border"
                      style={{
                        backgroundColor: 'var(--c3)',
                        borderColor: 'rgba(var(--c3-rgb), 0.9)',
                        color: 'var(--ink-primary)',
                      }}
                    >
                      {RISK_TR_MAP[risk.severity] || risk.severity}
                    </span>
                  </div>

                  <h4 className="text-xs font-extrabold" style={{ color: 'var(--ink-primary)' }}>
                    {risk.title}
                  </h4>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-secondary)' }}>
                    {risk.summary}
                  </p>
                </div>

                <div className="pt-2 border-t flex items-center justify-between gap-2" style={{ borderColor: 'rgba(var(--c1-rgb), 0.8)' }}>
                  <span className="text-[11px] font-medium truncate" style={{ color: 'var(--ink-muted)' }}>
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
                    className="px-2.5 py-1 text-xs font-bold rounded-lg border shrink-0 cursor-pointer shadow-xs"
                    style={{
                      backgroundColor: 'var(--c3)',
                      borderColor: 'rgba(var(--c3-rgb), 0.9)',
                      color: 'var(--ink-primary)',
                    }}
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
            <FileCode className="w-4 h-4" />
            <h3 className="text-xs font-black uppercase tracking-wider">
              Kaynak Kod Sıcak Noktaları (Hotspots) ({filteredHotspots.length})
            </h3>
          </div>

          <div className="space-y-4">
            {filteredHotspots.length === 0 ? (
              <div
                className="p-8 rounded-2xl border text-center text-xs font-semibold shadow-sm"
                style={{
                  backgroundColor: 'rgba(var(--c1-rgb), 0.2)',
                  borderColor: 'var(--c1)',
                  color: 'var(--ink-muted)',
                }}
              >
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
                      `Son dönemde ${codeChurn.toLocaleString()} satır kod dalgalanması (churn) gerçekleşti.`,
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
                    className="p-5 rounded-2xl border transition-all space-y-4 shadow-sm hover:scale-100.5"
                    style={{
                      backgroundColor: 'rgba(var(--c1-rgb), 0.25)',
                      borderColor: 'var(--c1)',
                    }}
                  >
                    {/* Üst Satır: Dosya Yolu & Rozetler */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="p-2 rounded-xl border shadow-xs"
                          style={{
                            backgroundColor: 'var(--c3)',
                            borderColor: 'rgba(var(--c3-rgb), 0.8)',
                          }}
                        >
                          <FileCode className="w-4 h-4" style={{ color: 'var(--ink-primary)' }} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md border"
                              style={{
                                backgroundColor: 'rgba(var(--c2-rgb), 0.9)',
                                borderColor: 'var(--c1)',
                                color: 'var(--ink-primary)',
                              }}
                            >
                              {hotspot.repo_name}
                            </span>
                            <span
                              className="text-[10px] font-extrabold px-2 py-0.5 rounded-full border"
                              style={{
                                backgroundColor: 'var(--c3)',
                                borderColor: 'rgba(var(--c3-rgb), 0.9)',
                                color: 'var(--ink-primary)',
                              }}
                            >
                              {RISK_TR_MAP[hotspot.risk_level] || hotspot.risk_level} RİSK
                            </span>
                          </div>
                          <span className="font-mono text-xs font-extrabold block mt-1" style={{ color: 'var(--ink-primary)' }}>
                            {hotspot.path}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                        <button
                          onClick={() => handleTriggerRefactor(hotspot.path, hotspot.repo_name)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black border transition-all hover:scale-102 cursor-pointer shadow-xs"
                          style={{
                            backgroundColor: 'var(--c3)',
                            borderColor: 'rgba(var(--c3-rgb), 0.9)',
                            color: 'var(--ink-primary)',
                          }}
                          title="Gemini ile bu sıcak nokta için mimari refactoring planı al"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Refactor Planı</span>
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
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all hover:scale-102 cursor-pointer shadow-xs"
                          style={{
                            backgroundColor: 'rgba(var(--c2-rgb), 0.9)',
                            borderColor: 'var(--c1)',
                            color: 'var(--ink-primary)',
                          }}
                        >
                          <HelpCircle className="w-3.5 h-3.5" />
                          <span>Neden?</span>
                        </button>

                        <button
                          onClick={() => onAskAboutFile(hotspot.path, hotspot.repo_name)}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold border transition-all hover:scale-102 cursor-pointer shadow-xs"
                          style={{
                            backgroundColor: 'rgba(var(--c2-rgb), 0.9)',
                            borderColor: 'var(--c1)',
                            color: 'var(--ink-primary)',
                          }}
                        >
                          AI Analizi
                        </button>
                      </div>
                    </div>

                    {/* Metrik Rozetleri Izgarası */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                      <div
                        className="p-2.5 rounded-xl border flex items-center gap-2.5 shadow-xs"
                        style={{
                          backgroundColor: 'rgba(var(--c2-rgb), 0.8)',
                          borderColor: 'var(--c1)',
                        }}
                      >
                        <GitCommit className="w-4 h-4" style={{ color: 'var(--ink-muted)' }} />
                        <div>
                          <span className="text-[10px] block" style={{ color: 'var(--ink-muted)' }}>Commit Sayısı</span>
                          <span className="text-xs font-black" style={{ color: 'var(--ink-primary)' }}>{modificationsCount}</span>
                        </div>
                      </div>

                      <div
                        className="p-2.5 rounded-xl border flex items-center gap-2.5 shadow-xs"
                        style={{
                          backgroundColor: 'rgba(var(--c2-rgb), 0.8)',
                          borderColor: 'var(--c1)',
                        }}
                      >
                        <Bug className="w-4 h-4" style={{ color: 'var(--ink-muted)' }} />
                        <div>
                          <span className="text-[10px] block" style={{ color: 'var(--ink-muted)' }}>Hata Düzeltmesi</span>
                          <span className="text-xs font-black" style={{ color: 'var(--ink-primary)' }}>{bugFixesCount}</span>
                        </div>
                      </div>

                      <div
                        className="p-2.5 rounded-xl border flex items-center gap-2.5 shadow-xs"
                        style={{
                          backgroundColor: 'rgba(var(--c2-rgb), 0.8)',
                          borderColor: 'var(--c1)',
                        }}
                      >
                        <Code2 className="w-4 h-4" style={{ color: 'var(--ink-muted)' }} />
                        <div>
                          <span className="text-[10px] block" style={{ color: 'var(--ink-muted)' }}>Toplam Churn</span>
                          <span className="text-xs font-black" style={{ color: 'var(--ink-primary)' }}>{codeChurn.toLocaleString()} satır</span>
                        </div>
                      </div>

                      <div
                        className="p-2.5 rounded-xl border flex items-center gap-2.5 shadow-xs"
                        style={{
                          backgroundColor: 'rgba(var(--c2-rgb), 0.8)',
                          borderColor: 'var(--c1)',
                        }}
                      >
                        <Users className="w-4 h-4" style={{ color: 'var(--ink-muted)' }} />
                        <div>
                          <span className="text-[10px] block" style={{ color: 'var(--ink-muted)' }}>Geliştirici Sayısı</span>
                          <span className="text-xs font-black" style={{ color: 'var(--ink-primary)' }}>{contributorsCount} yazar</span>
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
          className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md overflow-y-auto"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
        >
          <div
            className="w-full max-w-2xl p-6 rounded-2xl border space-y-5 shadow-2xl animate-in zoom-in-95 my-8"
            style={{
              backgroundColor: 'var(--c2)',
              borderColor: 'var(--c1)',
              color: 'var(--ink-primary)',
            }}
          >
            {/* Modal Başlığı */}
            <div className="flex items-center justify-between border-b pb-4" style={{ borderColor: 'var(--c1)' }}>
              <div className="flex items-center gap-3">
                <div
                  className="p-2 rounded-xl border shadow-xs"
                  style={{
                    backgroundColor: 'var(--c3)',
                    borderColor: 'rgba(var(--c3-rgb), 0.9)',
                  }}
                >
                  <Brain className="w-5 h-5" style={{ color: 'var(--ink-primary)' }} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-extrabold font-mono">{activeHotspotForRefactor.path}</span>
                  </div>
                  <span className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                    {activeHotspotForRefactor.repo} deposu için Gemini Destekli Refactoring Planı
                  </span>
                </div>
              </div>

              <button
                onClick={() => {
                  setActiveHotspotForRefactor(null);
                  setRefactorData(null);
                }}
                className="p-1.5 rounded-xl border cursor-pointer hover:opacity-80"
                style={{
                  backgroundColor: 'var(--c1)',
                  borderColor: 'rgba(var(--c1-rgb), 0.8)',
                }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Yükleniyor Durumu */}
            {hotspotRefactorMutation.isPending && !refactorData && (
              <div className="py-12 text-center space-y-3">
                <div className="inline-block animate-spin p-3 rounded-full border-2 border-dashed border-current">
                  <Sparkles className="w-6 h-6" />
                </div>
                <p className="text-sm font-bold">
                  Gemini bu dosyadaki kod churn ve hata paternlerini inceleyerek mimari refactoring planı hazırlıyor...
                </p>
                <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
                  SOLID prensipleri ve tasarım kalıpları modelleniyor
                </p>
              </div>
            )}

            {refactorData && (
              <div className="space-y-4 text-xs leading-relaxed max-h-[70vh] overflow-y-auto pr-1">
                {/* Tasarım Kalıbı ve Etki */}
                <div
                  className="p-4 rounded-xl border flex items-start gap-4 shadow-xs"
                  style={{
                    backgroundColor: 'rgba(var(--c1-rgb), 0.35)',
                    borderColor: 'var(--c1)',
                  }}
                >
                  <div className="p-3 rounded-xl border shrink-0" style={{ backgroundColor: 'var(--c3)', borderColor: 'rgba(var(--c3-rgb), 0.8)' }}>
                    <Code className="w-5 h-5" style={{ color: 'var(--ink-primary)' }} />
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full border inline-block mb-1" style={{ backgroundColor: 'var(--c3)', borderColor: 'rgba(var(--c3-rgb), 0.9)' }}>
                      Önerilen Tasarım Kalıbı
                    </span>
                    <h4 className="font-extrabold text-sm mb-1" style={{ color: 'var(--ink-primary)' }}>
                      {refactorData.proposedDesignPattern}
                    </h4>
                    <p style={{ color: 'var(--ink-secondary)' }}>{refactorData.expectedImpact}</p>
                  </div>
                </div>

                {/* Tespit Edilen Anti-Pattern'ler */}
                <div className="space-y-2">
                  <h4 className="font-extrabold text-xs uppercase tracking-wider" style={{ color: 'var(--ink-primary)' }}>
                    Tespit Edilen Anti-Pattern ve Riskler
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {refactorData.antiPatternsDetected.map((pattern, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 rounded-lg border text-[11px] font-bold"
                        style={{
                          backgroundColor: 'rgba(var(--c2-rgb), 0.9)',
                          borderColor: 'var(--c1)',
                          color: 'var(--ink-primary)',
                        }}
                      >
                        {pattern}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Adım Adım Refactoring Rehberi */}
                <div className="space-y-2">
                  <h4 className="font-extrabold text-xs uppercase tracking-wider" style={{ color: 'var(--ink-primary)' }}>
                    Uygulama Adımları
                  </h4>
                  <ol className="space-y-2">
                    {refactorData.refactorSteps.map((step, idx) => (
                      <li
                        key={idx}
                        className="p-3 rounded-xl border flex items-start gap-2.5 font-medium"
                        style={{
                          backgroundColor: 'rgba(var(--c2-rgb), 0.9)',
                          borderColor: 'var(--c1)',
                          color: 'var(--ink-primary)',
                        }}
                      >
                        <span
                          className="w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center shrink-0 border"
                          style={{
                            backgroundColor: 'var(--c3)',
                            borderColor: 'rgba(var(--c3-rgb), 0.9)',
                            color: 'var(--ink-primary)',
                          }}
                        >
                          {idx + 1}
                        </span>
                        <span className="text-[11px] leading-relaxed">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Örnek Kod Şablonu (Varsa) */}
                {refactorData.sampleCodeSnippet && (
                  <div className="space-y-2">
                    <h4 className="font-extrabold text-xs uppercase tracking-wider" style={{ color: 'var(--ink-primary)' }}>
                      Örnek Yeniden Yapılandırma Kodu
                    </h4>
                    <pre
                      className="p-3 rounded-xl border font-mono text-[11px] overflow-x-auto whitespace-pre-wrap leading-relaxed"
                      style={{
                        backgroundColor: 'rgba(var(--c1-rgb), 0.5)',
                        borderColor: 'var(--c1)',
                        color: 'var(--ink-primary)',
                      }}
                    >
                      {refactorData.sampleCodeSnippet}
                    </pre>
                  </div>
                )}

                {/* Alt Eylemler */}
                <div className="pt-3 border-t flex justify-end gap-2" style={{ borderColor: 'var(--c1)' }}>
                  <button
                    onClick={() => {
                      onAskAboutFile(activeHotspotForRefactor.path, activeHotspotForRefactor.repo);
                      setActiveHotspotForRefactor(null);
                      setRefactorData(null);
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer shadow-xs"
                    style={{
                      backgroundColor: 'var(--c3)',
                      borderColor: 'rgba(var(--c3-rgb), 0.9)',
                      color: 'var(--ink-primary)',
                    }}
                  >
                    AI Analistine Soru Sor
                  </button>
                  <button
                    onClick={() => {
                      setActiveHotspotForRefactor(null);
                      setRefactorData(null);
                    }}
                    className="px-3 py-2 rounded-xl text-xs font-bold border cursor-pointer"
                    style={{
                      backgroundColor: 'var(--c1)',
                      borderColor: 'rgba(var(--c1-rgb), 0.8)',
                    }}
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
