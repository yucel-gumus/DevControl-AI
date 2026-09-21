/// <reference types="vite/client" />

/**
 * Vite'ın istemci tarafı ortam tipleri (`import.meta.env`).
 *
 * `VITE_` önekli değişkenler derleme anında istemci paketine gömülür; sunucuya
 * özgü hiçbir değer buradan okunmaz ve okunmamalıdır (bkz. server/constants.ts
 * dosya başındaki kural). Şu an tek kullanım: `VITE_EDGE_TIMEOUT_MS`
 * (bkz. src/utils/apiClient.ts -> EDGE_TIMEOUT_MS).
 */
interface ImportMetaEnv {
  /** Dağıtımın uç (edge) zaman aşımı; tanımsızsa Firebase Hosting'in 60 sn sınırı varsayılır. */
  readonly VITE_EDGE_TIMEOUT_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
