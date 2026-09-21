import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.tsx';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5, // 5 minutes
      // Varsayılan 3 denemedir ve her deneme tam zaman aşımı bütçesi kadar
      // sürebilir: uç sınırına indirgenmiş ~55 sn'lik bir bütçede başarısız bir
      // telemetri okuması kullanıcıya ~4 dakika sonra hata gösterirdi
      // (4 × 55 sn + geri çekilme). Ölçüm panosunda bu, veriyi "yok" gibi
      // göstermenin en kötü biçimidir; tek deneme bırakılır ve kullanıcıya
      // zaten açık bir "Tekrar dene" yolu sunulur (bkz. App.tsx handleRetry).
      retry: 1,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
