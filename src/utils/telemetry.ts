const TELEMETRY_URL =
  'https://python-backend-270384591051.europe-west3.run.app/api/telemetry/event';
const TELEMETRY_PROJECT = 'devcontrol-ai';
const VISIT_KEY = 'yg_telemetry_visit_v1';

function shouldSkipTelemetry(): boolean {
  if (typeof window === 'undefined') return true;
  if (window.location.protocol !== 'https:') return true;
  if (['localhost', '127.0.0.1'].includes(window.location.hostname)) return true;
  if (typeof navigator !== 'undefined' && navigator.webdriver) return true;
  return Boolean((import.meta as { env?: { MODE?: string } }).env?.MODE === 'test');
}

function sendEvent(payload: Record<string, unknown>): void {
  if (shouldSkipTelemetry()) return;
  try {
    const body = JSON.stringify({
      project: TELEMETRY_PROJECT,
      path: window.location.pathname,
      referrer: document.referrer || '',
      source: 'client',
      ...payload,
    });
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      if (navigator.sendBeacon(TELEMETRY_URL, body)) return;
    }
    void fetch(TELEMETRY_URL, {
      method: 'POST',
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Telemetry errors stay silent.
  }
}

export function trackVisit(): void {
  if (shouldSkipTelemetry()) return;
  try {
    if (window.sessionStorage.getItem(VISIT_KEY)) return;
    window.sessionStorage.setItem(VISIT_KEY, '1');
  } catch {
    // Ignore blocked storage.
  }
  sendEvent({ event: 'visit' });
}

export function trackAction(action: string, detail?: string): void {
  sendEvent({ event: 'action', action, ...(detail ? { detail } : {}) });
}
