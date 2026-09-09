import { QueryClient } from '@tanstack/react-query'

// Shared React Query client. Server state is cached here; global client state is
// kept minimal (just the auth token/user in the auth context).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})
