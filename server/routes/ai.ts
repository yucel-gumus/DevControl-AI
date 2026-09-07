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
    service: 'Google GenAI SDK (Çoklu Model Zinciri)',
  });
});

router.get('/brief', asyncHandler(async (_req, res) => {
  const ctx = await GitHubService.getActiveTelemetryContext();
  if (ctx.state.syncStatus === 'error') {
    return res.status(502).json({ error: ctx.state.syncError || 'GitHub verileri eşitlenemedi.' });
  }
  const brief = await InsightsEngine.generateDailyBrief(ctx.activeRepos, ctx.hotspots, ctx.risks, ctx.health);
  res.json(brief);
}));

router.get('/insights', asyncHandler(async (_req, res) => {
  const ctx = await GitHubService.getActiveTelemetryContext();
  if (ctx.state.syncStatus === 'error') {
    return res.status(502).json({ error: ctx.state.syncError || 'GitHub verileri eşitlenemedi.' });
  }
  const insights = await InsightsEngine.generateInsights(ctx.activeRepos, ctx.commits, ctx.pullRequests, ctx.issues, ctx.hotspots, ctx.risks, ctx.health);
  res.json(insights);
}));

router.post('/ask', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const question = body.question || body.query;
  if (typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ error: 'İstek gövdesinde soru veya sorgu parametresi zorunludur.' });
  }

  const ctx = await GitHubService.getActiveTelemetryContext();
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

router.get('/developer-persona', asyncHandler(async (_req, res) => {
  const state = await GitHubService.ensureSynced();
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

router.post('/repo-review', asyncHandler(async (req, res) => {
  const repoName = req.body?.repoName;
  if (!repoName || typeof repoName !== 'string') {
    return res.status(400).json({ error: 'repoName alanı zorunludur.' });
  }
  const state = await GitHubService.ensureSynced();
  const targetRepo = state.repositories.find(r => r.name.toLowerCase() === repoName.toLowerCase());
  if (!targetRepo) {
    return res.status(404).json({ error: `${repoName} deposu bulunamadı.` });
  }
  const commits = state.commits.filter(c => c.repo_name.toLowerCase() === repoName.toLowerCase());
  const hotspots = HotspotEngine.analyzeHotspots(commits);
  const review = await InsightsEngine.reviewRepository(targetRepo, commits, hotspots);
  res.json(review);
}));

router.post('/hotspot-refactor', asyncHandler(async (req, res) => {
  const { filePath, repoName } = req.body || {};
  if (!filePath || !repoName) {
    return res.status(400).json({ error: 'filePath ve repoName alanları zorunludur.' });
  }
  const state = await GitHubService.ensureSynced();
  const commits = state.commits.filter(c => c.repo_name.toLowerCase() === String(repoName).toLowerCase());
  const hotspots = HotspotEngine.analyzeHotspots(commits);
  let targetHotspot = hotspots.find(
    (h) => h.path === filePath && h.repo_name.toLowerCase() === String(repoName).toLowerCase()
  );

  if (!targetHotspot) {
    // Depo commitlerinden dosyanın gerçek metriklerini dinamik olarak hesapla
    const fileCommits = commits.filter((c) => (c.affected_files || []).includes(filePath));
    const authors = new Set(fileCommits.map((c) => c.author));
    let linesAdded = 0;
    let linesDeleted = 0;
    let bugFixes = 0;

    for (const c of fileCommits) {
      if (c.is_bug_fix) bugFixes += 1;
      const fMatch = (c.files || []).find((f) => (f.filename || f.path) === filePath);
      if (fMatch) {
        linesAdded += fMatch.additions || 0;
        linesDeleted += fMatch.deletions || 0;
      }
    }
    const churn = linesAdded + linesDeleted;

    targetHotspot = {
      path: filePath,
      repo_name: repoName,
      language: filePath.split('.').pop() || 'Kod',
      modifications_count: fileCommits.length,
      commits_count: fileCommits.length,
      contributors_count: authors.size || 1,
      lines_added: linesAdded,
      lines_deleted: linesDeleted,
      code_churn: churn,
      bug_fix_commits_count: bugFixes,
      risk_level: fileCommits.length >= 6 ? 'HIGH' : fileCommits.length >= 3 ? 'MEDIUM' : 'LOW',
      confidence: fileCommits.length > 0 ? 85 : 70,
      last_modified: fileCommits[0]?.date || new Date().toISOString(),
      evidence: [],
      recommendation: 'Tek Sorumluluk Prensibi (SRP) doğrultusunda modüler bileşenlere ayrıştırın.',
    };
  }
  const refactor = await InsightsEngine.suggestHotspotRefactoring(targetHotspot, commits);
  res.json(refactor);
}));

export default router;
