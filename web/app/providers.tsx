"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";

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
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster richColors position="top-center" dir="rtl" />
    </QueryClientProvider>
  );
}
