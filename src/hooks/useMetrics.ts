import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  EngineeringHealthScore,
  FileHotspot,
  EngineeringRisk,
  TodayBriefItem,
  AuthStatusResponse,
  RepositoriesResponse,
  DeveloperPersona,
  RepoAiReview,
  HotspotRefactorRecommendation,
} from '../types.js';

const getSessionHeaders = () => {
  return { 'x-session-id': 'default' };
};

const getSessionKey = () => 'default';

const getQueryKey = (name: string, ...parts: unknown[]) => [name, getSessionKey(), ...parts];

const fetchJson = async (url: string, options: RequestInit = {}) => {
  const controller = options.signal ? null : new AbortController();
  const timeout = controller ? setTimeout(() => controller.abort(), 30_000) : null;
  try {
    const res = await fetch(url, {
      ...options,
      signal: options.signal || controller?.signal,
      headers: {
        ...options.headers,
        ...getSessionHeaders(),
      },
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(payload?.error || `API isteği başarısız oldu (${res.status}).`);
    }
    return payload;
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error('API isteği zaman aşımına uğradı.');
    }
    throw err;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

export const useAuthStatus = () => {
  return useQuery<AuthStatusResponse>({
    queryKey: getQueryKey('authStatus'),
    queryFn: () => fetchJson('/api/auth/status'),
  });
};

export const useRepositories = () => {
  return useQuery<RepositoriesResponse>({
    queryKey: getQueryKey('repositories'),
    queryFn: () => fetchJson('/api/repos'),
  });
};

export const useHealthScore = () => {
  return useQuery<EngineeringHealthScore>({
    queryKey: getQueryKey('healthScore'),
    queryFn: () => fetchJson('/api/metrics/health'),
  });
};

export const useHotspots = () => {
  return useQuery<FileHotspot[]>({
    queryKey: getQueryKey('hotspots'),
    queryFn: () => fetchJson('/api/metrics/hotspots'),
  });
};

export const useRisks = () => {
  return useQuery<EngineeringRisk[]>({
    queryKey: getQueryKey('risks'),
    queryFn: () => fetchJson('/api/metrics/risks'),
  });
};

export const useDailyBrief = () => {
  return useQuery<TodayBriefItem[]>({
    queryKey: getQueryKey('dailyBrief'),
    queryFn: () => fetchJson('/api/ai/brief'),
  });
};

export const useActivityData = (days: number = 30) => {
  return useQuery({
    queryKey: getQueryKey('activityData', days),
    queryFn: () => fetchJson(`/api/metrics/activity?days=${days}`),
  });
};

// Mutations
export const useToggleRepo = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) =>
      fetchJson('/api/repos/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoId }),
      }),
    onSuccess: () => {
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['repositories'] });
      queryClient.invalidateQueries({ queryKey: ['healthScore'] });
      queryClient.invalidateQueries({ queryKey: ['hotspots'] });
      queryClient.invalidateQueries({ queryKey: ['risks'] });
      queryClient.invalidateQueries({ queryKey: ['dailyBrief'] });
      queryClient.invalidateQueries({ queryKey: ['activityData'] });
    },
  });
};

export const useSyncRepos = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      fetchJson('/api/repos/sync', {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repositories'] });
      queryClient.invalidateQueries({ queryKey: ['healthScore'] });
      queryClient.invalidateQueries({ queryKey: ['hotspots'] });
      queryClient.invalidateQueries({ queryKey: ['risks'] });
      queryClient.invalidateQueries({ queryKey: ['dailyBrief'] });
      queryClient.invalidateQueries({ queryKey: ['authStatus'] });
      queryClient.invalidateQueries({ queryKey: ['activityData'] });
    },
  });
};

export const useDeveloperPersona = () => {
  return useQuery<DeveloperPersona>({
    queryKey: getQueryKey('developerPersona'),
    queryFn: () => fetchJson('/api/ai/developer-persona'),
    staleTime: 5 * 60 * 1000,
  });
};

export const useRepoReview = () => {
  return useMutation<RepoAiReview, Error, string>({
    mutationFn: (repoName: string) =>
      fetchJson('/api/ai/repo-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoName }),
      }),
  });
};

export const useHotspotRefactor = () => {
  return useMutation<HotspotRefactorRecommendation, Error, { filePath: string; repoName: string }>({
    mutationFn: ({ filePath, repoName }: { filePath: string; repoName: string }) =>
      fetchJson('/api/ai/hotspot-refactor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath, repoName }),
      }),
  });
};
