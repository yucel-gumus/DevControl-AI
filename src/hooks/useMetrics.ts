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

import { apiClient } from '../utils/apiClient.js';

const getQueryKey = (name: string, ...parts: unknown[]) => [name, ...parts];

export const useAuthStatus = () => {
  return useQuery<AuthStatusResponse>({
    queryKey: getQueryKey('authStatus'),
    queryFn: () => apiClient('/api/auth/status'),
  });
};

export const useRepositories = () => {
  return useQuery<RepositoriesResponse>({
    queryKey: getQueryKey('repositories'),
    queryFn: () => apiClient('/api/repos'),
  });
};

export const useHealthScore = () => {
  return useQuery<EngineeringHealthScore>({
    queryKey: getQueryKey('healthScore'),
    queryFn: () => apiClient('/api/metrics/health'),
  });
};

export const useHotspots = () => {
  return useQuery<FileHotspot[]>({
    queryKey: getQueryKey('hotspots'),
    queryFn: () => apiClient('/api/metrics/hotspots'),
  });
};

export const useRisks = () => {
  return useQuery<EngineeringRisk[]>({
    queryKey: getQueryKey('risks'),
    queryFn: () => apiClient('/api/metrics/risks'),
  });
};

export const useDailyBrief = () => {
  return useQuery<TodayBriefItem[]>({
    queryKey: getQueryKey('dailyBrief'),
    queryFn: () => apiClient('/api/ai/brief'),
  });
};

export const useActivityData = (days: number = 30) => {
  return useQuery({
    queryKey: getQueryKey('activityData', days),
    queryFn: () => apiClient(`/api/metrics/activity?days=${days}`),
  });
};

// Mutations
export const useToggleRepo = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) =>
      apiClient('/api/repos/toggle', {
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
      apiClient('/api/repos/sync', {
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
    queryFn: () => apiClient('/api/ai/developer-persona'),
    staleTime: 5 * 60 * 1000,
  });
};

export const useRepoReview = () => {
  return useMutation<RepoAiReview, Error, string>({
    mutationFn: (repoName: string) =>
      apiClient('/api/ai/repo-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoName }),
      }),
  });
};

export const useHotspotRefactor = () => {
  return useMutation<HotspotRefactorRecommendation, Error, { filePath: string; repoName: string }>({
    mutationFn: ({ filePath, repoName }: { filePath: string; repoName: string }) =>
      apiClient('/api/ai/hotspot-refactor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath, repoName }),
      }),
  });
};
