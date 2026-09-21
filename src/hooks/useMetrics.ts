import { useQuery, useMutation, useQueryClient, QueryClient } from '@tanstack/react-query';
import {
  ActivityData,
  EngineeringHealthScore,
  FileHotspot,
  EngineeringRisk,
  TodayBriefItem,
  AuthStatusResponse,
  RepositoriesResponse,
  DeveloperPersona,
  RepoAiReview,
  HotspotRefactorRecommendation,
} from '../types.js';

import { apiClient } from '../utils/apiClient.js';
import { TELEMETRY_SYNC_WAIT_TIMEOUT_MS } from '../../server/constants.js';

const getQueryKey = (name: string, ...parts: unknown[]) => [name, ...parts];

/**
 * Telemetriden türeyen sorgu anahtarlarının TEK kaynağı.
 *
 * Anahtarlar hem sorgu tanımlarında hem geçersiz kılma listesinde kullanılır.
 * İki yerde ayrı yazılan dizgiler sessizce ayrışırdı: bir anahtar adı
 * değiştiğinde geçersiz kılma listesi ıskalar, hata ya da uyarı çıkmaz ve
 * seçim/eşitleme sonrası türev panolar bayat veri göstermeye devam eder
 * (React Query eski anahtarı ayrı bir önbellek girdisi sayar).
 */
const QUERY_KEYS = {
  authStatus: 'authStatus',
  repositories: 'repositories',
  healthScore: 'healthScore',
  hotspots: 'hotspots',
  risks: 'risks',
  dailyBrief: 'dailyBrief',
  activityData: 'activityData',
  developerPersona: 'developerPersona',
} as const;

/**
 * Seçim değişikliğinin eskittiği türev sorgular (analiz kapsamı değişince
 * hepsi yeniden hesaplanır).
 *
 * `authStatus` BURADADIR: seçim yolu sunucuda `syncError` ve `telemetryStatus`
 * alanlarını da yazar (yeni seçilen deponun telemetrisi çekilirken kısmi
 * başarı/hata oluşabilir; bkz. fetchRepositoryTelemetry). Tazelenmezse hata
 * şeridi kaynaklarından biri (`authData.syncError`) bayat kalır ve kullanıcı,
 * sunucuda artık kalmamış bir hatayı görmeye devam eder. Maliyeti yoktur:
 * /api/auth/status hızlı yolda (syncStatus ready/partial) eşitleme başlatmaz;
 * yalnızca gerçekten hata durumunda, fren içinde bir deneme yapar — istenen
 * kurtarma da budur.
 *
 * `developerPersona` FİYATLANDIRILAN bir yapay zeka üretimi olduğu için bu
 * listede DEĞİLDİR: her onay kutusuna basışta tazelemek, kullanıcının çoğu
 * zaman o an bakmadığı bir üretimi her tıklamada faturalandırırdı. Bunun
 * yerine eskimiş işaretlenir (bkz. markPersonaStale): kart bir sonraki
 * görüntülenmesinde, güncel kapsam için tam olarak bir kez üretilir.
 */
const SELECTION_DERIVED_KEYS = [
  QUERY_KEYS.authStatus,
  QUERY_KEYS.repositories,
  QUERY_KEYS.healthScore,
  QUERY_KEYS.hotspots,
  QUERY_KEYS.risks,
  QUERY_KEYS.dailyBrief,
  QUERY_KEYS.activityData,
] as const;

/**
 * Eşitlemenin eskittiği türev sorgular: seçime bağlı olanların tamamı (`authStatus`
 * dâhil; yeniden eşitleme `lastSyncAt` alanını tazeler) ve `developerPersona`.
 *
 * Persona burada seçim değişikliğinden FARKLI olarak hemen tazelenir: eşitleme
 * kullanıcının açık isteğidir ve sunucu bu istekte persona önbelleğini zaten
 * düşürür (bkz. invalidateSelectionDerivedCaches) — tazelememek, "Yenile"ye
 * basan kullanıcıya eşitleme öncesi kapsamın personasını göstermeye devam
 * ederdi ("kullanıcı iki farklı sayı görmez" kuralı; bkz. /developer-persona).
 */
const SYNC_DERIVED_KEYS = [
  ...SELECTION_DERIVED_KEYS,
  QUERY_KEYS.developerPersona,
] as const;

/**
 * Verilen türev sorguların önbelleğini geçersiz kılar.
 *
 * Anahtar dizgileri tek kaynaktan (QUERY_KEYS) gelir: iki yerde ayrı yazılan
 * dizgiler sessizce ayrışırdı — bir anahtar adı değiştiğinde geçersiz kılma
 * listesi ıskalar, hata ya da uyarı çıkmaz ve seçim/eşitleme sonrası türev
 * panolar bayat veri göstermeye devam ederdi (React Query eski anahtarı ayrı
 * bir önbellek girdisi sayar).
 */
const invalidateQueries = (queryClient: QueryClient, keys: readonly string[]): void => {
  keys.forEach((key) => {
    queryClient.invalidateQueries({ queryKey: [key] });
  });
};

/**
 * Personayı YALNIZCA eskimiş işaretler; yeniden üretim isteği başlatmaz
 * (`refetchType: 'none'`).
 *
 * Seçim değişikliğinde sunucu persona önbelleğini düşürür (bkz.
 * invalidateSelectionDerivedCaches): kart eski kapsamın personasını gösterirken
 * KPI kartları yeni kapsamı ölçer ve aynı ekranda iki farklı kapsam görünür.
 * Persona fiyatlandırılan bir üretim olduğu için hemen tazelenemez; eskimiş
 * işaretlemek ikisini uzlaştırır — gözlemcisi olmayan bu sorgu ancak kart
 * yeniden görüntülendiğinde (görünüm bağlandığında) istek atar, yani tıklama
 * başına değil, görüntüleme başına bir üretim.
 */
const markPersonaStale = (queryClient: QueryClient): void => {
  queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.developerPersona], refetchType: 'none' });
};

/**
 * Telemetri OKUYAN uçların istek seçenekleri.
 *
 * Bu uçların (authStatus, repositories, health, hotspots, risks, activity)
 * tamamı sunucuda `getActiveTelemetryContext()` üzerinden geçer ve hiç yüklü
 * telemetri yokken (soğuk başlangıç) tam bir GitHub eşitlemesini bekleyebilir
 * (bkz. getActiveTelemetryContext -> ensureSynced). 60 sn'lik varsayılan bu
 * beklemede dolup istemciyi iptal ettiriyordu; react-query her denemede yeniden
 * 60 sn beklediği için pano dakikalarca "Ölçüm yükleniyor" durumunda kalıp
 * ardından hata gösteriyordu — oysa sunucu ölçümü üretmeye devam ediyordu.
 *
 * Uç katman (Firebase Hosting) isteği 60 sn'de kestiği için dağıtımda bu bütçe
 * `apiClient` tarafından kısaltılır (bkz. src/utils/apiClient.ts ->
 * EDGE_TIMEOUT_MS); tam bütçe yalnızca uç katmanı olmayan kurulumlarda geçerlidir.
 */
const TELEMETRY_READ_OPTIONS = { timeoutMs: TELEMETRY_SYNC_WAIT_TIMEOUT_MS } as const;

export const useAuthStatus = () => {
  return useQuery<AuthStatusResponse>({
    queryKey: getQueryKey(QUERY_KEYS.authStatus),
    queryFn: () => apiClient('/api/auth/status', TELEMETRY_READ_OPTIONS),
  });
};

export const useRepositories = () => {
  return useQuery<RepositoriesResponse>({
    queryKey: getQueryKey(QUERY_KEYS.repositories),
    queryFn: () => apiClient('/api/repos', TELEMETRY_READ_OPTIONS),
  });
};

export const useHealthScore = () => {
  return useQuery<EngineeringHealthScore>({
    queryKey: getQueryKey(QUERY_KEYS.healthScore),
    queryFn: () => apiClient('/api/metrics/health', TELEMETRY_READ_OPTIONS),
  });
};

export const useHotspots = () => {
  return useQuery<FileHotspot[]>({
    queryKey: getQueryKey(QUERY_KEYS.hotspots),
    queryFn: () => apiClient('/api/metrics/hotspots', TELEMETRY_READ_OPTIONS),
  });
};

export const useRisks = () => {
  return useQuery<EngineeringRisk[]>({
    queryKey: getQueryKey(QUERY_KEYS.risks),
    queryFn: () => apiClient('/api/metrics/risks', TELEMETRY_READ_OPTIONS),
  });
};

export const useDailyBrief = () => {
  return useQuery<TodayBriefItem[]>({
    queryKey: getQueryKey(QUERY_KEYS.dailyBrief),
    // Bütçe diğer telemetri okumalarıyla AYNI kaynaktan gelir
    // (TELEMETRY_READ_OPTIONS): brifing de isteğin önünde aynı eşitleme
    // beklemesini yaşayabilir (bkz. getActiveTelemetryContext) ve ayrı yazılmış
    // bir kopya, iki bütçenin sessizce ayrışmasına yol açardı. 60 sn'lik
    // varsayılan bu beklemede dolup istemciyi iptal ettiriyordu: sunucu brifingi
    // üretip (faturalandırıp) önbelleğe alırken kullanıcı hata görüyordu.
    queryFn: () => apiClient('/api/ai/brief', TELEMETRY_READ_OPTIONS),
  });
};

export const useActivityData = (days: number = 30) => {
  return useQuery<ActivityData>({
    queryKey: getQueryKey(QUERY_KEYS.activityData, days),
    queryFn: () => apiClient(`/api/metrics/activity?days=${days}`, TELEMETRY_READ_OPTIONS),
  });
};

/**
 * Faturalanan yapay zeka mutasyonlarının küresel anahtarları.
 *
 * Bu iki uç, sunucuda gerçek bir yapay zeka üretimi (faturalanan çağrı)
 * başlatır ve "tek uçuş" kuralı bileşen durumuna bağlanamaz: kullanıcı sekme
 * değiştirdiğinde bileşen sökülür, istek sunucuda çalışmaya devam eder ve
 * dönüldüğünde yeni bileşen `isPending === false` görür — yani aynı anda ikinci
 * bir üretim başlatılabilirdi. `mutationKey`, uçuştaki isteğin sorgu
 * istemcisinde küresel olarak izlenmesini sağlar (bkz. useIsMutating); bekleyen
 * bir mutasyon, gözlemcisi kalmadığında da önbellekte "pending" kalır ve
 * yalnızca tamamlandığında çıkar.
 */
export const REPO_REVIEW_MUTATION_KEY = ['ai', 'repo-review'];
export const HOTSPOT_REFACTOR_MUTATION_KEY = ['ai', 'hotspot-refactor'];

// Mutations
export const useToggleRepo = () => {
  const queryClient = useQueryClient();
  return useMutation({
    // 120 sn: sunucu tarafında seçim değişikliği iki beklemeye yol açabilir —
    // (1) uçuştaki bir eşitlemenin bitmesi (seçim haritası eşitleme başında
    // alınır; beklemeden yazılırsa kullanıcının seçimi eşitleme tarafından
    // ezilir, bkz. toggleRepoSelection) ve (2) depo analiz kapsamına
    // alındığında tüm telemetrinin yeniden çekilmesi (fetchRepositoryTelemetry).
    // 60 sn'lik eski bütçe bu beklemede doluyor, istemci isteği iptal ediyordu;
    // seçim sunucuda uygulanmış olsa bile kullanıcı hata görüp eski durumu
    // okumaya devam ediyordu (türev sorgular hata durumunda geçersiz kılınmaz).
    mutationFn: (repoId: string) =>
      apiClient('/api/repos/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoId }),
        timeoutMs: TELEMETRY_SYNC_WAIT_TIMEOUT_MS,
      }),
    onSuccess: () => {
      invalidateQueries(queryClient, SELECTION_DERIVED_KEYS);
      markPersonaStale(queryClient);
    },
  });
};

export const useSyncRepos = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient('/api/repos/sync', {
        method: 'POST',
        timeoutMs: TELEMETRY_SYNC_WAIT_TIMEOUT_MS,
      }),
    onSuccess: () => {
      invalidateQueries(queryClient, SYNC_DERIVED_KEYS);
    },
  });
};

export const useDeveloperPersona = () => {
  return useQuery<DeveloperPersona>({
    queryKey: getQueryKey(QUERY_KEYS.developerPersona),
    // Bütçe brifingle aynı kaynaktan (bkz. useDailyBrief): persona da bir yapay
    // zeka üretimidir ve isteğin önünde eşitleme beklemesi olabilir.
    queryFn: () => apiClient('/api/ai/developer-persona', TELEMETRY_READ_OPTIONS),
    staleTime: 5 * 60 * 1000,
  });
};

export const useRepoReview = () => {
  const queryClient = useQueryClient();
  return useMutation<RepoAiReview, Error, { repoName: string; force?: boolean }>({
    // Küresel tek uçuş anahtarı (bkz. REPO_REVIEW_MUTATION_KEY).
    mutationKey: REPO_REVIEW_MUTATION_KEY,
    // 120 sn: sunucu tarafında yapay zeka sentezi en fazla AI_TOTAL_TIMEOUT_MS
    // (30 sn) sürer, ama istek bundan önce uçuştaki bir eşitlemeyi bekleyebilir
    // ve depo analiz kapsamında değilse sunucu onu kapsama alıp telemetrisini
    // çeker (bkz. resolveRepoCommits). 60 sn'lik eski bütçe bu bekleme
    // sırasında dolup istemciyi iptal ettiriyordu: sunucu yanıtı üretmeye devam
    // edip yapay zeka çağrısını faturalandırıyor, kullanıcı ise sonucu hiç
    // göremiyordu (bkz. getActiveTelemetryContext).
    mutationFn: ({ repoName, force }: { repoName: string; force?: boolean }) =>
      apiClient('/api/ai/repo-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // `force` sunucudaki 7 günlük inceleme önbelleğini atlar (bkz.
        // server/routes/ai.ts): "Yeniden Üret" kullanıcının açık isteğidir.
        body: JSON.stringify({ repoName, force: Boolean(force) }),
        timeoutMs: TELEMETRY_SYNC_WAIT_TIMEOUT_MS,
      }),
    onSuccess: () => {
      // Sunucu, incelenen depo analiz kapsamında değilse onu analize dahil eder
      // (bkz. resolveRepoCommits). Bu, seçili depo kümesini ve dolayısıyla tüm
      // türev panoları değiştirebilir; geçersiz kılınmazsa kullanıcı inceleme
      // ekranını kapatıp döndüğünde eski telemetriyi görür.
      invalidateQueries(queryClient, SELECTION_DERIVED_KEYS);
      markPersonaStale(queryClient);
    },
  });
};

export const useHotspotRefactor = () => {
  const queryClient = useQueryClient();
  return useMutation<HotspotRefactorRecommendation, Error, { filePath: string; repoName: string }>({
    // Küresel tek uçuş anahtarı (bkz. REPO_REVIEW_MUTATION_KEY).
    mutationKey: HOTSPOT_REFACTOR_MUTATION_KEY,
    // 120 sn: depo incelemesiyle aynı gerekçe (bkz. useRepoReview): istek
    // uçuştaki bir eşitlemeyi bekleyebilir ve dosyanın deposu analiz kapsamında
    // değilse sunucu onu kapsama alıp telemetrisini çeker.
    mutationFn: ({ filePath, repoName }: { filePath: string; repoName: string }) =>
      apiClient('/api/ai/hotspot-refactor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath, repoName }),
        timeoutMs: TELEMETRY_SYNC_WAIT_TIMEOUT_MS,
      }),
    onSuccess: () => {
      // Depo incelemesiyle aynı gerekçe (bkz. useRepoReview): uç nokta, dosyanın
      // deposu analiz kapsamında değilse onu analize dahil eder
      // (server/routes/ai.ts -> resolveRepoCommits). Seçili depo kümesi
      // değiştiğinde türev panolar eskimiştir; geçersiz kılınmazsa kullanıcı
      // sunucunun artık analiz etmediği kapsamın KPI değerlerini görür.
      invalidateQueries(queryClient, SELECTION_DERIVED_KEYS);
      markPersonaStale(queryClient);
    },
  });
};
