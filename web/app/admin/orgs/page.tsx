"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  adminApi,
  type AdminOrgListItem,
  type AdminPlan,
  type AdminFeatureFlags,
} from "@/lib/api";
import { ExportCsvButton } from "@/components/admin/ExportCsvButton";

const PAGE_SIZE = 25;
const PLANS: AdminPlan[] = ["FREE", "BASIC", "PRO", "ENTERPRISE"];
const FEATURE_FLAG_KEYS: Array<{ key: keyof AdminFeatureFlags; label: string }> = [
  { key: "enableAutoSchedule", label: "שיבוץ אוטומטי" },
  { key: "enableSwaps", label: "החלפות משמרת" },
  { key: "enableWhatsAppExport", label: "ייצוא ל-WhatsApp" },
  { key: "enableOrTools", label: "OR-Tools" },
  { key: "enableImport", label: "ייבוא מתמונה" },
];

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("he-IL", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function PlanBadge({ plan }: { plan: string }) {
  const variant: "default" | "secondary" | "outline" =
    plan === "PRO" || plan === "ENTERPRISE"
      ? "default"
      : plan === "BASIC"
        ? "secondary"
        : "outline";
  return <Badge variant={variant}>{plan}</Badge>;
}

export default function AdminOrgsPage() {
  const [search, setSearch] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [offset, setOffset] = React.useState(0);
  const [selected, setSelected] = React.useState<AdminOrgListItem | null>(null);

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "orgs", debounced, offset],
    queryFn: () =>
      adminApi.orgs({
        search: debounced || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
    staleTime: 15_000,
  });

  const detail = useQuery({
    queryKey: ["admin", "orgs", "detail", selected?.id],
    queryFn: () => (selected ? adminApi.orgDetail(selected.id) : null),
    enabled: !!selected,
  });

  const total = data?.total ?? 0;
  const items = data?.items ?? [];
  const hasPrev = offset > 0;
  const hasNext = offset + PAGE_SIZE < total;

  return (
    <div className="container max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-4">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">ארגונים</h1>
          <p className="text-sm text-muted-foreground">
            {total > 0
              ? `${total.toLocaleString("he-IL")} ארגונים סך הכל`
              : "טוען..."}
          </p>
        </div>
        <ExportCsvButton type="orgs" />
      </header>

      <div className="relative max-w-md">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOffset(0);
          }}
          placeholder="חיפוש לפי שם או תעשייה"
          className="pr-9"
          dir="rtl"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr className="text-right">
                  <th className="px-4 py-3 font-medium">שם</th>
                  <th className="px-4 py-3 font-medium">תעשייה</th>
                  <th className="px-4 py-3 font-medium">מסלול</th>
                  <th className="px-4 py-3 font-medium tabular-nums">חברים</th>
                  <th className="px-4 py-3 font-medium tabular-nums">עובדים</th>
                  <th className="px-4 py-3 font-medium tabular-nums">סידורים</th>
                  <th className="px-4 py-3 font-medium">נוצר</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-t border-border">
                      <td colSpan={7} className="px-4 py-3">
                        <Skeleton className="h-5 w-full" />
                      </td>
                    </tr>
                  ))
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      אין תוצאות
                    </td>
                  </tr>
                ) : (
                  items.map((o) => (
                    <tr
                      key={o.id}
                      onClick={() => setSelected(o)}
                      className="border-t border-border cursor-pointer hover:bg-accent/40"
                    >
                      <td className="px-4 py-3 font-medium">{o.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {o.industry ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <PlanBadge plan={o.plan} />
                      </td>
                      <td className="px-4 py-3 tabular-nums">{o.memberCount}</td>
                      <td className="px-4 py-3 tabular-nums">{o.employeeCount}</td>
                      <td className="px-4 py-3 tabular-nums">{o.scheduleCount}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(o.createdAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          מציג {items.length === 0 ? 0 : offset + 1}–{offset + items.length} מתוך {total}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!hasPrev}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            הקודם
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!hasNext}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            הבא
          </Button>
        </div>
      </div>

      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent side="left" className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selected?.name}</SheetTitle>
            <SheetDescription>
              {selected ? `מזהה: ${selected.id}` : ""}
            </SheetDescription>
          </SheetHeader>
          {detail.isLoading ? (
            <div className="mt-6 space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : detail.data && selected ? (
            <OrgDetail
              data={detail.data}
              org={selected}
              onClose={() => setSelected(null)}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function OrgDetail({
  data,
  org: orgListItem,
  onClose,
}: {
  data: {
    org: Record<string, unknown>;
    recentSchedules: Array<Record<string, unknown>>;
  };
  org: AdminOrgListItem;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const org = data.org as {
    id: string;
    plan: string;
    industry: string | null;
    defaultTimezone: string;
    createdAt: string;
    stripeCustomerId: string | null;
    featureFlags?: AdminFeatureFlags | null;
    _count: {
      memberships: number;
      employees: number;
      schedules: number;
      shifts: number;
      locations: number;
    };
    memberships: Array<{ id: string; userId: string; role: string; createdAt: string }>;
  };

  const orgId = orgListItem.id;

  // Plan picker
  const [plan, setPlan] = React.useState<AdminPlan>(org.plan as AdminPlan);
  React.useEffect(() => {
    setPlan(org.plan as AdminPlan);
  }, [org.plan]);

  const planMutation = useMutation({
    mutationFn: (next: AdminPlan) => adminApi.updatePlan(orgId, next),
    onSuccess: (_res, next) => {
      toast.success(`המסלול שונה ל-${next}`);
      qc.invalidateQueries({ queryKey: ["admin", "orgs"] });
    },
    onError: () => toast.error("שינוי המסלול נכשל"),
  });

  const onPlanChange = (next: string) => {
    const p = next as AdminPlan;
    setPlan(p);
    planMutation.mutate(p);
  };

  // Soft-delete
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const deleteMutation = useMutation({
    mutationFn: () => adminApi.softDelete(orgId),
    onSuccess: () => {
      toast.success("הארגון סומן כמחוק");
      qc.invalidateQueries({ queryKey: ["admin", "orgs"] });
      setConfirmOpen(false);
      onClose();
    },
    onError: () => toast.error("מחיקת הארגון נכשלה"),
  });

  // Feature flags
  const initialFlags = React.useMemo<AdminFeatureFlags>(
    () => ({ ...(org.featureFlags ?? {}) }),
    [org.featureFlags],
  );
  const [flags, setFlags] = React.useState<AdminFeatureFlags>(initialFlags);
  React.useEffect(() => {
    setFlags(initialFlags);
  }, [initialFlags]);

  const flagsMutation = useMutation({
    mutationFn: (next: AdminFeatureFlags) =>
      adminApi.updateFeatureFlags(orgId, next),
    onSuccess: () => {
      toast.success("פיצ'רים עודכנו");
      qc.invalidateQueries({ queryKey: ["admin", "orgs", "detail", orgId] });
    },
    onError: () => toast.error("עדכון פיצ'רים נכשל"),
  });

  const toggleFlag = (key: keyof AdminFeatureFlags, value: boolean) => {
    const next = { ...flags, [key]: value };
    setFlags(next);
    flagsMutation.mutate(next);
  };

  return (
    <div className="mt-6 space-y-4 text-sm">
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview" className="flex-1">
            סקירה
          </TabsTrigger>
          <TabsTrigger value="features" className="flex-1">
            פיצ׳רים
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-border p-3 col-span-2">
              <div className="text-[11px] text-muted-foreground mb-2">מסלול</div>
              <Select
                value={plan}
                onValueChange={onPlanChange}
                disabled={planMutation.isPending}
                dir="rtl"
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLANS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Stat label="תעשייה" value={org.industry ?? "—"} />
            <Stat label="אזור זמן" value={org.defaultTimezone} />
            <Stat label="נוצר" value={formatDate(org.createdAt)} />
            <Stat label="חברים" value={org._count.memberships} />
            <Stat label="עובדים" value={org._count.employees} />
            <Stat label="סידורים" value={org._count.schedules} />
            <Stat label="משמרות" value={org._count.shifts} />
            <Stat label="סניפים" value={org._count.locations} />
            <Stat
              label="Stripe customer"
              value={org.stripeCustomerId ?? "—"}
            />
          </div>

          <div>
            <h3 className="font-medium mb-2">חברים ({org.memberships.length})</h3>
            <div className="border border-border rounded-md divide-y divide-border">
              {org.memberships.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between px-3 py-2 text-xs"
                >
                  <span className="font-mono">{m.userId.slice(0, 8)}…</span>
                  <Badge variant="outline">{m.role}</Badge>
                  <span className="text-muted-foreground">
                    {formatDate(m.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-medium mb-2">סידורים אחרונים</h3>
            {data.recentSchedules.length === 0 ? (
              <p className="text-xs text-muted-foreground">אין סידורים עדיין</p>
            ) : (
              <div className="border border-border rounded-md divide-y divide-border">
                {data.recentSchedules.map((s) => {
                  const sch = s as {
                    id: string;
                    name: string;
                    status: string;
                    periodStartDate: string;
                    periodEndDate: string;
                  };
                  return (
                    <div
                      key={sch.id}
                      className="flex items-center justify-between px-3 py-2 text-xs"
                    >
                      <span className="font-medium">{sch.name}</span>
                      <Badge variant="outline">{sch.status}</Badge>
                      <span className="text-muted-foreground">
                        {formatDate(sch.periodStartDate)} →{" "}
                        {formatDate(sch.periodEndDate)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border-t border-border pt-4">
            <Button
              variant="destructive"
              onClick={() => setConfirmOpen(true)}
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" />
              מחק ארגון
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="features" className="space-y-2">
          {FEATURE_FLAG_KEYS.map(({ key, label }) => {
            const value = !!flags[key];
            return (
              <div
                key={String(key)}
                className="flex items-center justify-between rounded-md border border-border bg-card/50 px-3 py-2"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{label}</span>
                  <span className="text-[11px] text-muted-foreground font-mono">
                    {String(key)}
                  </span>
                </div>
                <Switch
                  checked={value}
                  onCheckedChange={(next) => toggleFlag(key, next)}
                  aria-label={label}
                  disabled={flagsMutation.isPending}
                />
              </div>
            );
          })}
        </TabsContent>
      </Tabs>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>מחיקת ארגון</DialogTitle>
            <DialogDescription>
              ארגון <strong>{orgListItem.name}</strong> יסומן כמחוק. הפעולה הפיכה.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={deleteMutation.isPending}
            >
              ביטול
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "מוחק…" : "מחק"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}
