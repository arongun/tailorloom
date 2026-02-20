"use client";

import { CreditCard, Calendar, Ticket } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SourceType } from "@/lib/types";

const sources: {
  key: SourceType;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  activeColor: string;
}[] = [
  {
    key: "stripe",
    label: "Stripe",
    description: "Payment charges, invoices, and subscription data",
    icon: CreditCard,
    color: "text-slate-400 group-hover:text-violet-500",
    activeColor: "text-violet-500",
  },
  {
    key: "calendly",
    label: "Calendly",
    description: "Booking events, invitees, and meeting schedules",
    icon: Calendar,
    color: "text-slate-400 group-hover:text-blue-500",
    activeColor: "text-blue-500",
  },
  {
    key: "passline",
    label: "PassLine",
    description: "Attendance records, check-ins, and ticket scans",
    icon: Ticket,
    color: "text-slate-400 group-hover:text-emerald-500",
    activeColor: "text-emerald-500",
  },
];

interface SourceSelectorProps {
  value: SourceType | null;
  onChange: (source: SourceType) => void;
}

export function SourceSelector({ value, onChange }: SourceSelectorProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {sources.map((source) => {
        const isActive = value === source.key;
        return (
          <button
            key={source.key}
            onClick={() => onChange(source.key)}
            className={cn(
              "group relative flex flex-col items-start gap-3 rounded-xl border p-5 text-left transition-all duration-200",
              isActive
                ? "border-slate-900 bg-slate-900 shadow-sm"
                : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
            )}
          >
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
                isActive ? "bg-white/10" : "bg-slate-50 group-hover:bg-slate-100"
              )}
            >
              <source.icon
                className={cn(
                  "h-5 w-5 transition-colors",
                  isActive ? "text-white" : source.color
                )}
                strokeWidth={1.8}
              />
            </div>
            <div>
              <p
                className={cn(
                  "text-[13px] font-semibold transition-colors",
                  isActive ? "text-white" : "text-slate-900"
                )}
              >
                {source.label}
              </p>
              <p
                className={cn(
                  "mt-1 text-[12px] leading-relaxed transition-colors",
                  isActive ? "text-slate-300" : "text-slate-400"
                )}
              >
                {source.description}
              </p>
            </div>
            {isActive && (
              <div className="absolute right-3 top-3 h-2 w-2 rounded-full bg-white" />
            )}
          </button>
        );
      })}
    </div>
  );
}
