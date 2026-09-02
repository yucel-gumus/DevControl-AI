import { Router } from 'express';
import { GitHubService } from '../github/githubService.js';
import { InsightsEngine } from '../ai/insightsEngine.js';
import { AgentPlanner } from '../ai/agentPlanner.js';
import { HotspotEngine } from '../metrics/hotspotEngine.js';
import { GEMINI_MODEL_CHAIN } from '../gemini.js';
import { asyncHandler } from './asyncHandler.js';

const router = Router();

router.get('/status', (_req, res) => {
  const hasKey = Boolean(process.env.GEMINI_API_KEY);
  res.json({
    configured: hasKey,
    model: GEMINI_MODEL_CHAIN[0],
    fallbackAvailable: true,
    service: 'Google GenAI SDK (Çoklu Model Zinciri)',
  });
});

router.get('/brief', asyncHandler(async (req: any, res) => {
  const ctx = await GitHubService.getActiveTelemetryContext(req.sessionId);
  if (ctx.state.syncStatus === 'error') {
    return res.status(502).json({ error: ctx.state.syncError || 'GitHub verileri eşitlenemedi.' });
  }
  const brief = await InsightsEngine.generateDailyBrief(ctx.activeRepos, ctx.hotspots, ctx.risks, ctx.health);
  res.json(brief);
}));

router.get('/insights', asyncHandler(async (req: any, res) => {
  const ctx = await GitHubService.getActiveTelemetryContext(req.sessionId);
  if (ctx.state.syncStatus === 'error') {
    return res.status(502).json({ error: ctx.state.syncError || 'GitHub verileri eşitlenemedi.' });
  }
  const insights = await InsightsEngine.generateInsights(ctx.activeRepos, ctx.commits, ctx.pullRequests, ctx.issues, ctx.hotspots, ctx.risks, ctx.health);
  res.json(insights);
}));

router.post('/ask', asyncHandler(async (req: any, res) => {
  const body = req.body || {};
  const question = body.question || body.query;
  if (typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ error: 'İstek gövdesinde soru veya sorgu parametresi zorunludur.' });
  }

  const ctx = await GitHubService.getActiveTelemetryContext(req.sessionId);
  if (ctx.state.syncStatus === 'error') {
    return res.status(502).json({ error: ctx.state.syncError || 'GitHub verileri eşitlenemedi.' });
  }

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

    res.json({
      ...result,
      response: result.message?.content || '',
      content: result.message?.content || '',
      facts: result.message?.facts || [],
      interpretation: result.message?.interpretation || '',
      evidence: result.message?.evidence || [],
      recommendedActions: result.message?.recommendedActions || [],
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Yapay zeka mühendislik sorgusu işlenirken hata oluştu.' });
  }
}));

router.get('/developer-persona', asyncHandler(async (req: any, res) => {
  const state = await GitHubService.ensureSynced(req.sessionId);
  if (state.syncStatus === 'error') {
    return res.status(502).json({ error: state.syncError || 'GitHub verileri eşitlenemedi.' });
  }
  const activeRepos = state.repositories.filter((r) => r.selected_for_analysis);
  const persona = await InsightsEngine.generateDeveloperPersona(
    state.user,
    activeRepos.length > 0 ? activeRepos : state.repositories,
    state.commits
  );
  res.json(persona);
}));

router.post('/repo-review', asyncHandler(async (req: any, res) => {
  const repoName = req.body?.repoName;
  if (!repoName || typeof repoName !== 'string') {
    return res.status(400).json({ error: 'repoName alanı zorunludur.' });
  }
  const state = await GitHubService.ensureSynced(req.sessionId);
  const targetRepo = state.repositories.find(r => r.name.toLowerCase() === repoName.toLowerCase());
  if (!targetRepo) {
    return res.status(404).json({ error: `${repoName} deposu bulunamadı.` });
  }
  const commits = state.commits.filter(c => c.repo_name.toLowerCase() === repoName.toLowerCase());
  const hotspots = HotspotEngine.analyzeHotspots(commits);
  const review = await InsightsEngine.reviewRepository(targetRepo, commits, hotspots);
  res.json(review);
}));

router.post('/hotspot-refactor', asyncHandler(async (req: any, res) => {
  const { filePath, repoName } = req.body || {};
  if (!filePath || !repoName) {
    return res.status(400).json({ error: 'filePath ve repoName alanları zorunludur.' });
  }
  const state = await GitHubService.ensureSynced(req.sessionId);
  const commits = state.commits.filter(c => c.repo_name.toLowerCase() === String(repoName).toLowerCase());
  const hotspots = HotspotEngine.analyzeHotspots(commits);
  const targetHotspot = hotspots.find(h => h.path === filePath && h.repo_name.toLowerCase() === String(repoName).toLowerCase()) || {
    path: filePath,
    repo_name: repoName,
    language: filePath.split('.').pop() || 'Code',
    modifications_count: 5,
    commits_count: 5,
    contributors_count: 1,
    lines_added: 200,
    lines_deleted: 50,
    code_churn: 250,
    bug_fix_commits_count: 2,
    risk_level: 'HIGH' as const,
    confidence: 90,
    last_modified: new Date().toISOString(),
    evidence: [],
    recommendation: 'Tek Sorumluluk Prensibi ile ayrıştırın.',
  };
  const refactor = await InsightsEngine.suggestHotspotRefactoring(targetHotspot, commits);
  res.json(refactor);
}));

export default router;
