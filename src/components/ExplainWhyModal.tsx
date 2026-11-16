import React from 'react';
import { X, HelpCircle, ArrowRight, ShieldCheck } from 'lucide-react';
import { formatConfidence } from '../utils/formatters.js';
import { useModalA11y } from '../hooks/useModalA11y.js';

export interface ExplainWhyData {
  title: string;
  category: string;
  summary: string;
  impactScore?: number;
  confidence?: number;
  evidence?: Array<string | { metric?: string; value?: string | number; description?: string }>;
  actionPlan?: string[];
  recommendedAction?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  data: ExplainWhyData | null;
}

export const ExplainWhyModal: React.FC<Props> = ({
  isOpen,
  onClose,
  data,
}) => {
  // Kanca koşullu `return`ten ÖNCE çağrılmalıdır (hooks kuralı); bu yüzden
  // `isOpen` kancaya açıkça geçirilir.
  const dialogRef = useModalA11y(isOpen, onClose);

  if (!isOpen || !data) return null;

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#253341]/45 backdrop-blur-sm overflow-y-auto font-sans focus:outline-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="explain-modal-title"
    >
      <div className="w-full max-w-xl p-6 rounded-2xl border border-[#BCC7D2] bg-[#DCE3EA] space-y-5 shadow-2xl animate-in zoom-in-95 my-8 text-[#253341]">
        {/* Üst Başlık & Kapatma Butonu */}
        <div className="flex items-start justify-between gap-4 border-b border-[#BCC7D2] pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#EC7D55] border border-[#AB421C] text-[#253341] shadow-xs shrink-0">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#F2A488] text-[#253341] border border-[#EC7D55]">
                  {data.category}
                </span>
                {data.confidence !== undefined && data.confidence !== null && (
                  <span className="text-[11px] text-[#3E5164] font-medium">
                    Güven: {formatConfidence(data.confidence)}
                  </span>
                )}
                {data.impactScore !== undefined && data.impactScore !== null && (
                  <span className="text-[11px] text-[#3E5164] font-medium">
                    Etki: {data.impactScore}/100
                  </span>
                )}
              </div>
              <h3 id="explain-modal-title" className="text-sm font-bold text-[#253341] mt-1">
                {data.title}
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border border-[#AB421C] bg-[#EC7D55] text-[#253341] hover:bg-[#AB421C] hover:text-[#F5F9F5] cursor-pointer transition-colors shrink-0"
            aria-label="Kapat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Özet Açıklama */}
        <div className="p-4 rounded-xl border border-[#BCC7D2] bg-[#EDF3EE] space-y-1.5 shadow-xs">
          <span className="text-[10px] font-bold uppercase text-[#3E5164]">
            Durum Özeti
          </span>
          <p className="text-xs text-[#253341] font-medium leading-relaxed">
            {data.summary}
          </p>
        </div>

        {/* Kanıtlar (Evidence) */}
        {data.evidence && data.evidence.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#253341] flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[#253341]" />
              <span>Gözlemlenen Telemetri Kanıtları</span>
            </h4>
            <ul className="space-y-1.5">
              {data.evidence.map((ev, idx) => {
                const text = typeof ev === 'string'
                  ? ev
                  : (ev && typeof ev === 'object')
                    ? `${(ev as any).metric || 'Kanıt'}: ${(ev as any).value ?? ''}${(ev as any).description ? ` — ${(ev as any).description}` : ''}`
                    : String(ev);
                return (
                  <li
                    key={idx}
                    className="p-2.5 rounded-lg border border-[#BCC7D2] bg-[#EDF3EE] text-xs text-[#3E5164] flex items-start gap-2 font-medium"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-[#EC7D55] mt-1.5 shrink-0" />
                    <span>{text}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Aksiyon Planı (Action Plan) */}
        {(data.actionPlan && data.actionPlan.length > 0) || data.recommendedAction ? (
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#253341] flex items-center gap-1.5">
              <ArrowRight className="w-3.5 h-3.5 text-[#253341]" />
              <span>Önerilen Mühendislik Aksiyonları</span>
            </h4>
            <div className="space-y-1.5">
              {data.recommendedAction && (
                <div className="p-3 rounded-lg border border-[#EC7D55] bg-[#F2A488] text-xs font-bold text-[#253341] shadow-xs">
                  {data.recommendedAction}
                </div>
              )}
              {data.actionPlan?.map((act, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-lg border border-[#BCC7D2] bg-[#EDF3EE] text-xs text-[#3E5164] flex items-start gap-2.5 font-medium"
                >
                  <span className="w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 bg-[#F2A488] text-[#253341] border border-[#EC7D55]">
                    {idx + 1}
                  </span>
                  <span>{act}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Alt Butonlar */}
        <div className="pt-3 border-t border-[#BCC7D2] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-bold bg-[#EC7D55] text-[#253341] hover:bg-[#AB421C] hover:text-[#F5F9F5] transition-colors cursor-pointer border border-[#AB421C] shadow-xs"
          >
            Anladım, Kapat
          </button>
        </div>
      </div>
    </div>
  );
};
