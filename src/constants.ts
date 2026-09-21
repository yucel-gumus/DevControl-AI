import { EngineeringHealthScore, EngineeringRisk, FileHotspot, HealthScoreDimensions, Repository } from './types.js';

/**
 * Deponun risk seviyesi, hotspot ciddiyetinin depo düzeyine indirgenmesiyle
 * türetilir (bkz. `deriveRepositoryRiskLevel`). `Repository['risk_level']`
 * isteğe bağlı bir alandır: türetilmiş değer yalnızca yanıt/projeksiyon
 * katmanında eklenir, kalıcı telemetri durumunda tutulmaz.
 */
export type RepositoryRiskLevel = NonNullable<Repository['risk_level']>;

export const RISK_TR_MAP: Record<string, string> = {
  CRITICAL: 'KRİTİK',
  HIGH: 'YÜKSEK',
  MEDIUM: 'ORTA',
  LOW: 'DÜŞÜK',
};

export const PRIORITY_TR_MAP: Record<string, string> = {
  HIGH: 'YÜKSEK',
  MEDIUM: 'ORTA',
  LOW: 'DÜŞÜK',
  OPPORTUNITY: 'FIRSAT',
};

/**
 * Tek bir depoya atfedilemeyen (portföy geneli ölçülen) risklerin kapsam
 * etiketi. Sunucu bu riskleri bu adla anar (günlük bülten, ajan olguları),
 * istemci de boş depo adı yerine aynı etiketi gösterir; böylece aynı kavram
 * iki yüzeyde iki farklı adla görünmez.
 */
const PORTFOLIO_SCOPE_LABEL = 'Portföy Geneli';

/**
 * Sağlık boyutlarının kullanıcıya görünen adları (tek kaynak).
 *
 * Aynı boyut birden çok yüzeyde anılır (günlük bülten maddesi, ajan olgu
 * satırı/kanıt paneli, istemci mini özeti); adların her yüzeyde yeniden
 * yazılması, aynı boyutun bir yerde "İşbirliği" diğerinde "İş Birliği"
 * görünmesine yol açardı. Yeni bir yüzey de adı buradan okur.
 */
export const HEALTH_DIMENSION_LABELS: Record<keyof HealthScoreDimensions, string> = {
  codeHealth: 'Kod Sağlığı',
  delivery: 'Teslimat',
  documentation: 'Dokümantasyon',
  maintenance: 'Bakım',
  collaboration: 'İş Birliği',
  activity: 'Aktivite',
};

/**
 * Yalnızca ÖLÇÜLMÜŞ boyutları "Etiket: skor" olarak biçimler.
 *
 * `dimensions` sözlüğü ölçülmemiş bir boyut için de `0` taşır (bkz.
 * HealthEngine); süzgeçsiz bir "Kod Sağlığı: 0" yazımı, hiç hesaplanmamış bir
 * boyutu ölçülmüş sıfır olarak sunar — üstelik bu metin yalnızca kullanıcıya
 * değil, ajan tarafında TypeSafe olgu denetimine KANIT olarak da gider ve
 * denetim, uydurma sıfırı doğrulanmış telemetri sayar. Hangi boyutun ölçüldüğü
 * tek kaynaktan okunur: `EngineeringHealthScore.measuredDimensions`.
 *
 * İstenen boyutların hiçbiri ölçülmediyse `whenNoneMeasured` döner: çağıran
 * kendi yüzeyine uygun cümleyi verir, böylece boş bir liste "()" gibi okunmaz
 * bir çıktı üretmez.
 */
export function formatMeasuredHealthDimensions(
  healthScore: Pick<EngineeringHealthScore, 'dimensions' | 'measuredDimensions'>,
  dimensions: readonly (keyof HealthScoreDimensions)[],
  whenNoneMeasured: string,
): string {
  const parts = dimensions
    .filter((dimension) => healthScore.measuredDimensions.includes(dimension))
    .map((dimension) => `${HEALTH_DIMENSION_LABELS[dimension]}: ${healthScore.dimensions[dimension]}`);
  return parts.length > 0 ? parts.join(', ') : whenNoneMeasured;
}

/**
 * Riskin kapsamını gösterilecek adla döner.
 * `scope === 'portfolio'` olan kayıtlarda `affectedRepository` bilinçli olarak
 * boştur; depo adı yerine kapsam etiketi gösterilir (bkz. EngineeringRisk).
 */
export function describeRiskScope(risk: EngineeringRisk): string {
  if (risk.scope === 'portfolio') return PORTFOLIO_SCOPE_LABEL;
  return risk.affectedRepository || risk.repo_name || '';
}

/**
 * Riskin verilen depoya ait olup olmadığını döner.
 *
 * Tek kaynak: aynı karşılaştırma üç ayrı yerde kopyalanmıştı ve kopyalar
 * birbirine eşdeğer değildi (biri `affectedRepository` tanımsızken çöker, biri
 * `repo_name` yedeğini taşır). Kapsam adı, gösterimde kullanılan alanla aynı
 * sırayla çözülür (`affectedRepository`, yoksa `repo_name`) ki bir risk
 * gösterildiği depodan başka bir deponun filtresine düşmesin.
 *
 * Portföy geneli riskler tek bir depoya atfedilemez (bkz. describeRiskScope) ve
 * bu yüzden hiçbir depo adıyla eşleşmez.
 */
export function riskMatchesRepo(risk: EngineeringRisk, repoName: string): boolean {
  const target = (repoName || '').trim().toLowerCase();
  if (!target || risk.scope === 'portfolio') return false;
  const riskRepoName = (risk.affectedRepository || risk.repo_name || '').trim().toLowerCase();
  return riskRepoName === target;
}

/**
 * Deponun hotspot telemetrisinden türetilen risk seviyesi.
 *
 * Tek kaynak: aynı eşikleme iki yüzeyde kullanılır — `/api/repos` yanıtındaki
 * depo kartları ve ajanın istem projeksiyonu/olgu satırı. İki kopya, aynı
 * telemetri için iki yüzeyin farklı seviye göstermesine yol açardı; nitekim
 * ajan tarafı bu alanı hiç türetmediği için `risk_level` istemde tanımsız
 * kalıyor ve olgu satırı kalıcı olarak "hesaplanıyor" yazıyordu.
 *
 * Eşikleme ayrı bir sıralama tablosu kurmaz: CRITICAL dosya depoyu CRITICAL,
 * HIGH dosya AT_RISK yapar; MEDIUM/LOW dosyalar ise yalnızca "dikkat gerektiren
 * dosya var" anlamına gelir, yani aynı kovada (NEEDS_ATTENTION) toplanır.
 * Tablo yerine doğrudan karşılaştırma, `FileHotspot['risk_level']` ile
 * `EngineeringRisk['severity']` için tutulan ayrı bir ölçeğin zamanla
 * ayrışması riskini ortadan kaldırır (sıralama ölçeğinin tek kaynağı:
 * `RISK_LEVEL_ORDER`).
 *
 * Boş liste "ölçüm yapıldı, yüksek riskli dosya bulunmadı" demektir (HEALTHY).
 * Ölçümün hiç yapılmadığı durumu (hotspot telemetrisi yok) ayırt etmek
 * çağıranın sorumluluğundadır; bkz. agentPlanner olgu satırı.
 */
export function deriveRepositoryRiskLevel(hotspots: FileHotspot[]): RepositoryRiskLevel {
  let hasHighRiskFile = false;
  for (const hotspot of hotspots) {
    if (hotspot.risk_level === 'CRITICAL') return 'CRITICAL';
    if (hotspot.risk_level === 'HIGH') hasHighRiskFile = true;
  }
  if (hasHighRiskFile) return 'AT_RISK';
  return hotspots.length > 0 ? 'NEEDS_ATTENTION' : 'HEALTHY';
}

/**
 * Hotspot kayıtlarını depo adına göre gruplar (tek geçiş, O(hotspot)).
 *
 * `deriveRepositoryRiskLevel`'ın ölçütü budur: her depo için tüm listeyi
 * yeniden taramak O(depo × hotspot) maliyeti üretirdi. Gruplama da tek
 * kaynakta tutulur — iki kopya, anahtar kuralı değiştiğinde (ad normalizasyonu
 * ya da `full_name` ile anahtarlama) aynı depoyu bir yüzeyde AT_RISK, diğerinde
 * HEALTHY gösterebilirdi.
 */
export function groupHotspotsByRepo(hotspots: FileHotspot[]): Map<string, FileHotspot[]> {
  const byRepo = new Map<string, FileHotspot[]>();
  for (const hotspot of hotspots) {
    const bucket = byRepo.get(hotspot.repo_name);
    if (bucket) {
      bucket.push(hotspot);
    } else {
      byRepo.set(hotspot.repo_name, [hotspot]);
    }
  }
  return byRepo;
}
