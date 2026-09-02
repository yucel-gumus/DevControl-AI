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
    'En büyük mühendislik riskleri nerede ve bunları nasıl çözerim?',
    'Hangi dosyalar bakım sıcak noktasına (hotspot) dönüşüyor ve neden?',
    'DevControl genel sağlık skoru dağılımımız nedir?',
    'Bana kanıtlara dayalı mimari ve teknik başarılarımı özetle.',
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
    <div id="ask-ai-view" className="space-y-6 max-w-5xl mx-auto font-sans">
      {/* Header Banner (30% Surface Card) */}
      <div
        className="p-6 rounded-2xl border space-y-4 shadow-sm"
        style={{
          backgroundColor: 'rgba(var(--c1-rgb), 0.3)',
          borderColor: 'var(--c1)',
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="p-2.5 rounded-xl border shadow-xs"
            style={{
              backgroundColor: 'var(--c3)',
              borderColor: 'rgba(var(--c3-rgb), 0.9)',
            }}
          >
            <Terminal className="w-5 h-5" style={{ color: 'var(--ink-primary)' }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span
                className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border"
                style={{
                  backgroundColor: 'rgba(var(--c2-rgb), 0.9)',
                  borderColor: 'var(--c1)',
                  color: 'var(--ink-primary)',
                }}
              >
                Otonom Sorgu Planlayıcı ve Araç Motoru
              </span>
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                style={{
                  backgroundColor: 'var(--c3)',
                  borderColor: 'rgba(var(--c3-rgb), 0.8)',
                  color: 'var(--ink-primary)',
                }}
              >
                Kanıta Dayalı
              </span>
            </div>
            <h2 className="text-base font-extrabold mt-1" style={{ color: 'var(--ink-primary)' }}>
              Mühendislik Verilerinize Sorun
            </h2>
          </div>
        </div>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-secondary)' }}>
          Kod tabanınız, geliştirme hızınız, çekme isteği (PR) darboğazları veya mimari sıcak noktalar hakkında soru sorun.
          Yapay zeka analisti yapılandırılmış bir yürütme planı oluşturur, Araç Kayıt Defteri'nden gerçek verileri çeker ve doğrulanabilir yanıtlar sunar.
        </p>

        {/* Quick Sample Prompts */}
        <div className="pt-1 flex flex-wrap gap-2">
          {sampleQuestions.map((q, idx) => (
            <button
              key={idx}
              onClick={() => setInputQuery(q)}
              className="text-xs font-semibold px-3 py-1.5 rounded-xl border transition-all hover:scale-101 cursor-pointer shadow-xs"
              style={{
                backgroundColor: 'rgba(var(--c2-rgb), 0.85)',
                borderColor: 'var(--c1)',
                color: 'var(--ink-primary)',
              }}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Chat Messages Container */}
      <div className="space-y-4 min-h-[250px]">
        {messages.map((msg) => {
          const isUser = msg.role === 'user' || (msg as any).sender === 'user';
          return (
            <div
              key={msg.id}
              className={`p-5 rounded-2xl border transition-all shadow-sm space-y-3 ${
                isUser ? 'ml-8' : 'mr-8'
              }`}
              style={{
                backgroundColor: isUser ? 'rgba(var(--c1-rgb), 0.4)' : 'rgba(var(--c2-rgb), 0.9)',
                borderColor: isUser ? 'rgba(var(--c1-rgb), 0.8)' : 'var(--c1)',
              }}
            >
              {/* Message Header */}
              <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: 'rgba(var(--c1-rgb), 0.4)' }}>
                <div className="flex items-center gap-2">
                  <span
                    className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full border"
                    style={{
                      backgroundColor: isUser ? 'var(--c1)' : 'var(--c3)',
                      borderColor: isUser ? 'rgba(var(--c1-rgb), 0.9)' : 'rgba(var(--c3-rgb), 0.9)',
                      color: 'var(--ink-primary)',
                    }}
                  >
                    {isUser ? 'Siz' : 'Mühendislik Analisti'}
                  </span>
                  <span className="text-[10px]" style={{ color: 'var(--ink-muted)' }}>
                    {Number.isNaN(new Date(msg.timestamp).getTime())
                      ? msg.timestamp
                      : new Date(msg.timestamp).toLocaleTimeString('tr-TR')}
                  </span>
                </div>

                {!isUser && msg.trace && (
                  <button
                    onClick={() => toggleTrace(msg.id)}
                    className="flex items-center gap-1 text-[11px] font-bold cursor-pointer hover:underline"
                    style={{ color: 'var(--ink-primary)' }}
                  >
                    <Cpu className="w-3.5 h-3.5" />
                    <span>Yürütme Planı ({msg.trace.steps.length} adım)</span>
                    {expandedTraces[msg.id] ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                )}
              </div>

              {/* Execution Trace (Collapsible) */}
              {!isUser && msg.trace && expandedTraces[msg.id] && (
                <div
                  className="p-3.5 rounded-xl border space-y-2 text-xs"
                  style={{
                    backgroundColor: 'rgba(var(--c1-rgb), 0.25)',
                    borderColor: 'var(--c1)',
                  }}
                >
                  <span className="text-[10px] font-black uppercase tracking-wider block" style={{ color: 'var(--ink-muted)' }}>
                    Otonom Planlama Adımları:
                  </span>
                  {msg.trace.steps.map((st, sIdx) => (
                    <div key={sIdx} className="space-y-0.5">
                      <div className="font-bold flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--c3)' }}></span>
                        <span>{sIdx + 1}. {(st as any).action || st.step}</span>
                      </div>
                      <p className="text-[11px] pl-3" style={{ color: 'var(--ink-secondary)' }}>{st.details}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Message Content */}
              <div
                className="text-xs leading-relaxed whitespace-pre-wrap font-sans"
                style={{ color: 'var(--ink-primary)' }}
              >
                {msg.content}
              </div>
            </div>
          );
        })}

        {/* Live Loading Skeleton */}
        {isLoading && (
          <div
            className="p-5 rounded-2xl border animate-pulse space-y-3 mr-8 shadow-sm"
            style={{
              backgroundColor: 'rgba(var(--c2-rgb), 0.9)',
              borderColor: 'var(--c1)',
            }}
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 animate-spin" />
              <span className="text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>
                {(activeTrace?.steps.slice(-1)[0] as any)?.action || activeTrace?.steps.slice(-1)[0]?.details || 'Telemetri verileri taranıyor ve analiz ediliyor...'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Query Input Box (Sticky Bottom) */}
      <form onSubmit={handleSubmit} className="sticky bottom-4">
        <div
          className="p-2 rounded-2xl border flex items-center gap-3 shadow-xl backdrop-blur-md"
          style={{
            backgroundColor: 'rgba(var(--c2-rgb), 0.95)',
            borderColor: 'var(--c1)',
          }}
        >
          <input
            type="text"
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            placeholder="Bir mühendislik sorusu yazın..."
            disabled={isLoading}
            className="flex-1 px-4 py-2.5 text-xs rounded-xl border focus:outline-hidden font-medium"
            style={{
              backgroundColor: 'rgba(var(--c1-rgb), 0.25)',
              borderColor: 'var(--c1)',
              color: 'var(--ink-primary)',
            }}
          />
          <button
            type="submit"
            disabled={!inputQuery.trim() || isLoading}
            className="px-5 py-2.5 rounded-xl text-xs font-bold border flex items-center gap-2 transition-all hover:scale-102 cursor-pointer shadow-sm disabled:opacity-40"
            style={{
              backgroundColor: 'var(--c3)',
              borderColor: 'rgba(var(--c3-rgb), 0.9)',
              color: 'var(--ink-primary)',
            }}
          >
            <Send className="w-4 h-4" />
            <span>Gönder</span>
          </button>
        </div>
      </form>
    </div>
  );
};
