import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react-native'
import type { ReactElement } from 'react'

/**
 * Render (async since Testing Library 14) with a fresh QueryClient (no retries, nothing shared between tests),
 * optionally pre-filled so components render without hitting the network.
 */
export async function renderWithProviders(ui: ReactElement, seed: [unknown[], unknown][] = []) {
  const queryClient = new QueryClient({
    // gcTime Infinity: no garbage-collection timers outlive the test.
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  })
  for (const [key, data] of seed) queryClient.setQueryData(key, data)
  const result = await render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
  return { queryClient, ...result }
}

/** A JSON `Response`, for stubbing `fetch`. */
export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    ...init,
  })
}
