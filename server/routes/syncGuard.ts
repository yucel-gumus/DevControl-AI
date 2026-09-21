import { Response } from 'express';
import type { GitHubStoreState } from '../github/githubService.js';

/** Eşitleme hatasında tüm analiz uçlarının döndüğü tek yanıt metni. */
export const SYNC_FAILED_MESSAGE = 'GitHub verileri eşitlenemedi.';

/**
 * Durumda **servis edilebilir** ölçülmüş telemetri var mı?
 *
 * Başarısız bir eşitleme durumu boşaltmaz: `syncRepositories` hata dalında
 * ÖNCEKİ ölçümü geri yükler (depolar, commit/PR/issue listeleri, `lastSyncAt`,
 * telemetri durumu) ve yalnızca `syncStatus`'u 'error' yapar (bkz.
 * githubService -> connectWithToken hata dalı). Bu yüzden `lastSyncAt` "elde
 * ölçüm var" işaretidir. Hiç yoksa (soğuk başlangıçta ilk eşitleme başarısız
 * oldu) ortada ölçülmüş bir değer yoktur ve 502 doğru yanıttır.
 *
 * Depo listesi de koşula dâhildir: hata, depolar keşfedilmeden önce oluştuysa
 * geri yüklenen liste boştur ve boş listelerle devam etmek "0 kritik dosya"
 * gibi ölçüm varmış gibi görünen kayıtlar üretirdi.
 */
function hasUsableTelemetry(state: Pick<GitHubStoreState, 'lastSyncAt' | 'repositories'>): boolean {
  return Boolean(state.lastSyncAt) && state.repositories.length > 0;
}

/**
 * Eşitleme hatasını 502 ile yanıtlar ve `true` döner; hata yoksa yanıt üretmez
 * ve `false` döner. Çağıran, `if (respondIfSyncFailed(res, state)) return;`
 * biçiminde durur.
 *
 * Analiz uçları ölçülmüş telemetri olmadan anlamlı bir sonuç üretemez: hata
 * durumunda boş listelerle devam etmek, "0 kritik dosya" gibi ölçüm varmış
 * gibi görünen kayıtlar üretirdi. Kapı bu yüzden **ölçüm yokluğuna** bakar,
 * `syncStatus`'a değil: yeniden eşitleme başarısız olduğunda geri yüklenen
 * geçerli telemetri varken 502 dönmek, panelin tamamını (sağlık, hotspot, risk,
 * depo listesi) elde ölçüm dururken karartırdı — kullanıcı, hata şeridinde
 * zaten bildirilen bir eşitleme hatası yüzünden ölçülmüş kartlarını da
 * kaybederdi. Ölçüm varsa servis edilir; hata `syncError` alanıyla birlikte
 * yanıtta ve arayüz şeridinde görünmeye devam eder.
 *
 * Durum nesnesi bilinçli olarak parametredir: bazı uçlar `ctx.state` taşır,
 * bazıları `await ensureSynced()` sonucunu.
 */
export function respondIfSyncFailed(
  res: Response,
  state: Pick<GitHubStoreState, 'syncStatus' | 'syncError' | 'lastSyncAt' | 'repositories'>,
): boolean {
  if (state.syncStatus !== 'error') return false;
  if (hasUsableTelemetry(state)) return false;
  res.status(502).json({ error: state.syncError || SYNC_FAILED_MESSAGE });
  return true;
}
