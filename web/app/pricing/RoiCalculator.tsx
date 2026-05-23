"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * ROI calculator — client island for /pricing.
 *
 * Inputs: number of employees, hours/week spent on scheduling.
 * Outputs: estimated time saved/month and ₪ saved/month, assuming an
 * average managerial hourly cost of ₪120 and ~70% scheduling time reduction.
 */

const MANAGER_HOURLY_COST_ILS = 120;
const TIME_REDUCTION = 0.7;

export function RoiCalculator() {
  const [employees, setEmployees] = useState(15);
  const [hoursPerWeek, setHoursPerWeek] = useState(6);

  const monthlyHoursNow = hoursPerWeek * 4.3;
  const monthlyHoursSaved = monthlyHoursNow * TIME_REDUCTION;
  const moneySavedPerMonth = Math.round(
    monthlyHoursSaved * MANAGER_HOURLY_COST_ILS,
  );
  const annualSaving = moneySavedPerMonth * 12;

  return (
    <Card className="bg-card">
      <CardContent className="p-8">
        <div className="grid gap-8 md:grid-cols-2">
          {/* Inputs */}
          <div className="space-y-6">
            <div>
              <label
                htmlFor="employees"
                className="flex items-center justify-between text-sm font-medium text-foreground"
              >
                <span>מספר עובדים</span>
                <span className="text-lg font-bold text-indigo-500">
                  {employees}
                </span>
              </label>
              <input
                id="employees"
                type="range"
                min={3}
                max={100}
                step={1}
                value={employees}
                onChange={(e) => setEmployees(Number(e.target.value))}
                className="mt-3 w-full accent-indigo-500"
              />
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>3</span>
                <span>100</span>
              </div>
            </div>

            <div>
              <label
                htmlFor="hours"
                className="flex items-center justify-between text-sm font-medium text-foreground"
              >
                <span>שעות שאתה משקיע בסידור בשבוע</span>
                <span className="text-lg font-bold text-indigo-500">
                  {hoursPerWeek}h
                </span>
              </label>
              <input
                id="hours"
                type="range"
                min={1}
                max={20}
                step={1}
                value={hoursPerWeek}
                onChange={(e) => setHoursPerWeek(Number(e.target.value))}
                className="mt-3 w-full accent-indigo-500"
              />
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>1h</span>
                <span>20h</span>
              </div>
            </div>
          </div>

          {/* Results */}
          <div className="flex flex-col justify-center gap-4 rounded-2xl bg-gradient-to-br from-indigo-500/10 via-transparent to-cyan-400/10 p-6">
            <div>
              <p className="text-sm text-muted-foreground">חיסכון בזמן</p>
              <p className="text-3xl font-extrabold text-foreground">
                {Math.round(monthlyHoursSaved)}{" "}
                <span className="text-base font-medium text-muted-foreground">
                  שעות / חודש
                </span>
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">חיסכון כספי</p>
              <p className="text-3xl font-extrabold text-gradient-brand">
                ₪{moneySavedPerMonth.toLocaleString("he-IL")}{" "}
                <span className="text-base font-medium text-muted-foreground">
                  / חודש
                </span>
              </p>
            </div>
            <div className="border-t border-border/60 pt-3">
              <p className="text-xs text-muted-foreground">
                שווי שנתי משוער:{" "}
                <span className="font-semibold text-foreground">
                  ₪{annualSaving.toLocaleString("he-IL")}
                </span>
              </p>
            </div>
          </div>
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          * אומדן מבוסס על עלות שעת ניהול ממוצעת של ₪{MANAGER_HOURLY_COST_ILS}{" "}
          וצמצום ~{Math.round(TIME_REDUCTION * 100)}% בזמן הקדשה לבניית סידור.
          התוצאה בפועל משתנה לפי גודל ומורכבות הצוות.
        </p>
      </CardContent>
    </Card>
  );
}
