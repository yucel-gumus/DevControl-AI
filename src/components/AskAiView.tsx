import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Terminal,
  Sparkles,
  Bot,
  User,
  Wrench,
  CheckCircle2,
  Copy,
  Check,
  AlertCircle,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { AskAiMessage, AnalysisTrace, AnalysisTraceStep } from '../types.js';
import { formatTime } from '../utils/formatters.js';
import { ACTIVITY_WINDOW_DAYS } from '../../server/constants.js';

interface Props {
  messages: AskAiMessage[];
  isLoading: boolean;
  onSendMessage: (text: string) => void;
  onClearChat?: () => void;
  activeTrace?: AnalysisTrace | null;
  defaultPrompt?: string;
}

export const AskAiView: React.FC<Props> = ({
  messages = [],
  isLoading,
  onSendMessage,
  onClearChat,
  activeTrace,
  defaultPrompt,
}) => {
  const [input, setInput] = useState('');
  /**
   * Kopyalama geri bildirimi ÜÇ durumludur: onay (`ok: true`), başarısızlık
   * (`ok: false`) ve gösterilecek bir şey yok. Tek bir "kopyalandı mı" bayrağı
   * panoya yazılamadığında da onay gösterirdi: `navigator.clipboard` güvenli
   * olmayan kaynakta hiç bulunmaz, izin reddedilebilir ya da belge odaklı
   * değildir (writeText reddeder). Kullanıcı "Kopyalandı" görüp yapıştırdığında
   * eski içeriği bulurdu — yapılmayan bir işlemi yapılmış gibi göstermemek,
   * ölçüm dürüstlüğü kuralının arabirimdeki karşılığıdır.
   */
  const [copyFeedback, setCopyFeedback] = useState<{ id: string; ok: boolean } | null>(null);
  /**
   * Geri bildirimi silen zamanlayıcı; yeni bir kopyalamada ve bileşen
   * sökülürken temizlenir. Temizlenmezse iki sorun doğar: (1) 2 sn'lik eski bir
   * zamanlayıcı, araya giren YENİ bir kopyalamanın onayını erkenden siler
   * (kullanıcı onayı göremez), (2) sohbet temizlendiğinde görünüm `key` ile
   * yeniden bağlandığı için zamanlayıcı sökülmüş bir bileşende durum güncelleme
   * çağrısı yapar.
   */
  const copyFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (copyFeedbackTimerRef.current !== null) {
      clearTimeout(copyFeedbackTimerRef.current);
    }
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  useEffect(() => {
    // Boş değer de bir sinyaldir: `clearChat` istemi boşaltır ve görünümü
    // yeniden bağlar (App.tsx -> `key`), bu yüzden giriş kutusu temizlenmiş
    // sohbette eski metni göstermeye devam etmemelidir.
    setInput(defaultPrompt || '');
    // Odak her iki durumda da girişe verilir: yeniden bağlanma, odaklanmış
    // "Sohbeti Temizle" düğmesini yok eder ve odağı belgeye düşürür; geri
    // vermezsek klavye kullanıcısı bir sonraki Tab'da sayfanın başından
    // dolaşmaya başlar. Ön-doldurma da aynı yol üzerinden odaklanır, bu yüzden
    // ayrı bir bağlanma etkisi gerekmez (ilk bağlanmada istem zaten boştur).
    inputRef.current?.focus();
  }, [defaultPrompt]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    onSendMessage(input.trim());
    setInput('');
  };

  const handleCopy = async (text: string, id: string) => {
    // `navigator.clipboard` yokluğu da (güvenli olmayan kaynak) bu denemenin
    // içinde yakalanır: `.writeText` çağrısı TypeError fırlatır ve başarısızlık
    // olarak raporlanır.
    let ok = true;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      ok = false;
    }
    setCopyFeedback({ id, ok });
    if (copyFeedbackTimerRef.current !== null) {
      clearTimeout(copyFeedbackTimerRef.current);
    }
    copyFeedbackTimerRef.current = setTimeout(() => {
      copyFeedbackTimerRef.current = null;
      setCopyFeedback(null);
    }, 2000);
  };

  const defaultPrompts = [
    'En yüksek hata oranına sahip 3 kritik dosyamı ve nedenlerini analiz et.',
    // Pencereyi elle yazmak, sistemin ölçtüğü haftalık pencere (bkz.
    // ACTIVITY_WINDOW_DAYS) değiştiğinde öneriyi sessizce ayrıştırırdı.
    `Son ${ACTIVITY_WINDOW_DAYS} günlük commit tempomu ve kod oynaklığı trendlerimi açıkla.`,
    'En çok kod dalgalanması olan depom için 3 somut mimari iyileştirme öner.',
  ];

  /**
   * Kullanıcı henüz bir soru sormadı mı? Sohbet her zaman karşılama mesajıyla
   * başladığı için "mesaj listesi boş" ölçütü hiçbir zaman doğru olmaz.
   */
  const hasUserTurn = messages.some((msg) => msg.role === 'user');

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
                DevControl AI
              </h2>
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/15">
                KENSAI
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
            disabled={isLoading}
            aria-label="Sohbet geçmişini temizle"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border border-[#a89997] bg-[#b9aba9]/35 text-[#4a3e3b] hover:text-[#231c1a] hover:bg-[#b9aba9]/50 transition-all cursor-pointer shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RotateCcw className="w-3 h-3" aria-hidden="true" />
            <span>Sohbeti Temizle</span>
          </button>
        )}
      </div>

      {/* Mesaj Akışı Alanı */}
      <div className="flex-1 overflow-y-auto p-4 rounded-xl border border-[#a89997] bg-[#cdc1b5] space-y-4 shadow-xs">
        {messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id}
                className={`flex gap-3 text-xs ${isUser ? 'justify-end' : 'justify-start'
                  }`}
              >
                {!isUser && (
                  <div className="w-7 h-7 rounded-lg bg-[#f9b88e] border border-[#231c1a]/15 flex items-center justify-center shrink-0 text-[#231c1a] shadow-xs mt-0.5">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] rounded-xl p-3.5 space-y-2 shadow-xs ${isUser
                    ? 'bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/20 font-medium'
                    : 'bg-[#b9aba9]/35 border border-[#a89997] text-[#231c1a]'
                    }`}
                >
                  <div className="flex items-center justify-between gap-4 border-b border-[#231c1a]/10 pb-1.5">
                    <span className="font-bold text-[11px] text-[#231c1a]">
                      {isUser ? 'Siz' : 'KENSAI'}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[#4a3e3b]">
                        {formatTime(msg.timestamp)}
                      </span>
                      {!isUser && (
                        <button
                          type="button"
                          onClick={() => handleCopy(msg.content, msg.id)}
                          className="text-[#4a3e3b] hover:text-[#231c1a] transition-colors p-0.5 cursor-pointer"
                          title={
                            copyFeedback?.id === msg.id && !copyFeedback.ok
                              ? 'Panoya kopyalanamadı'
                              : 'Yanıtı kopyala'
                          }
                          aria-label={
                            copyFeedback?.id === msg.id
                              ? copyFeedback.ok
                                ? 'Yanıt kopyalandı'
                                : 'Panoya kopyalanamadı'
                              : 'Yanıtı kopyala'
                          }
                        >
                          {copyFeedback?.id === msg.id ? (
                            copyFeedback.ok ? (
                              <Check className="w-3 h-3 text-[#231c1a]" />
                            ) : (
                              <AlertCircle className="w-3 h-3 text-[#231c1a]" />
                            )
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

                  {/* Doğrulanmış Telemetri Bulguları */}
                  {!isUser && msg.facts && msg.facts.length > 0 && (
                    <div className="pt-2 border-t border-[#a89997] space-y-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#4a3e3b] flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-[#231c1a]" />
                        <span>Doğrulanmış Telemetri Bulguları</span>
                      </span>
                      <ul className="space-y-1">
                        {msg.facts.map((fact, fIdx) => (
                          <li
                            key={fIdx}
                            className="p-2 rounded-lg bg-[#cdc1b5] border border-[#a89997] text-[11px] text-[#4a3e3b] flex items-start gap-2 font-medium"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-[#231c1a] mt-1.5 shrink-0" />
                            <span>{fact}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Ölçülen Kanıt Sinyalleri */}
                  {!isUser && msg.evidence && msg.evidence.length > 0 && (
                    <div className="pt-2 border-t border-[#a89997] space-y-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#4a3e3b] flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3 text-[#231c1a]" />
                        <span>Ölçülen Kanıt Sinyalleri</span>
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {msg.evidence.map((ev, eIdx) => (
                          <div
                            key={eIdx}
                            className="p-2 rounded-lg bg-[#cdc1b5] border border-[#a89997] text-[11px] space-y-0.5"
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-bold text-[#231c1a] truncate">{ev.metric}</span>
                              <span className="font-bold text-[#231c1a] bg-[#f9b88e] px-1.5 py-0.2 rounded border border-[#231c1a]/15 text-[10px] shrink-0">
                                {ev.value}
                              </span>
                            </div>
                            <span className="text-[10px] text-[#4a3e3b] block truncate">{ev.source}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Önerilen Mühendislik Aksiyonları */}
                  {!isUser && msg.recommendedActions && msg.recommendedActions.length > 0 && (
                    <div className="pt-2 border-t border-[#a89997] space-y-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#231c1a] flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-[#231c1a]" />
                        <span>Önerilen Mühendislik Aksiyonları</span>
                      </span>
                      <div className="space-y-1">
                        {msg.recommendedActions.map((action, aIdx) => (
                          <div
                            key={aIdx}
                            className="p-2 rounded-lg bg-[#cdc1b5] border border-[#a89997] text-[11px] text-[#4a3e3b] flex items-start gap-2 font-medium"
                          >
                            <span className="w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center shrink-0 bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/15 mt-0.5">
                              {aIdx + 1}
                            </span>
                            <span className="leading-relaxed">{action}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Arka Planda Çalıştırılan Araçlar (Tool Invocations) */}
                  {!isUser && (() => {
                    const tools = msg.trace?.toolsUsed || [];
                    if (tools.length === 0) return null;
                    // Araç adı çağrıdan ÖNCE listeye girer (bkz. agentPlanner),
                    // yani başarısız bir çağrı da burada görünür. Her satıra onay
                    // işareti ve "Tamamlandı" yazmak, hiç veri getirmemiş bir
                    // aracı başarılı göstermek olurdu; durum iz adımlarından
                    // (`tool` alanı) okunur ve eşleşme bulunamazsa yalnızca
                    // doğrulanabilir olan söylenir: araç sorgulandı.
                    const toolStatuses = new Map<string, AnalysisTraceStep['status']>();
                    for (const step of msg.trace?.steps || []) {
                      if (step.tool) toolStatuses.set(step.tool, step.status);
                    }
                    return (
                      <div className="pt-2 border-t border-[#a89997] space-y-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#4a3e3b] flex items-center gap-1">
                          <Wrench className="w-3 h-3 text-[#231c1a]" />
                          <span>Sorgulanan GitHub Telemetri Araçları</span>
                        </span>
                        <div className="space-y-1">
                          {tools.map((toolName, tIdx) => {
                            const status = toolStatuses.get(toolName);
                            const failed = status === 'failed';
                            return (
                              <div
                                key={tIdx}
                                className="p-2 rounded bg-[#cdc1b5] border border-[#a89997] text-[11px] flex items-center justify-between gap-2"
                              >
                                <div className="flex items-center gap-1.5">
                                  {failed ? (
                                    <AlertCircle className="w-3 h-3 text-[#f9b88e]" aria-hidden="true" />
                                  ) : status === 'completed' ? (
                                    <CheckCircle2 className="w-3 h-3 text-[#231c1a]" aria-hidden="true" />
                                  ) : (
                                    <span className="w-3 h-3 rounded-full border border-[#4a3e3b]" aria-hidden="true" />
                                  )}
                                  <span className="font-mono font-bold text-[#231c1a]">
                                    {toolName}
                                  </span>
                                </div>
                                <span className="text-[10px] text-[#4a3e3b] font-bold">
                                  {failed ? 'Başarısız' : status === 'completed' ? 'Tamamlandı' : 'Sorgulandı'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {isUser && (
                  <div className="w-7 h-7 rounded-lg bg-[#b9aba9] border border-[#a89997] flex items-center justify-center shrink-0 text-[#231c1a] shadow-xs mt-0.5">
                    <User className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
            );
          })
        }

        {/*
          Hızlı Başlangıç İpuçları.
          Koşul artık "hiç mesaj yok" değil, "kullanıcı sırası başlamadı": sohbet
          her zaman karşılama mesajıyla açıldığı için eski koşul hiçbir zaman
          doğru olmuyordu ve örnek sorular — yazılmış olmalarına rağmen —
          kullanıcıya HİÇ gösterilmiyordu. Karşılamadan sonra, ilk soru
          sorulmadan önce gösterilir; "Sohbeti Temizle" ile geri gelir.
        */}
        {!hasUserTurn && (
          <div className="flex flex-col items-center justify-center text-center p-6 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-[#f9b88e] border border-[#231c1a]/15 flex items-center justify-center text-[#231c1a] shadow-xs">
              <Terminal className="w-6 h-6" />
            </div>
            <div className="max-w-md space-y-1">
              <h3 className="text-sm font-bold text-[#231c1a]">
                Kod Tabanınız Hakkında Soru Sorun
              </h3>
              <p className="text-xs text-[#4a3e3b] font-medium">
                Ajan; depolarınızı, kritik dosyaları, hata oranlarını ve PR durumlarını analiz ederek somut yanıtlar üretir.
              </p>
            </div>

            <div className="w-full max-w-lg space-y-2 pt-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#4a3e3b] block text-left">
                Örnek Mühendislik Soruları
              </span>
              {defaultPrompts.map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => onSendMessage(prompt)}
                  // Uçuşta bir yanıt varken ikinci kez tetiklemek sunucuda
                  // ikinci bir yapay zeka üretimi (faturalanan çağrı)
                  // başlatırdı; giriş çubuğuyla aynı kapı uygulanır.
                  disabled={isLoading}
                  className="w-full text-left p-2.5 rounded-lg border border-[#a89997] bg-[#b9aba9]/30 hover:bg-[#b9aba9]/50 transition-all text-xs font-bold text-[#231c1a] cursor-pointer shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  "{prompt}"
                </button>
              ))}
            </div>
          </div>
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

        {/* Canlı Yapay Zeka Ajanı Analiz İzi (Active Trace) */}
        {activeTrace && activeTrace.steps && activeTrace.steps.length > 0 && (
          <div className="p-3 rounded-xl border border-[#a89997] bg-[#cdc1b5] space-y-2 text-xs">
            <div className="flex items-center justify-between border-b border-[#a89997] pb-1.5 font-bold text-[#231c1a]">
              <span className="flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-[#231c1a]" />
                <span>Son Analiz Yürütme İzi ({activeTrace.durationSeconds}s)</span>
              </span>
              <span className="text-[10px] text-[#4a3e3b]">
                {activeTrace.dataPointsAnalyzed} veri noktası
              </span>
            </div>
            <div className="space-y-1">
              {activeTrace.steps.map((step, idx) => (
                <div key={idx} className="flex items-start justify-between gap-2 text-[11px] text-[#4a3e3b]">
                  <span className="flex items-start gap-1 min-w-0">
                    {/* Simge ADIMIN DURUMUNU bildirir: her adıma onay işareti
                        koymak, başarısız bir araç çağrısını başarılı gibi
                        gösterirdi (bkz. AnalysisTraceStep.status). Hata ayrıntısı
                        da gösterilir: `details` alanı başarısız adımda tam olarak
                        hatanın kendisini taşır ve gizlenirse kullanıcı izde
                        yalnızca "başarısız oldu" cümlesini görür. */}
                    {step.status === 'failed' ? (
                      <AlertCircle className="w-3 h-3 text-[#f9b88e] shrink-0 mt-0.5" aria-hidden="true" />
                    ) : step.status === 'completed' ? (
                      <Check className="w-3 h-3 text-[#231c1a] shrink-0 mt-0.5" aria-hidden="true" />
                    ) : (
                      <span className="w-3 h-3 rounded-full border border-[#4a3e3b] shrink-0 mt-0.5" aria-hidden="true" />
                    )}
                    <span className="min-w-0">
                      <span className="block">{step.step}</span>
                      {step.details && (
                        <span className="block text-[10px] text-[#4a3e3b]/80 break-words">{step.details}</span>
                      )}
                    </span>
                  </span>
                  {/* Süre ölçülmemiş olabilir: `${step.durationMs}ms` yazmak
                      "undefinedms" basardı. */}
                  {typeof step.durationMs === 'number' && (
                    <span className="font-mono text-[10px] shrink-0">{step.durationMs}ms</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Mesaj Yazma Giriş Çubuğu */}
      {/* Odak göstergesi giriş kutusunun KENDİSİNDE değil, çerçevede verilir
          (`focus-within`): metin alanı çerçevenin içinde durduğu için odak
          halkası yerine kenarlık rengi değişir. `focus:outline-none` tek başına
          bırakılsaydı klavye kullanıcısı Tab ile buraya geldiğinde ekranda
          hiçbir değişiklik görmez, odağın nerede olduğunu anlayamazdı
          (WCAG 2.4.7; aynı desen RepositoriesView arama kutusunda da var). */}
      <form
        onSubmit={handleSubmit}
        className="mt-3 flex items-center gap-2 p-1.5 rounded-xl border border-[#a89997] bg-[#cdc1b5] shadow-xs shrink-0 transition-colors focus-within:border-[#231c1a]"
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Mühendislik veya depo analizi hakkında soru sorun..."
          disabled={isLoading}
          aria-label="Soru yazma alanı"
          className="flex-1 bg-transparent px-3 py-2 text-xs text-[#231c1a] placeholder-[#4a3e3b] focus:outline-none disabled:opacity-50 font-medium"
        />
        <button
          type="submit"
          disabled={!input.trim() || isLoading}
          aria-label="Mesajı gönder"
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-[#f9b88e] text-[#231c1a] hover:brightness-105 transition-all cursor-pointer disabled:opacity-40 border border-[#231c1a]/20 shadow-xs"
        >
          <span>Gönder</span>
          <Send className="w-3 h-3 text-[#231c1a]" aria-hidden="true" />
        </button>
      </form>
    </div>
  );
};
