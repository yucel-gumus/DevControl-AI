import { Request } from 'express';

const TELEMETRY_URL =
  'https://python-backend-270384591051.europe-west3.run.app/api/telemetry/event';

export function notifyServerTelemetry(req: Request, action: string, detail?: string): void {
  if (process.env.NODE_ENV === 'test') return;
  const host = String(req.get('host') || '');
  if (!host || /^(localhost|127\.0\.0\.1)(:|$)/i.test(host)) return;

  const clientIp = req.ip || req.socket?.remoteAddress || 'unknown';
  void fetch(TELEMETRY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://devcontrol-ai.web.app',
      'User-Agent': 'YucelTelemetryServer/devcontrol-ai',
    },
    body: JSON.stringify({
      project: 'devcontrol-ai',
      event: 'action',
      action,
      ...(detail ? { detail: detail.slice(0, 80) } : {}),
      path: req.originalUrl || req.url,
      source: 'server',
      client_ip: clientIp,
    }),
    signal: AbortSignal.timeout(3000),
  }).catch(() => {});
}
