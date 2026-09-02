import React from 'react';
import { X, Database, HelpCircle, Cpu } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export interface ExplainWhyData {
  title: string;
  category?: string;
  severity?: string;
  confidence?: number;
  impactScore?: number;
  summary: string;
  facts?: string[];
  evidence?: any;
  actionPlan?: string[];
  recommendedAction?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  data: ExplainWhyData | null;
}

export const ExplainWhyModal: React.FC<Props> = ({ isOpen, onClose, data }) => {
  if (!isOpen || !data) return null;

  const evidenceList = Array.isArray(data.evidence)
    ? data.evidence
    : data.facts || [];

  const actionsList = data.actionPlan || (data.recommendedAction ? [data.recommendedAction] : []);

  return (
    <AnimatePresence>
      <div
        id="modal-explain-why-backdrop"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md font-sans"
        style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
      >
        <motion.div
          id="modal-explain-why-container"
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          style={{
            backgroundColor: 'var(--c2)',
            borderColor: 'var(--c1)',
            color: 'var(--ink-primary)',
          }}
        >
          {/* Modal Header */}
          <div
            className="flex items-center justify-between px-6 py-4 border-b"
            style={{
              backgroundColor: 'rgba(var(--c1-rgb), 0.35)',
              borderColor: 'var(--c1)',
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="p-2 rounded-xl border shadow-xs"
                style={{
                  backgroundColor: 'var(--c3)',
                  borderColor: 'rgba(var(--c3-rgb), 0.8)',
                }}
              >
                <HelpCircle className="w-5 h-5" style={{ color: 'var(--ink-primary)' }} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border"
                    style={{
                      backgroundColor: 'rgba(var(--c2-rgb), 0.9)',
                      borderColor: 'var(--c1)',
                      color: 'var(--ink-primary)',
                    }}
                  >
                    Kanıt Katmanı ve Doğrulama
                  </span>
                  {data.category && (
                    <span
                      className="px-2 py-0.5 text-[10px] font-bold rounded-full border"
                      style={{
                        backgroundColor: 'var(--c3)',
                        borderColor: 'rgba(var(--c3-rgb), 0.9)',
                        color: 'var(--ink-primary)',
                      }}
                    >
                      {data.category}
                    </span>
                  )}
                </div>
                <h3 className="text-sm font-black mt-0.5" style={{ color: 'var(--ink-primary)' }}>
                  {data.title}
                </h3>
              </div>
            </div>
            <button
              id="btn-close-explain-modal"
              onClick={onClose}
              className="p-1.5 rounded-lg border transition-all cursor-pointer shadow-xs"
              style={{
                backgroundColor: 'var(--c1)',
                borderColor: 'rgba(var(--c1-rgb), 0.8)',
                color: 'var(--ink-primary)',
              }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Modal Scrollable Body */}
          <div className="p-6 overflow-y-auto space-y-4 text-xs">
            {/* Core Principle Badge */}
            <div
              className="p-3.5 rounded-xl border flex items-start gap-3 shadow-xs"
              style={{
                backgroundColor: 'rgba(var(--c1-rgb), 0.25)',
                borderColor: 'var(--c1)',
              }}
            >
              <Cpu className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="text-xs leading-relaxed" style={{ color: 'var(--ink-secondary)' }}>
                <strong style={{ color: 'var(--ink-primary)' }}>Kanıta Dayalı Doğrulama:</strong> Bu tespit deterministik metrik motorları ve Gemini analisti tarafından sentezlenmiştir. Temelsiz veya uydurma iddialar üretilmez.
              </div>
            </div>

            {/* Summary */}
            <div
              className="p-4 rounded-xl border space-y-1 shadow-xs"
              style={{
                backgroundColor: 'rgba(var(--c1-rgb), 0.2)',
                borderColor: 'var(--c1)',
              }}
            >
              <span className="text-[10px] font-black uppercase tracking-wider block" style={{ color: 'var(--ink-muted)' }}>
                Özet Bulgular
              </span>
              <p className="text-xs leading-relaxed font-medium" style={{ color: 'var(--ink-primary)' }}>
                {data.summary}
              </p>
            </div>

            {/* Measured Evidence List */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Database className="w-3.5 h-3.5" />
                <h4 className="text-xs font-black uppercase tracking-wider" style={{ color: 'var(--ink-primary)' }}>
                  Doğrulanmış Mühendislik Kanıtları
                </h4>
              </div>

              <div className="space-y-2">
                {evidenceList.map((item: any, idx: number) => {
                  const isObj = typeof item === 'object' && item !== null;
                  return (
                    <div
                      key={idx}
                      className="p-3 rounded-xl border flex items-start justify-between gap-3 shadow-xs"
                      style={{
                        backgroundColor: 'rgba(var(--c1-rgb), 0.15)',
                        borderColor: 'var(--c1)',
                      }}
                    >
                      <div className="space-y-0.5">
                        <span className="text-xs font-black" style={{ color: 'var(--ink-primary)' }}>
                          {isObj ? item.metric || item.name : item}
                        </span>
                        {isObj && item.description && (
                          <p className="text-[11px]" style={{ color: 'var(--ink-secondary)' }}>
                            {item.description}
                          </p>
                        )}
                      </div>
                      {isObj && item.value !== undefined && (
                        <span
                          className="font-mono text-xs font-black px-2 py-0.5 rounded-md border"
                          style={{
                            backgroundColor: 'var(--c3)',
                            borderColor: 'rgba(var(--c3-rgb), 0.9)',
                            color: 'var(--ink-primary)',
                          }}
                        >
                          {item.value}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Action Plan */}
            {actionsList.length > 0 && (
              <div
                className="p-4 rounded-xl border space-y-2 shadow-xs"
                style={{
                  backgroundColor: 'rgba(var(--c3-rgb), 0.35)',
                  borderColor: 'var(--c3)',
                }}
              >
                <span className="text-xs font-black block" style={{ color: 'var(--ink-primary)' }}>
                  Önerilen Çözüm ve Aksiyonlar:
                </span>
                <ul className="space-y-1 text-xs font-medium" style={{ color: 'var(--ink-secondary)' }}>
                  {actionsList.map((act, aIdx) => (
                    <li key={aIdx} className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: 'var(--ink-primary)' }}></span>
                      <span>{act}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div
            className="px-6 py-3 border-t flex justify-end"
            style={{
              backgroundColor: 'rgba(var(--c1-rgb), 0.25)',
              borderColor: 'var(--c1)',
            }}
          >
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold border transition-all hover:scale-102 cursor-pointer shadow-xs"
              style={{
                backgroundColor: 'var(--c3)',
                borderColor: 'rgba(var(--c3-rgb), 0.9)',
                color: 'var(--ink-primary)',
              }}
            >
              Anladım ve Kapat
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
