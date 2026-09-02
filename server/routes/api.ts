import { Router, Request, Response, NextFunction } from 'express';
import githubRoutes from './github.js';
import metricsRoutes from './metrics.js';
import aiRoutes from './ai.js';
import { rateLimit } from 'express-rate-limit';

const router = Router();

// API Rate Limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 dakika
  limit: 2000, // Yerel telemetri ve çoklu sekme sorguları için optimize edilmiş eşik
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});
router.use(limiter);

// Session Middleware
export interface SessionRequest extends Request {
  sessionId?: string;
}

export const sessionMiddleware = (req: SessionRequest, _res: Response, next: NextFunction) => {
  const sessionId = (req.headers['x-session-id'] as string) || 'default';
  req.sessionId = sessionId;
  next();
};

router.use(sessionMiddleware);

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'DevControl AI Mühendislik Zekası Platformu', version: '2026.8' });
});

router.use('/auth', githubRoutes.authRouter);
router.use('/repos', githubRoutes.reposRouter);
router.use('/metrics', metricsRoutes);
router.use('/ai', aiRoutes);

router.use((err: any, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    return next(err);
  }

  const status = Number.isInteger(err?.status) && err.status >= 400 && err.status < 600
    ? err.status
    : 502;
  const message = err?.message || 'İstek işlenirken beklenmeyen bir hata oluştu.';
  console.error('API isteği işlenemedi:', message);
  res.status(status).json({ error: message });
});

export default router;
