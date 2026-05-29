"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { DateTime } from "luxon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocations } from "@/lib/queries";
import type { Employee } from "@/lib/types";

const schema = z.object({
  fullName: z.string().min(2, "שם קצר מדי"),
  email: z.string().email("דוא״ל לא תקין").or(z.literal("")),
  phone: z.string().max(40, "מספר ארוך מדי").optional().or(z.literal("")),
  roles: z.string().min(1, "ציין תפקיד אחד לפחות"),
  primaryLocationId: z.string(),
  hourlyRate: z.coerce
    .number()
    .min(1, "שכר שעתי חייב להיות לפחות 1₪")
    .max(500),
  hireDate: z.string().optional(),
  weeklyBudgetHours: z.coerce.number().int().min(0).max(80).optional(),
});

export type EmployeeFormData = z.output<typeof schema>;
type EmployeeFormInput = z.input<typeof schema>;

interface Props {
  initial?: Employee | null;
  onSubmit: (data: EmployeeFormData) => Promise<void> | void;
  onCancel: () => void;
}

function formatSeniority(hireDate: string): string | null {
  if (!hireDate) return null;
  const dt = DateTime.fromISO(hireDate);
  if (!dt.isValid) return null;
  const diff = dt.diffNow(["years", "months"]).toObject();
  const years = Math.abs(Math.trunc(diff.years ?? 0));
  const months = Math.abs(Math.trunc(diff.months ?? 0));
  return `ותק: ${years} שנים, ${months} חודשים`;
}

export function EmployeeForm({ initial, onSubmit, onCancel }: Props) {
  const locationsQuery = useLocations();
  const locations = locationsQuery.data ?? [];
  const form = useForm<EmployeeFormInput, unknown, EmployeeFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: initial?.fullName ?? "",
      email: initial?.email ?? "",
      phone: initial?.phone ?? "",
      roles: initial?.roles.join(", ") ?? "",
      primaryLocationId: initial?.primaryLocationId ?? "",
      hourlyRate: initial?.hourlyRate ?? undefined,
      hireDate: initial?.hireDate
        ? initial.hireDate.slice(0, 10)
        : "",
      weeklyBudgetHours: initial?.weeklyBudgetHours ?? undefined,
    },
  });

  const watchedHireDate = form.watch("hireDate");
  const seniorityText = watchedHireDate ? formatSeniority(watchedHireDate) : null;

  return (
    <form
      onSubmit={form.handleSubmit(async (data) => onSubmit(data))}
      className="space-y-3"
      noValidate
    >
      <div className="space-y-1">
        <Label htmlFor="fullName">שם מלא</Label>
        <Input id="fullName" {...form.register("fullName")} aria-invalid={!!form.formState.errors.fullName} />
        {form.formState.errors.fullName ? (
          <p className="text-xs text-destructive">{form.formState.errors.fullName.message}</p>
        ) : null}
      </div>

      <div className="space-y-1">
        <Label htmlFor="email">דוא״ל</Label>
        <Input id="email" type="email" {...form.register("email")} />
        {form.formState.errors.email ? (
          <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
        ) : null}
      </div>

      <div className="space-y-1">
        <Label htmlFor="phone">טלפון</Label>
        <Input id="phone" type="tel" {...form.register("phone")} />
        {form.formState.errors.phone ? (
          <p className="text-xs text-destructive">{form.formState.errors.phone.message}</p>
        ) : null}
      </div>

      <div className="space-y-1">
        <Label htmlFor="roles">תפקידים (מופרדים בפסיק)</Label>
        <Input id="roles" {...form.register("roles")} />
        {form.formState.errors.roles ? (
          <p className="text-xs text-destructive">{form.formState.errors.roles.message}</p>
        ) : null}
      </div>

      <div className="space-y-1">
        <Label htmlFor="primaryLocationId">סניף ראשי</Label>
        <select
          id="primaryLocationId"
          {...form.register("primaryLocationId")}
          className="w-full h-10 rounded-md border bg-background px-3 text-sm"
        >
          <option value="">— ללא —</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <Label htmlFor="hourlyRate">שכר שעתי</Label>
        <div className="flex items-center gap-2">
          <Input
            id="hourlyRate"
            type="number"
            step="0.5"
            min={1}
            max={500}
            {...form.register("hourlyRate")}
            aria-invalid={!!form.formState.errors.hourlyRate}
            className="flex-1"
          />
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            ₪/שעה
          </span>
        </div>
        {form.formState.errors.hourlyRate ? (
          <p className="text-xs text-destructive">
            {form.formState.errors.hourlyRate.message}
          </p>
        ) : null}
      </div>

      <div className="space-y-1">
        <Label htmlFor="hireDate">תאריך תחילת עבודה</Label>
        <Input id="hireDate" type="date" {...form.register("hireDate")} />
        {seniorityText ? (
          <p className="text-xs text-muted-foreground">{seniorityText}</p>
        ) : null}
      </div>

      <div className="space-y-1">
        <Label htmlFor="weeklyBudgetHours">תקציב שעות שבועי (אופציונלי)</Label>
        <Input
          id="weeklyBudgetHours"
          type="number"
          min={0}
          max={80}
          step={1}
          {...form.register("weeklyBudgetHours")}
        />
        {form.formState.errors.weeklyBudgetHours ? (
          <p className="text-xs text-destructive">
            {form.formState.errors.weeklyBudgetHours.message}
          </p>
        ) : null}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          ביטול
        </Button>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "שומר…" : "שמור"}
        </Button>
      </div>
    </form>
  );
}
