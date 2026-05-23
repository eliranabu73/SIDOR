"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Clock, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { Logo } from "@/components/brand/Logo";
import {
  fetchTemplates,
  applyTemplate,
  type ScheduleTemplateItem,
} from "@/lib/api";

function TemplateCard({
  tpl,
  selected,
  onSelect,
}: {
  tpl: ScheduleTemplateItem;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`relative flex flex-col gap-3 rounded-2xl border-2 p-5 text-right transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
        selected
          ? "border-indigo-500 bg-indigo-500/10 shadow-[0_0_24px_rgb(99_102_241/0.25)]"
          : "border-border bg-card/60 hover:border-indigo-400/50"
      }`}
    >
      {selected && (
        <span className="absolute left-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500">
          <Check className="h-3.5 w-3.5 text-white" />
        </span>
      )}

      {/* Gradient top bar */}
      <div
        className={`h-1.5 w-full rounded-full bg-gradient-to-r ${tpl.color} opacity-80`}
      />

      <div className="flex items-start gap-3">
        <span className="text-3xl" role="img" aria-label={tpl.name}>
          {tpl.emoji}
        </span>
        <div className="flex-1 space-y-0.5 text-right">
          <div className="font-semibold">{tpl.name}</div>
          <div className="text-xs text-muted-foreground leading-snug">
            {tpl.description}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Users className="h-3.5 w-3.5" />
          {tpl.roles.length} תפקידים
        </span>
        <span className="flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" />
          {tpl.shiftCount} משמרות/שבוע
        </span>
      </div>

      {/* Roles chips */}
      <div className="flex flex-wrap gap-1">
        {tpl.roles.map((r) => (
          <span
            key={r}
            className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
          >
            {r}
          </span>
        ))}
      </div>
    </button>
  );
}

function TemplatesFlow() {
  const router = useRouter();
  const [templates, setTemplates] = React.useState<ScheduleTemplateItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [applying, setApplying] = React.useState(false);

  React.useEffect(() => {
    fetchTemplates()
      .then(setTemplates)
      .catch(() => toast.error("טעינת התבניות נכשלה"))
      .finally(() => setLoading(false));
  }, []);

  const handleApply = async () => {
    if (!selected) return;
    setApplying(true);
    try {
      const result = await applyTemplate(selected);
      toast.success(
        `תבנית "${result.template}" הוחלה — ${result.createdShifts} משמרות נוצרו`,
      );
      router.replace("/schedule");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "החלת התבנית נכשלה";
      toast.error(msg);
      setApplying(false);
    }
  };

  return (
    <main className="mesh-bg min-h-screen p-4 pb-28">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Header */}
        <header className="flex items-center justify-between pt-2">
          <Logo size={32} />
          <a
            href="/onboarding"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← חזרה לאשף
          </a>
        </header>

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5" aria-hidden>
          <span className="h-1.5 w-8 rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400" />
          <span className="h-1.5 w-8 rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400" />
          <span className="h-1.5 w-3 rounded-full bg-border" />
        </div>

        <section aria-labelledby="templates-title">
        <div className="text-center">
          <h1 id="templates-title" className="text-2xl font-bold">בחר תבנית סידור</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            נבנה לך תפקידים ומשמרות מיד — אפשר לערוך הכל לאחר מכן בהגדרות.
          </p>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="h-44 animate-pulse rounded-2xl bg-muted"
              />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {templates.map((tpl) => (
              <TemplateCard
                key={tpl.id}
                tpl={tpl}
                selected={selected === tpl.id}
                onSelect={() => setSelected(tpl.id)}
              />
            ))}
          </div>
        )}

        {/* Skip option */}
        <div className="text-center text-sm text-muted-foreground">
          רוצה להתחיל מאפס?{" "}
          <a
            href="/schedule"
            className="text-indigo-500 hover:underline"
          >
            דלג וצור משמרות ידנית
          </a>
        </div>
        </section>
      </div>

      {/* Sticky CTA */}
      {selected && (
        <div className="fixed bottom-0 inset-x-0 border-t border-border bg-card/80 backdrop-blur-xl p-4">
          <div className="mx-auto max-w-3xl flex items-center justify-between gap-4">
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                {templates.find((t) => t.id === selected)?.name}
              </span>{" "}
              — {templates.find((t) => t.id === selected)?.shiftCount} משמרות,{" "}
              {templates.find((t) => t.id === selected)?.roles.length} תפקידים
            </div>
            <Button
              variant="glow"
              onClick={handleApply}
              disabled={applying}
              className="shrink-0"
            >
              {applying ? "מייצר סידור…" : "החל תבנית →"}
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}

export default function TemplatesPage() {
  return (
    <AuthGuard skipMembershipCheck>
      <TemplatesFlow />
    </AuthGuard>
  );
}
