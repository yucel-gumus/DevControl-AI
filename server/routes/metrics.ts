import { Router } from 'express';
import { GitHubService } from '../github/githubService.js';
import { TELEMETRY_WINDOW_DAYS } from '../constants.js';
import { asyncHandler } from './asyncHandler.js';

const router = Router();

router.get('/health', asyncHandler(async (req: any, res) => {
  const ctx = await GitHubService.getActiveTelemetryContext(req.sessionId);
  if (ctx.state.syncStatus === 'error') {
    return res.status(502).json({ error: ctx.state.syncError || 'GitHub verileri eşitlenemedi.' });
  }
  res.json({ ...ctx.health, syncStatus: ctx.state.syncStatus, telemetryStatus: ctx.state.telemetryStatus });
}));

router.get('/hotspots', asyncHandler(async (req: any, res) => {
  const ctx = await GitHubService.getActiveTelemetryContext(req.sessionId);
  if (ctx.state.syncStatus === 'error') {
    return res.status(502).json({ error: ctx.state.syncError || 'GitHub verileri eşitlenemedi.' });
  }
  res.json(ctx.hotspots);
}));

router.get('/risks', asyncHandler(async (req: any, res) => {
  const ctx = await GitHubService.getActiveTelemetryContext(req.sessionId);
  if (ctx.state.syncStatus === 'error') {
    return res.status(502).json({ error: ctx.state.syncError || 'GitHub verileri eşitlenemedi.' });
  }
  res.json(ctx.risks);
}));

router.get('/activity', asyncHandler(async (req: any, res) => {
  const requestedDays = Number.parseInt(String(req.query.days || '30'), 10);
  const days = Number.isFinite(requestedDays)
    ? Math.min(TELEMETRY_WINDOW_DAYS, Math.max(1, requestedDays))
    : TELEMETRY_WINDOW_DAYS;

  const ctx = await GitHubService.getActiveTelemetryContext(req.sessionId);
  if (ctx.state.syncStatus === 'error') {
    return res.status(502).json({ error: ctx.state.syncError || 'GitHub verileri eşitlenemedi.' });
  }

  const { commits, pullRequests } = ctx;
  const dayKey = (value: string | undefined): string | null => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  };

  const endDate = new Date();
  endDate.setUTCHours(0, 0, 0, 0);
  const startDate = new Date(endDate);
  startDate.setUTCDate(startDate.getUTCDate() - (days - 1));

  const timeSeries = Array.from({ length: days }, (_, index) => {
    const date = new Date(startDate);
    date.setUTCDate(startDate.getUTCDate() + index);
    return {
      date: date.toISOString().slice(0, 10),
      commits: 0,
      bugFixes: 0,
      prsMerged: 0,
    };
  });
  const byDate = new Map(timeSeries.map((entry) => [entry.date, entry]));

  commits.forEach((commit) => {
    const entry = byDate.get(dayKey(commit.date) || '');
    if (!entry) return;
    entry.commits += 1;
    if (commit.is_bug_fix) entry.bugFixes += 1;
  });

  pullRequests
    .filter((pr) => Boolean(pr.merged_at))
    .forEach((pr) => {
      const entry = byDate.get(dayKey(pr.merged_at) || '');
      if (entry) entry.prsMerged += 1;
    });

  res.json({
    timeSeries,
    windowDays: days,
    totals: timeSeries.reduce(
      (totals, entry) => ({
        commits: totals.commits + entry.commits,
        bugFixes: totals.bugFixes + entry.bugFixes,
        prsMerged: totals.prsMerged + entry.prsMerged,
      }),
      { commits: 0, bugFixes: 0, prsMerged: 0 }
    ),
  });
}));

export default router;
