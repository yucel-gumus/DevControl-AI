import React from 'react';
import { X, HelpCircle, AlertTriangle, ArrowRight, ShieldCheck } from 'lucide-react';

export interface ExplainWhyData {
  title: string;
  category: string;
  summary: string;
  impactScore?: number;
  confidence?: number;
  evidence?: string[];
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
  if (!isOpen || !data) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm overflow-y-auto font-sans"
      role="dialog"
      aria-modal="true"
      aria-labelledby="explain-modal-title"
    >
      <div className="w-full max-w-xl p-6 rounded-2xl border border-[#a89997] bg-[#cdc1b5] space-y-5 shadow-2xl animate-in zoom-in-95 my-8 text-[#231c1a]">
        {/* Üst Başlık & Kapatma Butonu */}
        <div className="flex items-start justify-between gap-4 border-b border-[#a89997] pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#f9b88e] border border-[#231c1a]/15 text-[#231c1a] shadow-xs shrink-0">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/15">
                  {data.category}
                </span>
                {data.confidence && (
                  <span className="text-[11px] text-[#4a3e3b] font-medium">
                    Güven: %{Math.round(data.confidence * 100)}
                  </span>
                )}
              </div>
              <h3 id="explain-modal-title" className="text-sm font-bold text-[#231c1a] mt-1">
                {data.title}
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border border-[#231c1a]/15 bg-[#f9b88e] text-[#231c1a] hover:brightness-105 cursor-pointer transition-all shrink-0"
            aria-label="Kapat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Özet Açıklama */}
        <div className="p-4 rounded-xl border border-[#a89997] bg-[#b9aba9]/35 space-y-1.5 shadow-xs">
          <span className="text-[10px] font-bold uppercase text-[#4a3e3b]">
            Durum Özeti
          </span>
          <p className="text-xs text-[#231c1a] font-medium leading-relaxed">
            {data.summary}
          </p>
        </div>

        {/* Kanıtlar (Evidence) */}
        {data.evidence && data.evidence.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#231c1a] flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[#231c1a]" />
              <span>Gözlemlenen Telemetri Kanıtları</span>
            </h4>
            <ul className="space-y-1.5">
              {data.evidence.map((ev, idx) => (
                <li
                  key={idx}
                  className="p-2.5 rounded-lg border border-[#a89997] bg-[#b9aba9]/30 text-xs text-[#4a3e3b] flex items-start gap-2 font-medium"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#231c1a] mt-1.5 shrink-0" />
                  <span>{ev}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Aksiyon Planı (Action Plan) */}
        {(data.actionPlan && data.actionPlan.length > 0) || data.recommendedAction ? (
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#231c1a] flex items-center gap-1.5">
              <ArrowRight className="w-3.5 h-3.5 text-[#231c1a]" />
              <span>Önerilen Mühendislik Aksiyonları</span>
            </h4>
            <div className="space-y-1.5">
              {data.recommendedAction && (
                <div className="p-3 rounded-lg border border-[#231c1a]/15 bg-[#f9b88e] text-xs font-bold text-[#231c1a] shadow-xs">
                  {data.recommendedAction}
                </div>
              )}
              {data.actionPlan?.map((act, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-lg border border-[#a89997] bg-[#b9aba9]/30 text-xs text-[#4a3e3b] flex items-start gap-2.5 font-medium"
                >
                  <span className="w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/15">
                    {idx + 1}
                  </span>
                  <span>{act}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Alt Butonlar */}
        <div className="pt-3 border-t border-[#a89997] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-bold bg-[#f9b88e] text-[#231c1a] hover:brightness-105 transition-all cursor-pointer border border-[#231c1a]/20 shadow-xs"
          >
            Anladım, Kapat
          </button>
        </div>
      </div>
    </div>
  );
};
