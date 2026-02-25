"use client";

import { useState } from "react";
import {
  Link2,
  UserPlus,
  Copy,
  ChevronDown,
  ChevronRight,
  Check,
  Plus,
  SkipForward,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  StitchPreviewResult,
  StitchPreviewRow,
  StitchDecisions,
  StitchDecision,
} from "@/lib/types";

// ─── Types ──────────────────────────────────────────────────

interface StitchPreviewProps {
  result: StitchPreviewResult;
  decisions: StitchDecisions;
  onDecisionsChange: (decisions: StitchDecisions) => void;
}

// ─── Component ──────────────────────────────────────────────

export function StitchPreview({
  result,
  decisions,
  onDecisionsChange,
}: StitchPreviewProps) {
  const { summary } = result;

  const setDecision = (rowIndex: number, decision: StitchDecision) => {
    onDecisionsChange({ ...decisions, [rowIndex]: decision });
  };

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        <SummaryCard
          label="Confident Matches"
          value={summary.confidentMatches}
          icon={<Link2 className="h-4 w-4 text-emerald-500" />}
          borderColor="border-emerald-200 dark:border-emerald-800"
          fillColor="bg-emerald-50/50 dark:bg-emerald-950/40"
          description="Matched by ID or email"
        />
        <SummaryCard
          label="Needs Review"
          value={summary.uncertainMatches}
          icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
          borderColor="border-amber-300 dark:border-amber-700"
          fillColor="bg-amber-50/50 dark:bg-amber-950/40"
          description="Name match, different email"
        />
        <SummaryCard
          label="New Customers"
          value={summary.newCustomers}
          icon={<UserPlus className="h-4 w-4 text-blue-500" />}
          borderColor="border-blue-200 dark:border-blue-800"
          fillColor="bg-blue-50/50 dark:bg-blue-950/40"
          description="Will be created"
        />
        <SummaryCard
          label="Duplicates"
          value={summary.duplicateRows}
          icon={<Copy className="h-4 w-4 text-red-400" />}
          borderColor="border-red-300 dark:border-red-800"
          fillColor="bg-red-50/50 dark:bg-red-950/40"
          description="Already imported, skipped"
        />
      </div>

      {/* Uncertain matches — user must decide */}
      {result.uncertainRows.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/20 overflow-hidden">
          <div className="border-b border-amber-100 px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <p className="text-[13px] font-medium text-amber-800">
                Review required — {result.uncertainRows.length} uncertain{" "}
                {result.uncertainRows.length === 1 ? "match" : "matches"}
              </p>
            </div>
            <p className="text-[11px] text-amber-600">
              Same name found with a different email
            </p>
          </div>
          <div className="divide-y divide-amber-100">
            {result.uncertainRows.map((row) => (
              <UncertainMatchRow
                key={row.rowIndex}
                row={row}
                decision={
                  decisions[row.rowIndex] ?? { action: "create_new" }
                }
                onDecisionChange={(d) => setDecision(row.rowIndex, d)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Confident matches — collapsible */}
      {result.confidentRows.length > 0 && (
        <CollapsibleSection
          title="Confident Matches"
          count={summary.confidentMatches}
          sampleCount={result.confidentRows.length}
          color="emerald"
        >
          {result.confidentRows.map((row) => (
            <div
              key={row.rowIndex}
              className="flex items-center gap-4 px-5 py-2.5 text-[12px]"
            >
              <span className="font-mono text-text-muted w-12">
                Row {row.rowIndex}
              </span>
              <span className="text-text-secondary min-w-[140px] truncate">
                {row.name ?? "—"}
              </span>
              <span className="text-text-muted min-w-[180px] truncate">
                {row.email ?? "—"}
              </span>
              <span className="text-text-muted mx-1">&rarr;</span>
              <span className="text-emerald-600 truncate">
                {row.existingCustomerName ?? row.existingCustomerEmail ?? "—"}
              </span>
              <MatchBadge category={row.category} />
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* New customers — collapsible */}
      {result.newRows.length > 0 && (
        <CollapsibleSection
          title="New Customers"
          count={summary.newCustomers}
          sampleCount={result.newRows.length}
          color="blue"
        >
          {result.newRows.map((row) => (
            <div
              key={row.rowIndex}
              className="flex items-center gap-4 px-5 py-2.5 text-[12px]"
            >
              <span className="font-mono text-text-muted w-12">
                Row {row.rowIndex}
              </span>
              <span className="text-text-secondary min-w-[140px] truncate">
                {row.name ?? "—"}
              </span>
              <span className="text-text-muted truncate">
                {row.email ?? "—"}
              </span>
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Duplicates — collapsible */}
      {result.duplicateRows.length > 0 && (
        <CollapsibleSection
          title="Duplicate Rows"
          count={summary.duplicateRows}
          sampleCount={result.duplicateRows.length}
          color="slate"
        >
          {result.duplicateRows.map((row) => (
            <div
              key={row.rowIndex}
              className="flex items-center gap-4 px-5 py-2.5 text-[12px]"
            >
              <span className="font-mono text-text-muted w-12">
                Row {row.rowIndex}
              </span>
              <span className="text-text-secondary min-w-[140px] truncate">
                {row.name ?? "—"}
              </span>
              <span className="text-text-muted truncate">
                {row.externalId}
              </span>
              <span className="text-text-muted text-[11px]">
                already imported
              </span>
            </div>
          ))}
        </CollapsibleSection>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────

function SummaryCard({
  label,
  value,
  icon,
  borderColor,
  fillColor,
  description,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  borderColor: string;
  fillColor: string;
  description: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        borderColor,
        value > 0 ? fillColor : "bg-surface"
      )}
    >
      <div className="flex items-center gap-2 mb-2">{icon}</div>
      <p className="text-[18px] font-semibold text-text-primary tabular-nums">
        {value}
      </p>
      <p className="text-[11px] text-text-muted mt-0.5">{label}</p>
      <p className="text-[10px] text-text-muted mt-0.5">{description}</p>
    </div>
  );
}

function UncertainMatchRow({
  row,
  decision,
  onDecisionChange,
}: {
  row: StitchPreviewRow;
  decision: StitchDecision;
  onDecisionChange: (d: StitchDecision) => void;
}) {
  return (
    <div className="px-5 py-4 flex items-start gap-4">
      {/* CSV row info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-mono text-[11px] text-amber-500">
            Row {row.rowIndex}
          </span>
        </div>
        <p className="text-[13px] font-medium text-text-primary truncate">
          {row.name ?? "—"}
        </p>
        <p className="text-[12px] text-text-muted truncate">
          {row.email ?? "No email"}
        </p>
      </div>

      {/* Arrow */}
      <div className="flex items-center pt-4 text-text-muted">
        <span className="text-[12px]">&harr;</span>
      </div>

      {/* Existing customer */}
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-text-muted mb-1">Existing customer</p>
        <p className="text-[13px] font-medium text-text-primary truncate">
          {row.existingCustomerName ?? "—"}
        </p>
        <p className="text-[12px] text-text-muted truncate">
          {row.existingCustomerEmail ?? "No email"}
        </p>
      </div>

      {/* Decision buttons */}
      <div className="flex items-center gap-1.5 pt-2 shrink-0">
        <DecisionButton
          active={
            decision.action === "merge" &&
            decision.targetCustomerId === row.existingCustomerId
          }
          onClick={() =>
            onDecisionChange({
              action: "merge",
              targetCustomerId: row.existingCustomerId!,
            })
          }
          icon={<Check className="h-3.5 w-3.5" />}
          label="Merge"
          activeColor="bg-emerald-100 text-emerald-700 border-emerald-300"
        />
        <DecisionButton
          active={decision.action === "create_new"}
          onClick={() => onDecisionChange({ action: "create_new" })}
          icon={<Plus className="h-3.5 w-3.5" />}
          label="New"
          activeColor="bg-blue-100 text-blue-700 border-blue-300"
        />
        <DecisionButton
          active={decision.action === "skip"}
          onClick={() => onDecisionChange({ action: "skip" })}
          icon={<SkipForward className="h-3.5 w-3.5" />}
          label="Skip"
          activeColor="bg-surface-muted text-text-secondary border-border-default"
        />
      </div>
    </div>
  );
}

function DecisionButton({
  active,
  onClick,
  icon,
  label,
  activeColor,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  activeColor: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-all",
        active
          ? activeColor
          : "bg-surface border-border-default text-text-muted hover:border-border-default hover:text-text-secondary"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function MatchBadge({ category }: { category: string }) {
  const config: Record<string, { label: string; color: string }> = {
    external_id: { label: "ID", color: "bg-emerald-100 text-emerald-700" },
    email: { label: "Email", color: "bg-blue-100 text-blue-700" },
    name_conflict: { label: "Name", color: "bg-amber-100 text-amber-700" },
    new: { label: "New", color: "bg-surface-muted text-text-secondary" },
    duplicate: { label: "Dup", color: "bg-surface-muted text-text-muted" },
  };

  const c = config[category] ?? config.new;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
        c.color
      )}
    >
      {c.label}
    </span>
  );
}

function CollapsibleSection({
  title,
  count,
  sampleCount,
  color,
  children,
}: {
  title: string;
  count: number;
  sampleCount: number;
  color: "emerald" | "blue" | "slate";
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const borderColor =
    color === "emerald"
      ? "border-emerald-200 dark:border-emerald-800"
      : color === "blue"
        ? "border-blue-200 dark:border-blue-800"
        : "border-border-default";

  const headerBg =
    color === "emerald"
      ? "bg-emerald-50/30 dark:bg-emerald-950/40"
      : color === "blue"
        ? "bg-blue-50/30 dark:bg-blue-950/40"
        : "bg-surface-elevated/30";

  return (
    <div className={cn("rounded-xl border overflow-hidden", borderColor)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "w-full flex items-center justify-between px-5 py-3 text-left transition-colors hover:bg-surface-elevated/50",
          headerBg
        )}
      >
        <p className="text-[13px] font-medium text-text-secondary">
          {title}{" "}
          <span className="text-text-muted font-normal">({count})</span>
        </p>
        <div className="flex items-center gap-2">
          {!open && count > sampleCount && (
            <span className="text-[11px] text-text-muted">
              showing {sampleCount} of {count}
            </span>
          )}
          {open ? (
            <ChevronDown className="h-4 w-4 text-text-muted" />
          ) : (
            <ChevronRight className="h-4 w-4 text-text-muted" />
          )}
        </div>
      </button>
      {open && (
        <div className="divide-y divide-border-muted border-t border-border-muted">
          {children}
          {count > sampleCount && (
            <div className="px-5 py-2 text-center">
              <p className="text-[11px] text-text-muted">
                Showing {sampleCount} of {count} rows
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
