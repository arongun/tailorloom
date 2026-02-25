"use client";

import { useState, useMemo } from "react";
import { CalendarDays, ChevronUp, ChevronLeft, ChevronRight } from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addMonths,
  subMonths,
  isSameDay,
  isSameMonth,
  isAfter,
  isBefore,
  isToday,
  eachDayOfInterval,
} from "date-fns";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useDateRange } from "@/app/(dashboard)/dashboard-context";
import { cn } from "@/lib/utils";

type PresetKey = "today" | "7d" | "14d" | "30d" | "90d" | "6mo" | "12mo";

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "14d", label: "14 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "6mo", label: "6 months" },
  { key: "12mo", label: "12 months" },
];

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function getPresetRange(key: PresetKey): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date();
  switch (key) {
    case "today":
      from.setHours(0, 0, 0, 0);
      break;
    case "7d":
      from.setDate(from.getDate() - 7);
      break;
    case "14d":
      from.setDate(from.getDate() - 14);
      break;
    case "30d":
      from.setDate(from.getDate() - 30);
      break;
    case "90d":
      from.setDate(from.getDate() - 90);
      break;
    case "6mo":
      from.setMonth(from.getMonth() - 6);
      break;
    case "12mo":
      from.setMonth(from.getMonth() - 12);
      break;
  }
  return { from, to };
}

/* ─── Custom Mini Calendar ─────────────────────────────── */

function MiniCalendar({
  from,
  to,
  onDayClick,
}: {
  from?: Date;
  to?: Date;
  onDayClick: (date: Date) => void;
}) {
  const [viewDate, setViewDate] = useState(() => from ?? new Date());
  const today = useMemo(() => new Date(), []);

  const days = useMemo(() => {
    const monthStart = startOfMonth(viewDate);
    const monthEnd = endOfMonth(viewDate);
    const calStart = startOfWeek(monthStart);
    const calEnd = endOfWeek(monthEnd);
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [viewDate]);

  // Normalize so from <= to for display
  const normFrom = from && to && isAfter(from, to) ? to : from;
  const normTo = from && to && isAfter(from, to) ? from : to;
  const isSingle = !!(normFrom && normTo && isSameDay(normFrom, normTo));
  const hasRange = !!(normFrom && normTo && !isSingle);

  // Precompute range membership for neighbor checks
  const rangeMask = useMemo(() => {
    return days.map((day) => {
      if (!normFrom) return false;
      if (isSameDay(day, normFrom)) return true;
      if (normTo && isSameDay(day, normTo)) return true;
      if (hasRange && isAfter(day, normFrom) && isBefore(day, normTo!))
        return true;
      return false;
    });
  }, [days, normFrom, normTo, hasRange]);

  return (
    <div>
      {/* Month header */}
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => setViewDate(subMonths(viewDate, 1))}
          className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-muted transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium text-text-primary">
          {format(viewDate, "MMMM yyyy")}
        </span>
        <button
          type="button"
          onClick={() => setViewDate(addMonths(viewDate, 1))}
          className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-muted transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7">
        {WEEKDAYS.map((wd) => (
          <div
            key={wd}
            className="h-8 flex items-center justify-center text-[11px] font-medium text-text-muted"
          >
            {wd}
          </div>
        ))}
      </div>

      {/* Day grid — no gap so range band is continuous */}
      <div className="grid grid-cols-7">
        {days.map((day, i) => {
          const inCurrentMonth = isSameMonth(day, viewDate);
          const isFuture = isAfter(day, today);
          const isDisabled = isFuture || !inCurrentMonth;

          const isDayToday = isToday(day);
          const isFromDay = normFrom ? isSameDay(day, normFrom) : false;
          const isToDay = normTo ? isSameDay(day, normTo) : false;
          const isSelected = isFromDay || isToDay;

          // Range band — continuous with per-row rounding
          const inBand = hasRange && rangeMask[i];
          const colIdx = i % 7;
          const prevInBand =
            colIdx > 0 && hasRange && rangeMask[i - 1];
          const nextInBand =
            colIdx < 6 && i + 1 < days.length && hasRange && rangeMask[i + 1];

          return (
            <div
              key={day.toISOString()}
              className={cn(
                "flex items-center justify-center h-8 relative",
                inBand && "bg-zinc-200/70 dark:bg-zinc-800/60",
                inBand && !prevInBand && "rounded-l-md",
                inBand && !nextInBand && "rounded-r-md"
              )}
            >
              <button
                type="button"
                disabled={isDisabled}
                onClick={() => onDayClick(day)}
                className={cn(
                  "w-8 h-8 rounded-md text-[13px] flex items-center justify-center relative transition-colors",
                  isSelected &&
                    "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 font-semibold",
                  !isSelected &&
                    inBand &&
                    "text-zinc-700 dark:text-zinc-300",
                  !isSelected &&
                    !inBand &&
                    inCurrentMonth &&
                    !isFuture &&
                    "text-text-secondary hover:bg-surface-muted hover:text-text-primary",
                  !inCurrentMonth && "text-text-muted/30 cursor-default",
                  isFuture &&
                    inCurrentMonth &&
                    "text-text-muted/30 cursor-not-allowed"
                )}
              >
                {format(day, "d")}
                {isDayToday && !isSelected && (
                  <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-500" />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Date Range Picker ────────────────────────────────── */

export function DateRangePicker() {
  const { dateRange, setDateRange } = useDateRange();
  const [open, setOpen] = useState(false);

  // Local draft state — survives close/reopen within same page mount
  const [pendingFrom, setPendingFrom] = useState<Date | undefined>(
    dateRange.from ?? undefined
  );
  const [pendingTo, setPendingTo] = useState<Date | undefined>(
    dateRange.to ?? undefined
  );

  // Two-step click: first click → from, second click → to
  const [step, setStep] = useState<"from" | "to">("from");

  const hasFilter = dateRange.from !== null;

  const buttonLabel =
    hasFilter && dateRange.from
      ? `${format(dateRange.from, "MMM d")} – ${dateRange.to ? format(dateRange.to, "MMM d") : "now"}`
      : "All time";

  const commitRange = (from: Date, to: Date) => {
    const [f, t] = isAfter(from, to) ? [to, from] : [from, to];
    setDateRange({ from: f, to: t });
  };

  const handlePreset = (key: PresetKey) => {
    const range = getPresetRange(key);
    setPendingFrom(range.from);
    setPendingTo(range.to);
    setStep("from");
    commitRange(range.from, range.to);
  };

  const handleDayClick = (date: Date) => {
    if (step === "from") {
      // First click — set FROM, clear TO, advance to step 2
      setPendingFrom(date);
      setPendingTo(undefined);
      setStep("to");
    } else {
      // Second click — set TO, auto-swap if needed, commit
      // Stay on "to" so user can fine-tune the end date
      const from = pendingFrom!;
      const to = date;
      if (isAfter(from, to)) {
        setPendingFrom(to);
        setPendingTo(from);
      } else {
        setPendingTo(to);
      }
      commitRange(from, to);
    }
  };

  const handleClear = () => {
    setPendingFrom(undefined);
    setPendingTo(undefined);
    setStep("from");
    setDateRange({ from: null, to: null });
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      // If mid-selection (from picked, waiting for to), preserve local state
      const isMidSelection = !!pendingFrom && !pendingTo;
      if (!isMidSelection) {
        setPendingFrom(dateRange.from ?? undefined);
        setPendingTo(dateRange.to ?? undefined);
        setStep("from");
      }
      // mid-selection → keep pendingFrom + step="to" from last session
    }
    setOpen(newOpen);
  };

  const fromLabel = pendingFrom ? format(pendingFrom, "MMM d") : "—";
  const toLabel = pendingTo ? format(pendingTo, "MMM d") : "—";

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[13px] font-medium transition-colors",
            hasFilter
              ? "border-border-default bg-surface text-text-primary"
              : "border-border-default bg-surface text-text-muted hover:text-text-secondary"
          )}
        >
          <CalendarDays className="h-3.5 w-3.5" />
          <span>{buttonLabel}</span>
          <ChevronUp
            className={cn(
              "h-3.5 w-3.5 text-text-muted transition-transform",
              open ? "" : "rotate-180"
            )}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end" sideOffset={8}>
        <div className="p-4 space-y-2.5 w-[264px]">
          {/* Preset chips */}
          <div className="flex flex-wrap gap-1">
            {PRESETS.map((preset) => (
              <button
                key={preset.key}
                onClick={() => handlePreset(preset.key)}
                className="px-2 py-0.5 rounded-md text-[11px] font-medium text-text-muted hover:text-text-secondary hover:bg-surface-muted transition-colors border border-border-default"
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* FROM / TO — clickable, active field highlighted */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[11px] font-medium text-text-muted uppercase tracking-wide mb-1">
                From
              </p>
              <button
                type="button"
                onClick={() => setStep("from")}
                className={cn(
                  "w-full text-left px-2.5 py-1.5 rounded-md border text-[13px] font-medium transition-colors",
                  step === "from"
                    ? "border-text-primary bg-surface-muted text-text-primary ring-1 ring-text-primary"
                    : "border-border-default bg-surface-elevated text-text-primary"
                )}
              >
                {fromLabel}
              </button>
            </div>
            <div>
              <p className="text-[11px] font-medium text-text-muted uppercase tracking-wide mb-1">
                To
              </p>
              <button
                type="button"
                onClick={() => setStep("to")}
                className={cn(
                  "w-full text-left px-2.5 py-1.5 rounded-md border text-[13px] font-medium transition-colors",
                  step === "to"
                    ? "border-text-primary bg-surface-muted text-text-primary ring-1 ring-text-primary"
                    : "border-border-default bg-surface-elevated text-text-primary"
                )}
              >
                {toLabel}
              </button>
            </div>
          </div>

          {/* Custom calendar */}
          <MiniCalendar
            from={pendingFrom}
            to={pendingTo}
            onDayClick={handleDayClick}
          />

          {/* Clear link */}
          <button
            onClick={handleClear}
            className="text-[12px] text-text-muted hover:text-text-secondary transition-colors"
          >
            Clear date filter
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
