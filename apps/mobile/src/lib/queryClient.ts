import { QueryClient } from '@tanstack/react-query'

// Shared React Query client. In this app React Query is an in-memory
// cache/subscription layer ON TOP of the local SQLite store (the source of
// truth, PRD 0018 §4.5) — queries read the local DB, so they never fail for
// lack of signal and `retry` is pointless.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      retry: 0,
      networkMode: 'always',
    },
    mutations: {
      networkMode: 'always',
    },
  },
})
