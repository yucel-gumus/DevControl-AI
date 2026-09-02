import { Router } from 'express';
import { GitHubService } from '../github/githubService.js';
import { asyncHandler } from './asyncHandler.js';

const authRouter = Router();
const reposRouter = Router();

// ------------------------------------------
// AUTH ROUTES (/api/auth)
// ------------------------------------------
authRouter.get('/status', asyncHandler(async (req: any, res) => {
  let state = GitHubService.getState(req.sessionId);
  try {
    state = await GitHubService.ensureSynced(req.sessionId);
  } catch {
    state = GitHubService.getState(req.sessionId);
  }
  res.json({
    authenticated: Boolean(state.token),
    user: state.token ? state.user : null,
    lastSyncAt: state.lastSyncAt || null,
    syncStatus: state.syncStatus,
    syncError: state.syncError,
    telemetryStatus: state.telemetryStatus,
    rateLimitStatus: GitHubService.getRateLimitStatus(),
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
reposRouter.get('/', asyncHandler(async (req: any, res) => {
  const ctx = await GitHubService.getActiveTelemetryContext(req.sessionId);
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
  });
}));

reposRouter.post('/toggle', asyncHandler(async (req: any, res) => {
  const { repoId } = req.body;
  if (!repoId || typeof repoId !== 'string') {
    return res.status(400).json({ error: 'repoId alanı zorunludur.' });
  }
  const repos = await GitHubService.toggleRepoSelection(req.sessionId, repoId);
  res.json({ success: true, repositories: repos });
}));

reposRouter.post('/sync', asyncHandler(async (req: any, res) => {
  try {
    const state = await GitHubService.syncRepositories(req.sessionId);
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
    });
  } catch (err: any) {
    res.status(502).json({ error: err.message || 'GitHub verileri eşitlenemedi.' });
  }
}));

export default { authRouter, reposRouter };
