import { App, getApps, initializeApp } from 'firebase-admin/app';
import { Firestore, getFirestore } from 'firebase-admin/firestore';

export type DevControlTask =
  | 'commit_classifier'
  | 'brief_persona'
  | 'ask_ai'
  | 'repo_review'
  | 'hotspot_refactor';

export interface RuntimeConfig {
  geminiKeys: string[];
  githubToken: string;
  typesafeApiKey: string | null;
  typesafeModel: string;
  devcontrolApiToken: string;
  fallbackModels: string[];
  corsOrigins: string[];
  tasks: Record<DevControlTask, { model: string; thinkingLevel: string }>;
  loadedFromFirestore: boolean;
}

const DEFAULT_FALLBACK_MODELS = ['gemini-4-hydrogen', 'gemini-4-carbon', 'gemini-4-argon'];

const DEFAULT_CORS_ORIGINS = [
  'https://devcontrol-ai.web.app',
  'https://devcontrol-ai.firebaseapp.com',
  'http://localhost:3000',
  'http://localhost:5173',
];

const TASK_DEFAULTS: Record<DevControlTask, { model: string; thinkingLevel: string }> = {
  commit_classifier: { model: 'gemini-4-hydrogen', thinkingLevel: 'low' },
  brief_persona: { model: 'gemini-4-hydrogen', thinkingLevel: 'medium' },
  ask_ai: { model: 'gemini-4-carbon', thinkingLevel: 'medium' },
  repo_review: { model: 'gemini-4-argon', thinkingLevel: 'high' },
  hotspot_refactor: { model: 'gemini-4-argon', thinkingLevel: 'high' },
};

const CONFIG_APP_NAME = 'aimunazara-config';
const CONFIG_TTL_MS = 60_000;

let configApp: App | null = null;
let configDb: Firestore | null = null;
let cachedConfig: RuntimeConfig | null = null;
let lastLoadedAt = 0;
let inFlightRefresh: Promise<RuntimeConfig> | null = null;

function isFirestoreConfigEnabled(): boolean {
  const flag = (process.env.FIRESTORE_CONFIG_ENABLED ?? 'true').trim().toLowerCase();
  return !['false', '0', 'no', 'off'].includes(flag);
}

function getEnvGeminiKeys(): string[] {
  const candidates = [
    process.env.GEMINI_API_KEY_1,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY,
  ];
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const item of candidates) {
    if (typeof item === 'string' && item.trim() && !seen.has(item.trim())) {
      seen.add(item.trim());
      keys.push(item.trim());
    }
  }
  return keys;
}

function isValidHeaderSecret(val: string | null | undefined): val is string {
  return typeof val === 'string' && /^[\x21-\x7E]+$/.test(val.trim());
}

function getEnvTypeSafeKey(): string | null {
  for (const candidate of [process.env.TYPESAFE_API_KEY, process.env.TYPESAFEAI]) {
    if (isValidHeaderSecret(candidate)) {
      return candidate.trim();
    }
  }
  return null;
}

function getEnvCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const parsed = raw
      .split(',')
      .map((item) => item.trim().replace(/\/+$/, ''))
      .filter(Boolean);
    if (parsed.length > 0) {
      return parsed;
    }
  }
  return [...DEFAULT_CORS_ORIGINS];
}

function buildFallbackConfig(): RuntimeConfig {
  return {
    geminiKeys: getEnvGeminiKeys(),
    githubToken: (process.env.GITHUB_TOKEN || '').trim(),
    typesafeApiKey: getEnvTypeSafeKey(),
    typesafeModel: (process.env.TYPESAFE_MODEL || 'jev-latest').trim(),
    devcontrolApiToken: (process.env.DEVCONTROL_API_TOKEN || '').trim(),
    fallbackModels: [...DEFAULT_FALLBACK_MODELS],
    corsOrigins: getEnvCorsOrigins(),
    tasks: {
      commit_classifier: { ...TASK_DEFAULTS.commit_classifier },
      brief_persona: { ...TASK_DEFAULTS.brief_persona },
      ask_ai: { ...TASK_DEFAULTS.ask_ai },
      repo_review: { ...TASK_DEFAULTS.repo_review },
      hotspot_refactor: { ...TASK_DEFAULTS.hotspot_refactor },
    },
    loadedFromFirestore: false,
  };
}

function getConfigFirestore(): Firestore {
  if (configDb) return configDb;
  const projectId = (process.env.FIRESTORE_CONFIG_PROJECT || 'aimunazara').trim();
  const existing = getApps().find((app) => app.name === CONFIG_APP_NAME);
  configApp = existing || initializeApp({ projectId }, CONFIG_APP_NAME);
  configDb = getFirestore(configApp);
  return configDb;
}

function pickStr(doc: Record<string, any> | undefined, field: string, fallback = ''): string {
  const val = doc?.[field];
  return typeof val === 'string' && val.trim() ? val.trim() : fallback;
}

function pickStrArray(doc: Record<string, any> | undefined, field: string, fallback: string[]): string[] {
  const val = doc?.[field];
  if (Array.isArray(val)) {
    const cleaned = val
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
    if (cleaned.length > 0) return cleaned;
  }
  return [...fallback];
}

export function normalizeThinkingLevel(model: string, level?: string | null): string | undefined {
  if (!level || !String(model).startsWith('gemini-4')) {
    return undefined;
  }
  let upper = String(level).trim().toUpperCase();
  if (!['LOW', 'MEDIUM', 'HIGH', 'XHIGH'].includes(upper)) {
    upper = 'MEDIUM';
  }
  if (upper === 'XHIGH' && !model.toLowerCase().includes('hydrogen')) {
    upper = 'HIGH';
  }
  return upper;
}

export async function refreshRuntimeConfig(force = false): Promise<RuntimeConfig> {
  if (!isFirestoreConfigEnabled()) {
    cachedConfig = buildFallbackConfig();
    lastLoadedAt = Date.now();
    return cachedConfig;
  }

  const now = Date.now();
  if (!force && cachedConfig && now - lastLoadedAt < CONFIG_TTL_MS) {
    return cachedConfig;
  }

  if (inFlightRefresh) {
    return inFlightRefresh;
  }

  inFlightRefresh = (async () => {
    const base = buildFallbackConfig();
    try {
      const db = getConfigFirestore();
      const [llmSnap, devSnap] = await Promise.all([
        db.doc('system_config/llm').get(),
        db.doc('system_config/devcontrol').get(),
      ]);

      const llmData = llmSnap.exists ? (llmSnap.data() || {}) : {};
      const devData = devSnap.exists ? (devSnap.data() || {}) : {};

      const fsKeys: string[] = [];
      for (const field of ['gemini_api_key_primary', 'gemini_api_key_secondary']) {
        const key = pickStr(llmData, field);
        if (key && !fsKeys.includes(key)) {
          fsKeys.push(key);
        }
      }

      const geminiKeys = fsKeys.length > 0 ? fsKeys : base.geminiKeys;
      const githubToken = pickStr(devData, 'github_token') || base.githubToken;
      const rawTypeSafeKey = pickStr(devData, 'typesafe_api_key');
      const typesafeKey = isValidHeaderSecret(rawTypeSafeKey) ? rawTypeSafeKey : base.typesafeApiKey;
      const typesafeModel = pickStr(devData, 'typesafe_model', base.typesafeModel);
      const devcontrolApiToken = pickStr(devData, 'devcontrol_api_token') || base.devcontrolApiToken;
      const fallbackModels = pickStrArray(
        devData,
        'fallback_models',
        pickStrArray(llmData, 'fallback_models', base.fallbackModels),
      );
      const corsOrigins = pickStrArray(devData, 'cors_origins', base.corsOrigins)
        .map((origin) => origin.replace(/\/+$/, ''))
        .filter(Boolean);

      const tasks: RuntimeConfig['tasks'] = {
        commit_classifier: {
          model: pickStr(devData, 'commit_classifier_model', TASK_DEFAULTS.commit_classifier.model),
          thinkingLevel: pickStr(devData, 'commit_classifier_thinking_level', TASK_DEFAULTS.commit_classifier.thinkingLevel),
        },
        brief_persona: {
          model: pickStr(devData, 'brief_persona_model', TASK_DEFAULTS.brief_persona.model),
          thinkingLevel: pickStr(devData, 'brief_persona_thinking_level', TASK_DEFAULTS.brief_persona.thinkingLevel),
        },
        ask_ai: {
          model: pickStr(devData, 'ask_ai_model', TASK_DEFAULTS.ask_ai.model),
          thinkingLevel: pickStr(devData, 'ask_ai_thinking_level', TASK_DEFAULTS.ask_ai.thinkingLevel),
        },
        repo_review: {
          model: pickStr(devData, 'repo_review_model', TASK_DEFAULTS.repo_review.model),
          thinkingLevel: pickStr(devData, 'repo_review_thinking_level', TASK_DEFAULTS.repo_review.thinkingLevel),
        },
        hotspot_refactor: {
          model: pickStr(devData, 'hotspot_refactor_model', TASK_DEFAULTS.hotspot_refactor.model),
          thinkingLevel: pickStr(devData, 'hotspot_refactor_thinking_level', TASK_DEFAULTS.hotspot_refactor.thinkingLevel),
        },
      };

      cachedConfig = {
        geminiKeys,
        githubToken,
        typesafeApiKey: typesafeKey || null,
        typesafeModel,
        devcontrolApiToken,
        fallbackModels,
        corsOrigins,
        tasks,
        loadedFromFirestore: llmSnap.exists || devSnap.exists,
      };
      lastLoadedAt = Date.now();
      return cachedConfig;
    } catch (err: any) {
      console.warn('[RuntimeConfig] Firestore system_config okuma atlandi (env fallback kullaniliyor):', err?.message || err);
      if (!cachedConfig) {
        cachedConfig = base;
      }
      lastLoadedAt = Date.now() - Math.max(0, CONFIG_TTL_MS - 10_000);
      return cachedConfig;
    } finally {
      inFlightRefresh = null;
    }
  })();

  return inFlightRefresh;
}

export async function ensureRuntimeConfig(): Promise<RuntimeConfig> {
  return refreshRuntimeConfig(false);
}

export function getRuntimeConfigSnapshot(): RuntimeConfig {
  if (!cachedConfig) {
    cachedConfig = buildFallbackConfig();
  }
  if (isFirestoreConfigEnabled() && Date.now() - lastLoadedAt >= CONFIG_TTL_MS) {
    void refreshRuntimeConfig(false);
  }
  return cachedConfig;
}

export function getTaskModelConfig(task: DevControlTask): {
  model: string;
  thinkingLevel: string;
  fallbackModels: string[];
} {
  const cfg = getRuntimeConfigSnapshot();
  const entry = cfg.tasks[task] || TASK_DEFAULTS[task];
  return {
    model: entry.model,
    thinkingLevel: entry.thinkingLevel,
    fallbackModels: cfg.fallbackModels,
  };
}

export function getGeminiKeys(): string[] {
  return getRuntimeConfigSnapshot().geminiKeys;
}

export function getGitHubToken(): string {
  return getRuntimeConfigSnapshot().githubToken;
}

export function getDevControlApiToken(): string {
  return getRuntimeConfigSnapshot().devcontrolApiToken;
}

export function getCorsOrigins(): string[] {
  return getRuntimeConfigSnapshot().corsOrigins;
}

export function getTypeSafeRuntimeConfig(): { apiKey: string | null; model: string } {
  const cfg = getRuntimeConfigSnapshot();
  return {
    apiKey: cfg.typesafeApiKey,
    model: cfg.typesafeModel || 'jev-latest',
  };
}
