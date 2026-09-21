import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import crypto from 'crypto';
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

/**
 * Sabit zamanlı jeton karşılaştırması (zamanlama sızıntısını önler).
 */
function timingSafeEqualStrings(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

/**
 * İsteğe bağlı API erişim kapısı.
 *
 * `DEVCONTROL_API_TOKEN` tanımlıysa tüm /api uç noktaları geçerli bir jeton
 * ister; tanımlı değilse mevcut (jetonsuz) davranış aynen korunur. Böylece
 * herkese açık dağıtımlarda GitHub kotasının ve yapay zeka kredilerinin
 * yetkisiz kullanımı engellenebilir.
 */
const requireApiToken: RequestHandler = (req, res, next) => {
  const expectedToken = process.env.DEVCONTROL_API_TOKEN;
  if (!expectedToken) {
    return next();
  }

  const authHeader = req.get('authorization') || '';
  const providedToken = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : (req.get('x-api-token') || '').trim();

  if (providedToken && timingSafeEqualStrings(providedToken, expectedToken)) {
    return next();
  }


  res.status(401).json({ error: 'Bu API için geçerli bir erişim jetonu gereklidir.' });
};

// Sağlık ucu jeton kapısının ÜSTÜNDE tanımlanır: dış izleme (uptime/readiness)
// probları jeton taşımaz ve kapı açıkken 401 alırsa sağlıklı bir sürüm
// sağlıksız sayılır. Bu uç yalnızca sabit bir durum nesnesi döndürür.
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'DevControl AI Mühendislik Zekası Platformu', version: '2026.8' });
});

router.use(requireApiToken);

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
    : 500;
  const message = err?.message || 'İstek işlenirken beklenmeyen bir hata oluştu.';
  console.error('API isteği işlenemedi:', message);
  res.status(status).json({ error: message });
});

export default router;
