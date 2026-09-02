import { useState } from 'react';
import { AskAiMessage, AnalysisTrace } from '../types.js';

export function useAskAi() {
  const [chatMessages, setChatMessages] = useState<AskAiMessage[]>([
    {
      id: 'msg_welcome',
      role: 'assistant',
      content:
        'Merhaba! Ben sizin DevControl Yapay Zeka Mühendislik Analistinizim. GitHub hesabınızı bağladıktan sonra sunduğum her öngörü ve sağlık skoru doğrulanabilir depo gerçeklerine, commit günlüklerine ve kod değişim telemetrisine dayanır. Kod sağlığı, teslimat darboğazları veya riskler hakkında dilediğinizi sorabilirsiniz.',
      timestamp: new Date().toISOString(),
      facts: ['GitHub bağlantısı tamamlandığında canlı telemetri üzerinden analiz yapılır.'],
      interpretation: 'Sistem GitHub bağlantısı sonrası mimari ve teslimat analizi için hazır.',
    },
  ]);
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const [activeTrace, setActiveTrace] = useState<AnalysisTrace | null>(null);
  const [askAiPrompt, setAskAiPrompt] = useState<string>('');

  const handleSendMessage = async (query: string) => {
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
      const sessionId = localStorage.getItem('sessionId');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (sessionId) headers['x-session-id'] = sessionId;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 35_000);
      let data: any;
      try {
        const res = await fetch('/api/ai/ask', {
          method: 'POST',
          headers,
          body: JSON.stringify({ query, question: query }),
          signal: controller.signal,
        });
        data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(data?.error || `Yapay zeka isteği başarısız oldu (${res.status}).`);
        }
      } finally {
        clearTimeout(timeout);
      }

      const assistantMsg: AskAiMessage = {
        id: `msg_asst_${Date.now()}`,
        role: 'assistant',
        content: data.response || data.message?.content || data.content || 'Analiz tamamlandı.',
        timestamp: new Date().toISOString(),
        facts: data.facts || data.message?.facts || [],
        interpretation: data.interpretation || data.message?.interpretation || '',
        evidence: data.evidence || data.message?.evidence || [],
        recommendedActions: data.recommendedActions || data.message?.recommendedActions || [],
        trace: data.trace || data.message?.trace,
      };

      if (assistantMsg.trace) {
        setActiveTrace(assistantMsg.trace);
      }

      setChatMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMessage = err?.name === 'AbortError'
        ? 'Yapay zeka analizi zaman aşımına uğradı.'
        : err?.message || 'Bilinmeyen bir hata oluştu.';
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
      setIsAiLoading(false);
    }
  };

  return {
    chatMessages,
    isAiLoading,
    activeTrace,
    askAiPrompt,
    setAskAiPrompt,
    handleSendMessage,
  };
}
