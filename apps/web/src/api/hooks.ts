import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import type { AlertDto, DashboardSnapshot } from '@mgms/shared';
import { api } from './client';

export interface EventSummary {
  id: string;
  code: string;
  name: string;
  startDate: string;
  endDate: string;
  expectedFootfall: number | null;
  isActive: boolean;
  districts: Array<{ id: string; name: string }>;
  campCount: number;
  walkInCount: number;
}

export function useEvents() {
  return useQuery({
    queryKey: ['events'],
    queryFn: () => api.get<{ items: EventSummary[] }>('/events'),
    staleTime: 5 * 60_000,
  });
}

/** Serialise the dashboard filter into a stable query string. */
export function filterToQuery(filter: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filter)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      if (value.length > 0) params.set(key, value.join(','));
    } else {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function useDashboard(filter: Record<string, unknown>, options?: { refetchInterval?: number }) {
  const query = filterToQuery(filter);
  return useQuery({
    queryKey: ['dashboard', query],
    queryFn: ({ signal }) => api.get<DashboardSnapshot>(`/dashboard${query}`, signal),
    // The dashboard is a live view; a stale snapshot on a control-room screen
    // is worse than a brief loading state.
    refetchInterval: options?.refetchInterval ?? 60_000,
    placeholderData: (previous) => previous,
  });
}

export function useAlerts(params: Record<string, unknown> = {}) {
  const query = filterToQuery(params);
  return useQuery({
    queryKey: ['alerts', query],
    queryFn: ({ signal }) => api.get<{ items: AlertDto[] }>(`/alerts${query}`, signal),
    refetchInterval: 60_000,
  });
}

export function useApi<T>(key: unknown[], path: string, options?: Partial<UseQueryOptions<T>>) {
  return useQuery({
    queryKey: key,
    queryFn: ({ signal }) => api.get<T>(path, signal),
    ...options,
  } as UseQueryOptions<T>);
}
