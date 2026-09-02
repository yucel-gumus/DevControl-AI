import React, { useState, useEffect } from 'react';
import {
  Terminal,
  Send,
  Sparkles,
  Cpu,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { AskAiMessage, AnalysisTrace } from '../types.js';

interface Props {
  messages: AskAiMessage[];
  onSendMessage: (query: string) => Promise<void>;
  isLoading: boolean;
  activeTrace: AnalysisTrace | null;
  defaultPrompt?: string;
}

export const AskAiView: React.FC<Props> = ({
  messages,
  onSendMessage,
  isLoading,
  activeTrace,
  defaultPrompt,
}) => {
  const [inputQuery, setInputQuery] = useState(defaultPrompt || '');
  const [expandedTraces, setExpandedTraces] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (defaultPrompt) {
      setInputQuery(defaultPrompt);
    }
  }, [defaultPrompt]);

  const sampleQuestions = [
    'Son 30 günde projelerimde ne değişti?',
    'En büyük mühendislik riskleri nerede ve nasıl çözerim?',
    'Hangi dosyalar bakım sıcak noktasına (hotspot) dönüşüyor?',
    'DevControl genel sağlık skoru dağılımımız nedir?',
    'Kanıtlara dayalı mimari ve teknik başarılarımı özetle.',
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputQuery.trim() || isLoading) return;
    const q = inputQuery;
    setInputQuery('');
    await onSendMessage(q);
  };

  const toggleTrace = (id: string) => {
    setExpandedTraces((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div id="ask-ai-view" className="space-y-6 max-w-4xl mx-auto font-sans text-[#241c1d]">
      {/* Header Banner */}
      <div className="p-5 rounded-xl border border-[#e8ded9] bg-[#f9efec] space-y-3.5 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[#fff4f0] border border-[#e8ded9] text-[#241c1d] shadow-xs">
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#fff4f0] text-[#241c1d] border border-[#e8ded9]">
                Otonom Sorgu Planlayıcı
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#fff4f0] text-[#5c5254] border border-[#e8ded9]">
                Kanıta Dayalı
              </span>
            </div>
            <h2 className="text-base font-bold text-[#241c1d] mt-1 tracking-tight">
              Mühendislik Verilerinize Sorun
            </h2>
          </div>
        </div>
        <p className="text-xs text-[#5c5254] leading-relaxed">
          Kod tabanınız, commit dalgalanmaları veya PR darboğazları hakkında soru sorun. Yapay zeka analisti telemetri verilerini tarar ve kanıtlanabilir yanıtlar üretir.
        </p>

        {/* Quick Sample Prompts */}
        <div className="pt-1 flex flex-wrap gap-1.5">
          {sampleQuestions.map((q, idx) => (
            <button
              key={idx}
              onClick={() => setInputQuery(q)}
              className="text-[11px] font-semibold px-2.5 py-1 rounded-md border border-[#e8ded9] bg-[#fff4f0] text-[#241c1d] hover:bg-white transition-colors cursor-pointer shadow-xs"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Chat Messages Container */}
      <div className="space-y-4 min-h-[260px]">
        {messages.length === 0 && (
          <div className="p-8 rounded-xl border border-[#e8ded9] bg-[#f9efec] text-center text-xs text-[#8c8082]">
            Henüz soru sorulmadı. Yukarıdaki önerilen sorulardan birine tıklayabilir veya aklınızdaki soruyu yazabilirsiniz.
          </div>
        )}

        {messages.map((msg) => {
          const isUser = msg.role === 'user' || (msg as any).sender === 'user';
          return (
            <div
              key={msg.id}
              className={`p-4 rounded-xl border border-[#e8ded9] transition-all shadow-xs space-y-2.5 ${
                isUser
                  ? 'ml-8 bg-[#fff4f0] text-[#241c1d]'
                  : 'mr-8 bg-[#f9efec] text-[#241c1d]'
              }`}
            >
              {/* Message Header */}
              <div className="flex items-center justify-between border-b border-[#e8ded9] pb-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded border border-[#e8ded9] ${
                      isUser
                        ? 'bg-[#f6f3f4] text-[#241c1d]'
                        : 'bg-[#fff4f0] text-[#241c1d]'
                    }`}
                  >
                    {isUser ? 'Siz' : 'Mühendislik Analisti'}
                  </span>
                  <span className="text-[10px] text-[#8c8082]">
                    {Number.isNaN(new Date(msg.timestamp).getTime())
                      ? msg.timestamp
                      : new Date(msg.timestamp).toLocaleTimeString('tr-TR')}
                  </span>
                </div>

                {!isUser && msg.trace && (
                  <button
                    onClick={() => toggleTrace(msg.id)}
                    className="flex items-center gap-1 text-[11px] font-bold text-[#5c5254] hover:text-[#241c1d] transition-colors cursor-pointer"
                  >
                    <Cpu className="w-3.5 h-3.5 text-[#241c1d]" />
                    <span>Plan ({msg.trace.steps.length} adım)</span>
                    {expandedTraces[msg.id] ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                )}
              </div>

              {/* Execution Trace (Collapsible) */}
              {!isUser && msg.trace && expandedTraces[msg.id] && (
                <div className="p-3 rounded-lg border border-[#e8ded9] bg-[#f6f3f4] space-y-2 text-xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#5c5254] block">
                    Yürütme Adımları:
                  </span>
                  {msg.trace.steps.map((st, sIdx) => (
                    <div key={sIdx} className="space-y-0.5">
                      <div className="font-bold flex items-center gap-1.5 text-[#241c1d]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#241c1d] shrink-0" />
                        <span>{sIdx + 1}. {(st as any).action || st.step}</span>
                      </div>
                      <p className="text-[11px] pl-3 text-[#5c5254]">{st.details}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Message Content */}
              <div className="text-xs leading-relaxed whitespace-pre-wrap">
                {msg.content}
              </div>
            </div>
          );
        })}

        {/* Live Loading Skeleton */}
        {isLoading && (
          <div className="p-4 rounded-xl border border-[#e8ded9] bg-[#f9efec] animate-pulse space-y-2 mr-8 shadow-xs">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 animate-spin text-[#241c1d]" />
              <span className="text-xs font-semibold text-[#241c1d]">
                {(activeTrace?.steps.slice(-1)[0] as any)?.action || activeTrace?.steps.slice(-1)[0]?.details || 'Telemetri verileri taranıyor ve analiz ediliyor...'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Query Input Box (Sticky Bottom) */}
      <form onSubmit={handleSubmit} className="sticky bottom-4">
        <div className="p-1.5 rounded-xl border border-[#e8ded9] bg-[#f9efec]/95 backdrop-blur-md flex items-center gap-2 shadow-lg">
          <input
            type="text"
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            placeholder="Bir mühendislik sorusu yazın..."
            disabled={isLoading}
            className="flex-1 px-3.5 py-2 text-xs bg-[#fff4f0] border border-[#e8ded9] rounded-lg text-[#241c1d] placeholder-[#8c8082] focus:outline-hidden focus:border-[#d9cbc5]"
          />
          <button
            type="submit"
            disabled={!inputQuery.trim() || isLoading}
            className="px-4 py-2 rounded-lg text-xs font-bold bg-[#fff4f0] text-[#241c1d] hover:bg-white transition-colors flex items-center gap-1.5 cursor-pointer border border-[#e8ded9] shadow-xs disabled:opacity-40 disabled:pointer-events-none"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Gönder</span>
          </button>
        </div>
      </form>
    </div>
  );
};
