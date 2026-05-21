"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { mockLocations } from "@/lib/mocks";
import type { Employee } from "@/lib/types";

const schema = z.object({
  fullName: z.string().min(2, "שם קצר מדי"),
  email: z.string().email("דוא״ל לא תקין").or(z.literal("")),
  roles: z.string().min(1, "ציין תפקיד אחד לפחות"),
  primaryLocationId: z.string().min(1),
  maxHoursPerWeek: z
    .string()
    .optional()
    .refine((v) => !v || (!Number.isNaN(Number(v)) && Number(v) >= 0 && Number(v) <= 168), "ערך לא תקין"),
  minHoursPerWeek: z
    .string()
    .optional()
    .refine((v) => !v || (!Number.isNaN(Number(v)) && Number(v) >= 0 && Number(v) <= 168), "ערך לא תקין"),
});

export type EmployeeFormData = z.infer<typeof schema>;

interface Props {
  initial?: Employee | null;
  onSubmit: (data: EmployeeFormData) => Promise<void> | void;
  onCancel: () => void;
}

export function EmployeeForm({ initial, onSubmit, onCancel }: Props) {
  const form = useForm<EmployeeFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: initial?.fullName ?? "",
      email: initial?.email ?? "",
      roles: initial?.roles.join(", ") ?? "",
      primaryLocationId: initial?.primaryLocationId ?? mockLocations[0]!.id,
      maxHoursPerWeek: initial?.maxHoursPerWeek != null ? String(initial.maxHoursPerWeek) : "40",
      minHoursPerWeek: initial?.minHoursPerWeek != null ? String(initial.minHoursPerWeek) : "0",
    },
  });

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
          {mockLocations.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="minHoursPerWeek">מינ׳ ש׳ שבועיות</Label>
          <Input id="minHoursPerWeek" type="number" {...form.register("minHoursPerWeek")} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="maxHoursPerWeek">מקס׳ ש׳ שבועיות</Label>
          <Input id="maxHoursPerWeek" type="number" {...form.register("maxHoursPerWeek")} />
        </div>
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
