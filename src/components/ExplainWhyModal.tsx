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
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm font-sans"
      >
        <motion.div
          id="modal-explain-why-container"
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.15 }}
          className="relative w-full max-w-xl rounded-2xl border border-[#e8ded9] bg-[#f9efec] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] text-[#241c1d]"
        >
          {/* Modal Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8ded9]">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[#fff4f0] border border-[#e8ded9] text-[#241c1d] shadow-xs">
                <HelpCircle className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#fff4f0] border border-[#e8ded9] text-[#5c5254]">
                    Kanıt Doğrulama
                  </span>
                  {data.category && (
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-[#fff4f0] border border-[#e8ded9] text-[#241c1d]">
                      {data.category}
                    </span>
                  )}
                </div>
                <h3 className="text-sm font-bold text-[#241c1d] mt-0.5">
                  {data.title}
                </h3>
              </div>
            </div>
            <button
              id="btn-close-explain-modal"
              onClick={onClose}
              className="p-1.5 rounded-lg border border-[#e8ded9] bg-[#fff4f0] text-[#241c1d] hover:bg-white cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Modal Scrollable Body */}
          <div className="p-5 overflow-y-auto space-y-4 text-xs">
            {/* Core Principle Badge */}
            <div className="p-3 rounded-lg border border-[#e8ded9] bg-[#fff4f0] flex items-start gap-2.5 text-[#5c5254] shadow-xs">
              <Cpu className="w-4 h-4 text-[#241c1d] mt-0.5 shrink-0" />
              <div className="leading-relaxed">
                <strong className="text-[#241c1d]">Kanıta Dayalı Doğrulama:</strong> Bu tespit deterministik metrik motorları ve Gemini analisti tarafından doğrulanmış telemetriye dayanır.
              </div>
            </div>

            {/* Summary */}
            <div className="p-3.5 rounded-lg border border-[#e8ded9] bg-[#fff4f0] space-y-1 shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#5c5254] block">
                Özet Bulgular
              </span>
              <p className="text-xs leading-relaxed text-[#241c1d]">
                {data.summary}
              </p>
            </div>

            {/* Measured Evidence List */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Database className="w-3.5 h-3.5 text-[#241c1d]" />
                <h4 className="text-xs font-bold text-[#241c1d] uppercase tracking-wider">
                  Doğrulanmış Kanıtlar
                </h4>
              </div>

              <div className="space-y-1.5">
                {evidenceList.map((item: any, idx: number) => {
                  const isObj = typeof item === 'object' && item !== null;
                  return (
                    <div
                      key={idx}
                      className="p-3 rounded-lg border border-[#e8ded9] bg-[#fff4f0] flex items-start justify-between gap-3 shadow-xs"
                    >
                      <div className="space-y-0.5 min-w-0">
                        <span className="text-xs font-bold text-[#241c1d] block">
                          {isObj ? item.metric || item.name : item}
                        </span>
                        {isObj && item.description && (
                          <p className="text-[11px] text-[#5c5254]">
                            {item.description}
                          </p>
                        )}
                      </div>
                      {isObj && item.value !== undefined && (
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[#f6f3f4] border border-[#e8ded9] text-[#241c1d] shrink-0">
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
              <div className="p-3.5 rounded-lg border border-[#e8ded9] bg-[#fff4f0] space-y-2 shadow-xs">
                <span className="text-xs font-bold text-[#241c1d] block">
                  Önerilen Çözüm ve Aksiyonlar
                </span>
                <ul className="space-y-1.5 text-xs text-[#5c5254]">
                  {actionsList.map((act, aIdx) => (
                    <li key={aIdx} className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#241c1d] mt-1.5 shrink-0" />
                      <span>{act}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="px-5 py-3 border-t border-[#e8ded9] flex justify-end bg-[#f9efec]">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-[#fff4f0] text-[#241c1d] hover:bg-white transition-colors cursor-pointer border border-[#e8ded9] shadow-xs"
            >
              Anladım ve Kapat
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
