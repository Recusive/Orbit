import { QueryClient } from '@tanstack/react-query';

/**
 * Singleton QueryClient for the Orbit app.
 *
 * Desktop defaults:
 * - no refetch on window focus
 * - no retries
 * - long gcTime to survive brief UI churn
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});
