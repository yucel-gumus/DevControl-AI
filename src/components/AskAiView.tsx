import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Terminal,
  Sparkles,
  Bot,
  User,
  Wrench,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  RotateCcw,
} from 'lucide-react';
import { AskAiMessage } from '../types.js';

interface Props {
  messages: AskAiMessage[];
  isLoading: boolean;
  onSendMessage: (text: string) => void;
  onClearChat?: () => void;
  rateLimitStatus?: any;
}

export const AskAiView: React.FC<Props> = ({
  messages = [],
  isLoading,
  onSendMessage,
  onClearChat,
  rateLimitStatus,
}) => {
  const [input, setInput] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    onSendMessage(input.trim());
    setInput('');
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const defaultPrompts = [
    'En yüksek hata oranına sahip 3 kritik dosyamı ve nedenlerini analiz et.',
    'Son 14 günlük commit tempomu ve kod oynaklığı trendlerimi açıkla.',
    'En çok kod dalgalanması olan depom için 3 somut mimari iyileştirme öner.',
  ];

  return (
    <div id="ask-ai-view" className="flex flex-col h-[calc(100vh-8.5rem)] font-sans text-[#231c1a]">
      {/* Üst Bilgi Barı */}
      <div className="p-4 rounded-xl border border-[#a89997] bg-[#cdc1b5] mb-4 flex items-center justify-between gap-4 shadow-xs shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#f9b88e] border border-[#231c1a]/15 flex items-center justify-center text-[#231c1a] shadow-xs">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold text-[#231c1a] tracking-tight">
                DevControl Yapay Zeka Analisti
              </h2>
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/15">
                Gemini Flash
              </span>
            </div>
            <p className="text-[11px] text-[#4a3e3b] font-medium">
              Kişisel GitHub verilerinize bağlı, deterministik metrik sorgulama ajanınız.
            </p>
          </div>
        </div>

        {onClearChat && messages.length > 0 && (
          <button
            onClick={onClearChat}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border border-[#a89997] bg-[#b9aba9]/35 text-[#4a3e3b] hover:text-[#231c1a] hover:bg-[#b9aba9]/50 transition-all cursor-pointer shadow-xs"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Sohbeti Temizle</span>
          </button>
        )}
      </div>

      {/* Mesaj Akışı Alanı */}
      <div className="flex-1 overflow-y-auto p-4 rounded-xl border border-[#a89997] bg-[#cdc1b5] space-y-4 shadow-xs">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-[#f9b88e] border border-[#231c1a]/15 flex items-center justify-center text-[#231c1a] shadow-xs">
              <Terminal className="w-6 h-6" />
            </div>
            <div className="max-w-md space-y-1">
              <h3 className="text-sm font-bold text-[#231c1a]">
                Kod Tabanınız Hakkında Soru Sorun
              </h3>
              <p className="text-xs text-[#4a3e3b] font-medium">
                Ajan; depolarınızı, sıcak noktaları, hata oranlarını ve PR durumlarını analiz ederek somut yanıtlar üretir.
              </p>
            </div>

            {/* Hızlı Başlangıç İpuçları */}
            <div className="w-full max-w-lg space-y-2 pt-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#4a3e3b] block text-left">
                Örnek Mühendislik Soruları
              </span>
              {defaultPrompts.map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => onSendMessage(prompt)}
                  className="w-full text-left p-2.5 rounded-lg border border-[#a89997] bg-[#b9aba9]/30 hover:bg-[#b9aba9]/50 transition-all text-xs font-bold text-[#231c1a] cursor-pointer shadow-xs"
                >
                  "{prompt}"
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id}
                className={`flex gap-3 text-xs ${
                  isUser ? 'justify-end' : 'justify-start'
                }`}
              >
                {!isUser && (
                  <div className="w-7 h-7 rounded-lg bg-[#f9b88e] border border-[#231c1a]/15 flex items-center justify-center shrink-0 text-[#231c1a] shadow-xs mt-0.5">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] rounded-xl p-3.5 space-y-2 shadow-xs ${
                    isUser
                      ? 'bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/20 font-medium'
                      : 'bg-[#b9aba9]/35 border border-[#a89997] text-[#231c1a]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4 border-b border-[#231c1a]/10 pb-1.5">
                    <span className="font-bold text-[11px] text-[#231c1a]">
                      {isUser ? 'Siz' : 'Gemini Analisti'}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[#4a3e3b]">
                        {new Date(msg.timestamp).toLocaleTimeString('tr-TR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      {!isUser && (
                        <button
                          onClick={() => handleCopy(msg.content, msg.id)}
                          className="text-[#4a3e3b] hover:text-[#231c1a] transition-colors p-0.5"
                          title="Yanıtı kopyala"
                        >
                          {copiedId === msg.id ? (
                            <Check className="w-3 h-3 text-[#231c1a]" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Mesaj İçeriği */}
                  <div className="leading-relaxed whitespace-pre-wrap font-sans break-words font-medium">
                    {msg.content}
                  </div>

                  {/* Arka Planda Çalıştırılan Araçlar (Tool Invocations) */}
                  {msg.toolInvocations && msg.toolInvocations.length > 0 && (
                    <div className="pt-2 border-t border-[#a89997] space-y-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#4a3e3b] flex items-center gap-1">
                        <Wrench className="w-3 h-3 text-[#231c1a]" />
                        <span>Sorgulanan GitHub Telemetri Araçları</span>
                      </span>
                      <div className="space-y-1">
                        {msg.toolInvocations.map((tool, tIdx) => (
                          <div
                            key={tIdx}
                            className="p-2 rounded bg-[#cdc1b5] border border-[#a89997] text-[11px] flex items-center justify-between gap-2"
                          >
                            <div className="flex items-center gap-1.5">
                              <CheckCircle2 className="w-3 h-3 text-[#231c1a]" />
                              <span className="font-mono font-bold text-[#231c1a]">
                                {tool.toolName}
                              </span>
                            </div>
                            <span className="text-[10px] text-[#4a3e3b] font-bold">
                              Tamamlandı
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {isUser && (
                  <div className="w-7 h-7 rounded-lg bg-[#b9aba9] border border-[#a89997] flex items-center justify-center shrink-0 text-[#231c1a] shadow-xs mt-0.5">
                    <User className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Yükleniyor Göstergesi */}
        {isLoading && (
          <div className="flex gap-3 text-xs justify-start items-center">
            <div className="w-7 h-7 rounded-lg bg-[#f9b88e] border border-[#231c1a]/15 flex items-center justify-center shrink-0 text-[#231c1a] shadow-xs">
              <Bot className="w-3.5 h-3.5" />
            </div>
            <div className="p-3 rounded-xl border border-[#a89997] bg-[#b9aba9]/35 text-[#231c1a] flex items-center gap-2 shadow-xs">
              <div className="w-2 h-2 rounded-full bg-[#f9b88e] animate-ping" />
              <span className="font-bold text-[11px]">
                Telemetri verileri analiz ediliyor ve yanıt oluşturuluyor...
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Mesaj Yazma Giriş Çubuğu */}
      <form
        onSubmit={handleSubmit}
        className="mt-3 flex items-center gap-2 p-1.5 rounded-xl border border-[#a89997] bg-[#cdc1b5] shadow-xs shrink-0"
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Mühendislik veya depo analizi hakkında soru sorun..."
          disabled={isLoading}
          className="flex-1 bg-transparent px-3 py-2 text-xs text-[#231c1a] placeholder-[#6e5f5c] focus:outline-none disabled:opacity-50 font-medium"
        />
        <button
          type="submit"
          disabled={!input.trim() || isLoading}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-[#f9b88e] text-[#231c1a] hover:brightness-105 transition-all cursor-pointer disabled:opacity-40 border border-[#231c1a]/20 shadow-xs"
        >
          <span>Gönder</span>
          <Send className="w-3 h-3 text-[#231c1a]" />
        </button>
      </form>
    </div>
  );
};
