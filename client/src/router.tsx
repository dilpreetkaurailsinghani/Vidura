import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

/**
 * Creates the TanStack Router instance.
 *
 * React Query setup note:
 * QueryClient is threaded through router context and wrapped with
 * QueryClientProvider in __root.tsx. Currently all data fetching uses raw
 * fetch() calls in route loaders and event handlers.
 *
 * The React Query infrastructure is intentionally kept in place because:
 * 1. It is already wired into the router context type (routeTree.gen.ts) and
 *    removing it would require re-generating the route tree.
 * 2. It provides a ready-made upgrade path: any route can switch to useQuery()
 *    / useMutation() for caching, background refetching, and deduplication
 *    without touching the app shell.
 *
 * When adding the first useQuery() call, no new setup is needed — the
 * queryClient is already available via Route.useRouteContext().queryClient.
 */
export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Sensible defaults for this app's data profile:
        // market data is stale after 5 min; AI results don't need background refetch.
        staleTime: 5 * 60 * 1000,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
