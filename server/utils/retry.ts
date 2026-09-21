/**
 * Üstel geri çekilme (exponential backoff) gecikmesini hesaplar ve kalan toplam
 * süre bütçesini aşmaz.
 *
 * İki üst sınır birlikte uygulanır:
 *  1. `maxDelayMs` — tek bir beklemenin makul üst sınırı.
 *  2. `remainingTotalMs` — çağrının tamamı için kalan bütçe. Bu olmadan, bütçesi
 *     neredeyse tükenmiş bir çağrı, bütçesinin tamamından uzun bir süre uykuya
 *     yatabilir ve toplam süre garantisi anlamsızlaşırdı.
 *
 * Negatif bütçe (süre çoktan dolmuş) 0'a kırpılır; çağıran `<= 0` görürse
 * uyumadan vazgeçmelidir.
 */
export function boundedExponentialDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  remainingTotalMs: number,
): number {
  const exponential = baseDelayMs * 2 ** attempt;
  return Math.min(Math.min(maxDelayMs, exponential), Math.max(0, remainingTotalMs));
}
