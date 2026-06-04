"use client";

import * as React from "react";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { Toaster } from "sonner";

// Bump when the cached shape changes so stale entries are discarded on deploy.
const CACHE_BUSTER = "v1";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            refetchOnWindowFocus: false,
            // Treat data as fresh for 30s so navigating between pages doesn't
            // refetch everything on every mount. Mutations still invalidate
            // explicitly, so this only suppresses redundant network round-trips.
            staleTime: 30_000,
            // Keep cached data for 24h so the localStorage persister can rehydrate
            // it on the next visit. Without this, gcTime defaults to 5min and the
            // persisted snapshot would be discarded almost immediately.
            gcTime: 24 * 60 * 60 * 1000,
          },
        },
      }),
  );

  // localStorage persister. On the server window is undefined → createSync-
  // StoragePersister returns a noop persister, so SSR renders normally and
  // hydration is unaffected. On the client, the last good query snapshot is
  // restored synchronously on mount → returning users see their schedule
  // INSTANTLY (sub-second) while a background refetch revalidates.
  const [persister] = React.useState(() =>
    createSyncStoragePersister({
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
      key: "sidor-rq-cache",
    }),
  );

  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister,
        maxAge: 24 * 60 * 60 * 1000,
        buster: CACHE_BUSTER,
        dehydrateOptions: {
          // Only persist successful queries — never cache an error/loading state.
          shouldDehydrateQuery: (query) => query.state.status === "success",
        },
      }}
    >
      {children}
      <Toaster richColors position="top-center" dir="rtl" />
    </PersistQueryClientProvider>
  );
}
