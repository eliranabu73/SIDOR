"use client";

import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6" role="alert">
      <div className="text-center space-y-3 max-w-md">
        <h2 className="text-lg font-semibold">משהו השתבש</h2>
        <p className="text-sm text-muted-foreground">{error.message}</p>
        <Button onClick={reset}>נסה שוב</Button>
      </div>
    </div>
  );
}
