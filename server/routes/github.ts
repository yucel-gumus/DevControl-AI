import { Router } from 'express';
import { GitHubService } from '../github/githubService.js';
import { asyncHandler } from './asyncHandler.js';

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
  if (ctx.state.syncStatus === 'error') {
    return res.status(502).json({ error: ctx.state.syncError || 'GitHub verileri eşitlenemedi.' });
  }
  const { state, hotspots } = ctx;

  const enrichedRepos = state.repositories.map((repo) => {
    const repoHotspots = hotspots.filter((h) => h.repo_name === repo.name);
    const hasCriticalHotspot = repoHotspots.some((h) => h.risk_level === 'CRITICAL');
    const hasHighHotspot = repoHotspots.some((h) => h.risk_level === 'HIGH');

    let riskLevel: 'HEALTHY' | 'NEEDS_ATTENTION' | 'AT_RISK' | 'CRITICAL' = 'HEALTHY';
    if (hasCriticalHotspot) riskLevel = 'CRITICAL';
    else if (hasHighHotspot) riskLevel = 'AT_RISK';
    else if (repoHotspots.length > 0) riskLevel = 'NEEDS_ATTENTION';

    return {
      ...repo,
      risk_level: riskLevel,
    };
  });

  res.json({
    repositories: enrichedRepos,
    lastSyncAt: state.lastSyncAt || null,
    syncStatus: state.syncStatus,
    syncError: state.syncError,
    telemetryStatus: state.telemetryStatus,
    rateLimitStatus: GitHubService.getRateLimitStatus(),
    punchCard: ctx.punchCard || [],
    languagesBreakdown: ctx.languagesBreakdown || [],
    isCachedFromDb: Boolean(state.isCachedFromDb),
  });
}));

reposRouter.get('/punch-card', asyncHandler(async (_req, res) => {
  const ctx = await GitHubService.getActiveTelemetryContext();
  res.json({ punchCard: ctx.punchCard || [] });
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
    const errorMsg = err instanceof Error ? err.message : 'GitHub verileri eşitlenemedi.';
    res.status(502).json({ error: errorMsg });
  }
}));

export default { authRouter, reposRouter };
