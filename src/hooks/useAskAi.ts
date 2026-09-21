import { useRef, useState } from 'react';
import { AskAiMessage, AnalysisTrace } from '../types.js';
import { apiClient, ApiTimeoutError, getErrorMessage } from '../utils/apiClient.js';
import { AI_ASK_WORST_CASE_MS, TELEMETRY_SYNC_WAIT_TIMEOUT_MS } from '../../server/constants.js';
import type { AgentExecutionResult } from '../../server/ai/agentPlanner.js';

/**
 * İstemci zaman aşımı, sunucunun iki aşamasının TOPLAMIDIR:
 *
 *  1. İsteğin önündeki telemetri adımı (`getActiveTelemetryContext`). Telemetri
 *     yüklüyse uçuştaki eşitleme beklenmez; ama hiç yüklü telemetri yokken
 *     (soğuk başlangıçta ilk eşitleme sürerken) sunucu tam bir GitHub
 *     eşitlemesini bekler — saniyeler değil onlarca saniye. Bu beklemenin
 *     istemci bütçesi `TELEMETRY_SYNC_WAIT_TIMEOUT_MS`'tir.
 *  2. Yapay zeka aşamaları; en kötü durumu `AI_ASK_WORST_CASE_MS` ile
 *     sunucuda hesaplanır.
 *
 * Yalnızca (2)'yi kapsayan eski bütçe (45 sn), soğuk başlangıçta eşitleme
 * sürerken doluyordu: istemci isteği iptal ediyor, sunucu ise üretmeye devam
 * edip faturalandırdığı cevabı kullanıcıya hiç gösteremiyordu (bkz.
 * server/constants.ts -> AI_ASK_WORST_CASE_MS SINIR notu). İki bütçe tek
 * kaynaktan türetilir, böylece hiçbiri diğerinden bağımsız ayrışamaz.
 */
const ASK_TIMEOUT_MS = TELEMETRY_SYNC_WAIT_TIMEOUT_MS + AI_ASK_WORST_CASE_MS;

function createWelcomeMessage(): AskAiMessage {
  return {
    id: 'msg_welcome',
    role: 'assistant',
    content:
      'Merhaba! Ben KENSAI, sizin DevControl yapay zeka mühendislik analistinizim. GitHub hesabınızı bağladıktan sonra sunduğum her öngörü ve sağlık skoru doğrulanabilir depo gerçeklerine, commit günlüklerine ve kod değişim telemetrisine dayanır. Kod sağlığı, teslimat darboğazları veya riskler hakkında dilediğinizi sorabilirsiniz.',
    timestamp: new Date().toISOString(),
    facts: ['GitHub bağlantısı tamamlandığında canlı telemetri üzerinden analiz yapılır.'],
    interpretation: 'Sistem GitHub bağlantısı sonrası mimari ve teslimat analizi için hazır.',
  };
}

export function useAskAi() {
  const [chatMessages, setChatMessages] = useState<AskAiMessage[]>(() => [createWelcomeMessage()]);
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const [activeTrace, setActiveTrace] = useState<AnalysisTrace | null>(null);
  const [askAiPrompt, setAskAiPrompt] = useState<string>('');

  /**
   * Sohbet oturumu kimliği; her temizlemede artar ve App bunu AskAiView'in
   * React `key`i olarak kullanır. Neden gerekli: mesaj listesini sıfırlamak
   * bileşenin KENDİ yerel durumunu sıfırlamaz. Kullanıcı "depoyu analiz et"
   * yazıp (henüz göndermeden) "Sohbeti Temizle"ye basarsa, sohbet karşılama
   * mesajına döner ama giriş kutusu eski metni göstermeye devam ederdi; Enter'a
   * basmak temizlenmiş sohbete eski soruyu yeniden gönderirdi. `key`
   * değiştiğinde React bileşeni yeniden bağlar ve giriş metni, kopyalama geri
   * bildirimi dâhil tüm yerel durum sıfırlanır.
   */
  const [chatSessionId, setChatSessionId] = useState(0);

  /**
   * Uçuştaki isteğin kuşağı. `clearChat` bu sayacı artırır; böylece sohbet
   * temizlendikten sonra dönen bir yanıt, boşaltılmış sohbete sahipsiz bir
   * asistan mesajı ekleyemez ve yükleme göstergesini yeniden açamaz.
   */
  const requestGenerationRef = useRef(0);

  const clearChat = () => {
    requestGenerationRef.current += 1;
    setChatSessionId((id) => id + 1);
    setIsAiLoading(false);
    setChatMessages([createWelcomeMessage()]);
    setActiveTrace(null);
    setAskAiPrompt('');
  };

  const handleSendMessage = async (query: string) => {
    const generation = requestGenerationRef.current;
    const userMsg: AskAiMessage = {
      id: `msg_user_${Date.now()}`,
      role: 'user',
      content: query,
      timestamp: new Date().toISOString(),
    };

    setChatMessages((prev) => [...prev, userMsg]);
    setIsAiLoading(true);
    setActiveTrace(null);
    try {
      // Yanıt sözleşmesi sunucunun döndürdüğü türün aynısıdır
      // (`AgentExecutionResult`): alanları istemcide yeniden kurmak, sunucudaki
      // bir alan adı değiştiğinde sessizce boş bir mesaj üretme riski taşırdı.
      const data = await apiClient<AgentExecutionResult>('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, question: query }),
        timeoutMs: ASK_TIMEOUT_MS,
      });

      // Sohbet, bu istek uçuşta iken temizlendiyse yanıt ait olduğu bağlamı
      // kaybetmiştir; yok sayılır.
      if (generation !== requestGenerationRef.current) return;

      setActiveTrace(data.trace);
      setChatMessages((prev) => [...prev, data.message]);
    } catch (err: unknown) {
      if (generation !== requestGenerationRef.current) return;
      const errorMessage = err instanceof ApiTimeoutError
        ? 'Yapay zeka analizi zaman aşımına uğradı.'
        : getErrorMessage(err);
      setChatMessages((prev) => [
        ...prev,
        {
          id: `msg_err_${Date.now()}`,
          role: 'assistant',
          content: `Bu analizi yürütürken bir sorunla karşılaşıldı: ${errorMessage} Lütfen tekrar deneyin.`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      // Yalnızca en güncel istek yükleme durumunu kapatır: eski bir isteğin
      // bitişi, hâlâ süren yeni isteğin göstergesini kapatmamalıdır.
      if (generation === requestGenerationRef.current) {
        setIsAiLoading(false);
      }
    }
  };

  return {
    chatMessages,
    isAiLoading,
    activeTrace,
    askAiPrompt,
    chatSessionId,
    setAskAiPrompt,
    handleSendMessage,
    clearChat,
  };
}
