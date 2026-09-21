import { Router } from 'express';
import { GitHubService } from '../github/githubService.js';
import { deriveRepositoryRiskLevel, groupHotspotsByRepo } from '../../src/constants.js';
import { asyncHandler } from './asyncHandler.js';
import { respondIfSyncFailed, SYNC_FAILED_MESSAGE } from './syncGuard.js';

const authRouter = Router();
const reposRouter = Router();

// ------------------------------------------
// AUTH ROUTES (/api/auth)
// ------------------------------------------
authRouter.get('/status', asyncHandler(async (_req, res) => {
  let state = GitHubService.getState();
  try {
    state = await GitHubService.ensureSynced();
  } catch {
    state = GitHubService.getState();
  }
  res.json({
    authenticated: Boolean(state.token),
    user: state.token ? state.user : null,
    lastSyncAt: state.lastSyncAt || null,
    syncStatus: state.syncStatus,
    syncError: state.syncError,
    telemetryStatus: state.telemetryStatus,
    rateLimitStatus: GitHubService.getRateLimitStatus(),
    isCachedFromDb: Boolean(state.isCachedFromDb),
  });
}));

authRouter.post('/token', (_req, res) => {
  return res.status(403).json({
    error: 'Arayüz üzerinden token girişi devre dışı bırakılmıştır. Sistem yalnızca .env dosyasındaki GITHUB_TOKEN ile çalışmaktadır.',
  });
});

// ------------------------------------------
// REPOS ROUTES (/api/repos)
// ------------------------------------------
reposRouter.get('/', asyncHandler(async (_req, res) => {
  const ctx = await GitHubService.getActiveTelemetryContext();
  if (respondIfSyncFailed(res, ctx.state)) return;
  const { state, hotspots } = ctx;

  // Sıcak noktalar depoya göre BİR kez gruplanır (tek geçiş): her depo için tüm
  // listeyi yeniden taramak O(depo × sıcak nokta) maliyeti üretirdi. Gruplama
  // da tek kaynaktadır; ajan projeksiyonu aynı fonksiyonu çağırır.
  const hotspotsByRepo = groupHotspotsByRepo(hotspots);

  const enrichedRepos = state.repositories.map((repo) => ({
    ...repo,
    // Eşikleme kuralı tek kaynakta (bkz. deriveRepositoryRiskLevel): ajan
    // projeksiyonu ve olgu satırı da aynı fonksiyonu çağırır, böylece aynı
    // telemetri iki yüzeyde iki farklı seviye gösteremez.
    risk_level: deriveRepositoryRiskLevel(hotspotsByRepo.get(repo.name) || []),
  }));

  res.json({
    repositories: enrichedRepos,
    lastSyncAt: state.lastSyncAt || null,
    syncStatus: state.syncStatus,
    syncError: state.syncError,
    telemetryStatus: state.telemetryStatus,
    rateLimitStatus: GitHubService.getRateLimitStatus(),
    isCachedFromDb: Boolean(state.isCachedFromDb),
  });
}));

reposRouter.post('/toggle', asyncHandler(async (req, res) => {
  const { repoId } = req.body;
  if (!repoId || typeof repoId !== 'string') {
    return res.status(400).json({ error: 'repoId alanı zorunludur.' });
  }
  const repos = await GitHubService.toggleRepoSelection(repoId);
  res.json({ success: true, repositories: repos });
}));

reposRouter.post('/sync', asyncHandler(async (_req, res) => {
  try {
    const state = await GitHubService.syncRepositories(true);
    if (state.syncStatus === 'no_data') {
      return res.status(409).json({ error: 'Eşitleme için önce bir GitHub hesabı bağlayın.' });
    }
    res.json({
      success: true,
      lastSyncAt: state.lastSyncAt || null,
      repositoriesCount: state.repositories.length,
      syncStatus: state.syncStatus,
      syncError: state.syncError,
      telemetryStatus: state.telemetryStatus,
      rateLimitStatus: GitHubService.getRateLimitStatus(),
      isCachedFromDb: false,
    });
  } catch (err: unknown) {
    // Yedek metin tek kaynaktan (bkz. syncGuard): burada ayrı yazılan bir kopya,
    // aynı hatayı iki uçta iki farklı cümleyle anlatırdı.
    const errorMsg = err instanceof Error ? err.message : SYNC_FAILED_MESSAGE;
    res.status(502).json({ error: errorMsg });
  }
}));

export default { authRouter, reposRouter };
