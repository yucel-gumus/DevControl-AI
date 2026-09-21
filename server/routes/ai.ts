import { Router } from 'express';
import { GitHubService, GitHubStoreState } from '../github/githubService.js';
import { InsightsEngine } from '../ai/insightsEngine.js';
import { AgentPlanner } from '../ai/agentPlanner.js';
import { HotspotEngine } from '../metrics/hotspotEngine.js';
import { FirestoreService } from '../db/firestoreService.js';
import { asyncHandler } from './asyncHandler.js';
import { respondIfSyncFailed } from './syncGuard.js';
import { CommitMetric, Repository } from '../../src/types.js';

const router = Router();

/**
 * Aynı imza için UÇUŞTAKİ türev üretimi (tek uçuş).
 *
 * Brifing ve persona faturalanan yapay zeka zincirleridir; önbellek boşken iki
 * sekme (ya da iki istemci) aynı anda isterse ikisi de aynı telemetri için ayrı
 * bir üretim başlatır ve maliyet ikiye katlanır. Anahtar, çıktının hangi
 * telemetriye ait olduğunu taşır (bkz. telemetryContextSignature): farklı bir
 * imza için bekleyen bir üretim PAYLAŞILMAZ — paylaşılsaydı çağıran, kendi
 * telemetrisine ait olmayan bir yanıt alırdı.
 */
const inFlightDerivations = new Map<string, Promise<unknown>>();

function singleFlight<T>(key: string, produce: () => Promise<T>): Promise<T> {
  const existing = inFlightDerivations.get(key);
  if (existing) return existing as Promise<T>;
  const promise = produce().finally(() => {
    // Yalnızca kendi girdisi temizlenir: aynı anahtar için yeni bir üretim
    // başlamışsa onun sözü haritada kalmalıdır.
    if (inFlightDerivations.get(key) === promise) {
      inFlightDerivations.delete(key);
    }
  });
  inFlightDerivations.set(key, promise);
  return promise;
}

/**
 * Telemetriye bağlı bir türevi üretir: aynı imza için uçuşta olan üretimle
 * paylaşır (bkz. singleFlight) ve sonucu YALNIZCA imza değişmediyse önbelleğe
 * yazar.
 *
 * İki adım tek yerde durur çünkü ikisi aynı değişmezi korur: çağıran, kendi
 * telemetrisine ait olmayan bir yanıt almamalı ve önbellekteki kayıt da servis
 * edilen telemetriye ait olmalıdır. Üretim sürerken eşitleme tamamlanırsa imza
 * değişir; o an yazılan kayıt bayat telemetriyi "güncel" diye servis ederdi.
 * İki çağrı yerine kopyalanan bu karşılaştırma, yalnızca birinde düzeltilen bir
 * hatayı diğerinde bırakırdı.
 */
async function deriveForTelemetry<T>(
  keyPrefix: string,
  signature: string | null,
  produce: () => Promise<T>,
  store: (generated: T) => void,
): Promise<T> {
  return singleFlight(`${keyPrefix}:${signature}`, async () => {
    const generated = await produce();
    if (GitHubService.getTelemetrySignature() === signature) {
      store(generated);
    }
    return generated;
  });
}

/**
 * İstenen depoyu ve o deponun commit telemetrisini çözer.
 *
 * Depo analiz kapsamında değilse (henüz seçilmemişse) commit'i yoktur; bu
 * durumda depo analize dahil edilip telemetri yeniden okunur. Depo hiç
 * yoksa `null` döner ve çağıran katman 404 üretir — olmayan bir depo için
 * yapay zeka incelemesi/önerisi üretilmez.
 */
async function resolveRepoCommits(
  state: GitHubStoreState,
  repoName: string,
): Promise<{ targetRepo: Repository; commits: CommitMetric[] } | null> {
  const targetRepo = state.repositories.find(
    (repo) => repo.name.toLowerCase() === repoName.toLowerCase(),
  );
  if (!targetRepo) return null;

  const commitsOf = (source: GitHubStoreState) =>
    source.commits.filter((commit) => commit.repo_name.toLowerCase() === repoName.toLowerCase());

  let commits = commitsOf(state);
  if (commits.length === 0 && !targetRepo.selected_for_analysis) {
    try {
      await GitHubService.toggleRepoSelection(targetRepo.id);
      commits = commitsOf(GitHubService.getState());
    } catch {
      // Seçim değiştirilemezse mevcut (boş) telemetriyle devam edilir; çağıran
      // katman ölçümsüz durumu kendi 404/503 yanıtıyla açıkça bildirir.
    }
  }

  return { targetRepo, commits };
}

router.get('/brief', asyncHandler(async (_req, res) => {
  // Uçuştaki eşitlemeyi beklemez (bkz. getActiveTelemetryContext): brifing
  // yüklü telemetriden üretilir, eşitleme bitince önbellek zaten düşürülür.
  const ctx = await GitHubService.getActiveTelemetryContext({ waitForSync: false });
  if (respondIfSyncFailed(res, ctx.state)) return;

  // Hızlı Yol: üretilmiş brifing önbellekte varsa doğrudan dön. Önbellek iki
  // kaynaktan dolar: Firestore snapshot'ı (soğuk başlangıçta anında yanıt) ve
  // canlı telemetriden üretilen son brifing. Canlı bir eşitleme tamamlandığında
  // önbellek düşürülür (bkz. GitHubService: eşitleme sonunda türev yapay zeka
  // çıktıları geçersiz kılınır), yani burada servis edilen değer ya güncel
  // telemetriden gelir ya da henüz canlı eşitleme yapılmamış bir snapshot'tır.
  // Eskiden `isCachedFromDb` koşulu vardı: canlı modda önbellek yok sayılıp
  // brifing her istekte yeniden üretiliyordu; React Query'nin her yeniden
  // getirmesi böylece yeni bir Gemini çağrı zinciri faturalandırıyordu.
  const cachedBrief = GitHubService.getCachedDailyBrief();
  if (cachedBrief && cachedBrief.length > 0) {
    return res.json(cachedBrief);
  }

  // Üretim saniyeler sürebilir; bu sırada telemetri değişirse (uçuştaki bir
  // eşitleme tamamlanır ya da seçim değişir) üretilen brifing artık servis
  // edilen telemetriye ait değildir. İmza karşılaştırması bu yüzden yapılır:
  // aksi hâlde eşitlemenin az önce temizlediği önbellek bayat içerikle geri
  // dolar ve hızlı yol onu bir sonraki eşitlemeye kadar servis ederdi.
  const telemetrySignature = GitHubService.getTelemetrySignature();

  // "En istikrarlı depo" gibi karşılaştırmalı ifadeler yalnızca gerçekten
  // commit telemetrisi bulunan depolar üzerinden kurulmalıdır.
  const reposWithTelemetry = new Set(ctx.commits.map((c) => c.repo_name.toLowerCase()));
  // Üretim aynı imza için uçuşta olan bir istekle paylaşılır (bkz. singleFlight):
  // ikinci sekme, birincinin (faturalanan) sonucunu bekler.
  const brief = await deriveForTelemetry(
    'brief',
    telemetrySignature,
    () => InsightsEngine.generateDailyBrief(
      ctx.activeRepos,
      ctx.hotspots,
      ctx.risks,
      ctx.health,
      reposWithTelemetry,
    ),
    (generated) => GitHubService.setCachedDailyBrief(generated),
  );
  res.json(brief);
}));

router.post('/ask', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const question = body.question || body.query;
  if (typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ error: 'İstek gövdesinde soru veya sorgu parametresi zorunludur.' });
  }

  // Uçuştaki eşitlemeyi beklemez (bkz. getActiveTelemetryContext): soru yüklü
  // telemetriye göre yanıtlanır; eşitlemeyi beklemek istemci zaman aşımına
  // düşüp üretilen (faturalanan) yanıtı çöpe atardı.
  const ctx = await GitHubService.getActiveTelemetryContext({ waitForSync: false });
  if (respondIfSyncFailed(res, ctx.state)) return;

  try {
    const result = await AgentPlanner.answerQuestion(question, {
      repositories: ctx.activeRepos,
      commits: ctx.commits,
      pullRequests: ctx.pullRequests,
      issues: ctx.issues,
      hotspots: ctx.hotspots,
      risks: ctx.risks,
      healthScore: ctx.health,
    });

    // Yanıt tek sözleşmeyle döner: `AgentExecutionResult` (message + trace).
    // Alanları ayrıca düzleştirilmiş kopyalar olarak eklemek, aynı içeriği iki
    // şekilde taşır ve yeni bir alanın iki yerde tanımlanmasını gerektirirdi;
    // istemci de iki şekli birden savunmak zorunda kalırdı.
    res.json(result);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Yapay zeka mühendislik sorgusu işlenirken hata oluştu.';
    res.status(500).json({ error: errorMsg });
  }
}));

router.get('/developer-persona', asyncHandler(async (_req, res) => {
  // Diğer analiz uçlarıyla aynı kaynak: analiz kapsamı (seçili depolar) ve ona
  // ait telemetri. Böylece persona, aynı ekranda yanında duran KPI kartlarıyla
  // aynı kapsamı ölçer; kullanıcı iki farklı sayı görmez. Uçuştaki eşitlemeyi
  // beklemez (bkz. getActiveTelemetryContext).
  const ctx = await GitHubService.getActiveTelemetryContext({ waitForSync: false });
  const state = ctx.state;
  if (respondIfSyncFailed(res, state)) return;

  // Hızlı Yol: üretilmiş persona önbellekte varsa doğrudan dön (gerekçe için
  // bkz. /brief: önbellek canlı eşitlemede düşürülür, bu yüzden burada servis
  // edilen değer güncel telemetriye aittir).
  const cachedPersona = GitHubService.getCachedDeveloperPersona();
  if (cachedPersona) {
    return res.json(cachedPersona);
  }

  // Son 7 gün penceresi burada tekrar filtrelenmez: `generateDeveloperPersona`
  // haftalık commit sayısını zaten kendi içinde aynı ölçütle hesaplar. İki ayrı
  // filtre, iki farklı "haftalık commit" tanımı üretme riski taşır.
  const telemetrySignature = GitHubService.getTelemetrySignature();
  // Üretim aynı imza için uçuşta olan bir istekle paylaşılır ve sonuç yalnızca
  // telemetri imzası değişmediyse önbelleğe yazılır (bkz. deriveForTelemetry).
  const persona = await deriveForTelemetry(
    'persona',
    telemetrySignature,
    () => InsightsEngine.generateDeveloperPersona(
      state.user,
      ctx.activeRepos,
      ctx.commits,
    ),
    (generated) => GitHubService.setCachedDeveloperPersona(generated),
  );
  res.json(persona);
}));

router.post('/repo-review', asyncHandler(async (req, res) => {
  const repoName = req.body?.repoName;
  if (!repoName || typeof repoName !== 'string') {
    return res.status(400).json({ error: 'repoName alanı zorunludur.' });
  }

  // Hızlı Yol: önbellekte taze bir inceleme varsa senkronizasyonu hiç çalıştırma.
  // `ensureSynced()` gerekirse tüm GitHub telemetrisini yeniden çeker; önbellek
  // isabetinde bu maliyeti ödemek gereksizdir. Önbellek kaydı yalnızca bu
  // depo adı için gerçekten üretilmişse döner (bkz. FirestoreService.getRepoReview).
  //
  // `force` bu yolu atlar ve raporu güncel telemetriden yeniden üretir: arayüz
  // bunu "Yeniden Üret" düğmesiyle gönderir. Aksi halde 7 günlük TTL boyunca
  // önbellekteki rapor servis edilir ve mimarisi değişmiş bir depo için tek
  // çıkış yolu kalmazdı (yanıtın `reviewedAt` alanı, raporun yaşını bildirir).
  //
  // Değer KATI boolean olarak okunur (`=== true`): truthy bir değer ("false"
  // dizgisi, 1) önbelleği atlar ve her çağrıda faturalanan yeni bir üretim
  // başlatır; üretim sonunda `saveRepoReview` önbelleği tazelediği için TTL
  // koruması hiç devreye girmez ve `REVIEW_TTL_MS`'in amacı boşa çıkar. Arayüz
  // `Boolean(force)` gönderir; ama sözleşme çağıranın doğru yazmasına
  // bırakılamaz (aynı gövdeyi gönderen bir betik ya da istemci hatası).
  const forceRegenerate = req.body?.force === true;
  if (!forceRegenerate) {
    const cachedReview = await FirestoreService.getRepoReview(repoName);
    if (cachedReview) {
      return res.json(cachedReview);
    }
  }

  const state = await GitHubService.ensureSynced();
  if (respondIfSyncFailed(res, state)) return;

  // Önbellek ıskası: depo adı yine de doğrulanır, böylece olmayan bir depo için
  // yapay zeka incelemesi üretilmez (404).
  const resolved = await resolveRepoCommits(state, repoName);
  if (!resolved) {
    return res.status(404).json({ error: `${repoName} deposu bulunamadı.` });
  }
  const { targetRepo, commits } = resolved;

  const hotspots = HotspotEngine.analyzeHotspots(commits);
  const [owner, repoShortName] = (targetRepo.full_name && targetRepo.full_name.includes('/'))
    ? targetRepo.full_name.split('/')
    : [state.user.login, targetRepo.name];
  const fileTree = await GitHubService.fetchRepositoryTree(owner, repoShortName, targetRepo.default_branch);

  // ÖLÇÜMSÜZ İNCELEME ÜRETİLMEZ. Depo için ne analiz penceresinde commit
  // kaydı ne de dosya ağacı alınabildiyse (ağaç isteği başarısız olduğunda ya
  // da jeton yokken `fetchRepositoryTree` boş liste döner) modelin elinde
  // yalnızca depo üst verisi kalır; üretilen kalite skoru hiçbir telemetriye
  // dayanmaz ve 7 gün boyunca gerçek bir inceleme gibi servis edilirdi.
  // Kardeş uç (`/hotspot-refactor`) aynı ölçümsüz durumu 404 ile bildirir.
  if (commits.length === 0 && fileTree.length === 0) {
    return res.status(404).json({
      error: `${repoName} deposu için analiz penceresinde doğrulanmış commit veya dosya ağacı kaydı bulunmuyor; inceleme ölçümsüz veriyle üretilmez.`,
    });
  }

  const review = await InsightsEngine.reviewRepository(targetRepo, commits, hotspots, fileTree);
  if (!review) {
    // Yapay zeka katmanı geçerli bir inceleme üretemedi. Burada şablon bir
    // rapor döndürüp önbelleğe YAZMAK, sonraki 7 gün boyunca gerçek bir
    // inceleme gibi sunulacak uydurma veri oluştururdu; bunun yerine durum
    // açıkça bildirilir.
    return res.status(503).json({
      error: 'Yapay zeka incelemesi şu anda üretilemedi. Yapay zeka katmanının (GEMINI_API_KEY) yapılandırıldığından emin olun ve birkaç dakika sonra yeniden deneyin.',
    });
  }

  // Yalnızca gerçek yapay zeka incelemesi kalıcılaştırılır (Upsert).
  await FirestoreService.saveRepoReview(repoName, review);

  res.json(review);
}));

router.post('/hotspot-refactor', asyncHandler(async (req, res) => {
  const { filePath, repoName } = req.body || {};
  if (typeof filePath !== 'string' || !filePath || typeof repoName !== 'string' || !repoName) {
    return res.status(400).json({ error: 'filePath ve repoName alanları zorunludur.' });
  }

  const state = await GitHubService.ensureSynced();
  // Eşitleme hatasında analiz, boş telemetriyle yürütülür ve dosya için
  // ölçümsüz bir kayıt üretilirdi; diğer analiz uçlarıyla aynı kapı burada da
  // uygulanır (bkz. /ask, /brief, /developer-persona, /repo-review).
  if (respondIfSyncFailed(res, state)) return;

  const resolved = await resolveRepoCommits(state, repoName);
  if (!resolved) {
    return res.status(404).json({ error: `${repoName} deposu bulunamadı.` });
  }

  // Dosyanın risk seviyesi, güveni, kanıtı ve önerisi hotspot motorunun kritik
  // listeyle AYNI türetiminden gelir. Burada ayrı bir formülle kayıt üretmek,
  // aynı dosyayı listede ve detayda çelişkili metriklerle gösterme riski taşır.
  const targetHotspot = HotspotEngine.analyzeFileHotspot(
    resolved.commits,
    resolved.targetRepo.name,
    filePath,
  );
  if (!targetHotspot) {
    return res.status(404).json({
      error: `${repoName} deposunda ${filePath} dosyasına ait analiz penceresinde doğrulanmış commit kaydı bulunmuyor.`,
    });
  }

  const refactor = await InsightsEngine.suggestHotspotRefactoring(targetHotspot, resolved.commits);
  if (!refactor) {
    // Şablon bir "teşhis" veya uydurma bir kazanım yüzdesi döndürmek yerine
    // durum açıkça bildirilir (bkz. InsightsEngine.suggestHotspotRefactoring).
    return res.status(503).json({
      error: 'Yapay zeka yeniden yapılandırma önerisi şu anda üretilemedi. Lütfen birkaç dakika sonra yeniden deneyin.',
    });
  }

  res.json(refactor);
}));

export default router;
