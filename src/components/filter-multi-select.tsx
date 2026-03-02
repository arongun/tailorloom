"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface FilterOption {
  value: string;
  label: string;
}

interface FilterMultiSelectProps {
  label: string;
  options: FilterOption[];
  selected: Set<string>;
  allValues: Set<string>;
  onChange: (next: Set<string>) => void;
  width?: string;
}

export function FilterMultiSelect({
  label,
  options,
  selected,
  allValues,
  onChange,
  width = "w-[150px]",
}: FilterMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const isAll = selected.size === allValues.size;
  const isNone = selected.size === 0;
  const count = selected.size;
  const total = allValues.size;

  const triggerLabel = isAll
    ? `${label}: All`
    : isNone
      ? `${label}: None`
      : count === 1
        ? `${label}: ${options.find((o) => selected.has(o.value))?.label ?? count}`
        : `${label}: ${count} of ${total}`;

  const isFiltered = !isAll;

  const toggleValue = (value: string) => {
    const next = new Set(selected);
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    onChange(next);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`inline-flex items-center justify-between h-9 px-3 rounded-md border text-[13px] transition-colors ${width} ${
            isFiltered
              ? "border-text-primary/20 bg-surface-elevated text-text-primary font-medium"
              : "border-border-default bg-surface text-text-secondary"
          }`}
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronDown className="h-3.5 w-3.5 text-text-muted shrink-0 ml-1.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-52 p-1.5">
        {/* Select all / Clear all */}
        <div className="flex items-center justify-between px-2 py-1.5 mb-0.5">
          <button
            className="text-[11px] text-text-muted hover:text-text-secondary transition-colors"
            onClick={() => onChange(new Set(allValues))}
          >
            Select all
          </button>
          <button
            className="text-[11px] text-text-muted hover:text-text-secondary transition-colors"
            onClick={() => onChange(new Set())}
          >
            Clear all
          </button>
        </div>
        <div className="border-t border-border-muted" />
        {/* Options */}
        <div className="py-1">
          {options.map((opt) => (
            <label
              key={opt.value}
              className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-elevated cursor-pointer transition-colors"
            >
              <Checkbox
                checked={selected.has(opt.value)}
                onCheckedChange={() => toggleValue(opt.value)}
              />
              <span className="text-[13px] text-text-primary">
                {opt.label}
              </span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
