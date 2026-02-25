"use client";

import { useState, useRef, useEffect, useCallback } from "react";
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
  Pencil,
  Search,
  ArrowRight,
  Loader2,
  X,
  Eye,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { searchCustomers } from "@/lib/actions/dashboard";
import { CustomerDetailSheet } from "@/components/customer-detail-sheet";
import type {
  StitchPreviewResult,
  StitchPreviewRow,
  StitchDecisions,
  StitchDecision,
  StitchCandidate,
  EnrichableField,
} from "@/lib/types";

// ─── Types ──────────────────────────────────────────────────

interface StitchPreviewProps {
  result: StitchPreviewResult;
  decisions: StitchDecisions;
  onDecisionsChange: (decisions: StitchDecisions) => void;
}

const FIELD_LABELS: Record<string, string> = {
  full_name: "name",
  email: "email",
  phone: "phone",
};

// ─── Component ──────────────────────────────────────────────

export function StitchPreview({
  result,
  decisions,
  onDecisionsChange,
}: StitchPreviewProps) {
  const { summary } = result;
  const [peekCustomerId, setPeekCustomerId] = useState<string | null>(null);
  const [peekOpen, setPeekOpen] = useState(false);

  const setDecision = (rowIndex: number, decision: StitchDecision) => {
    onDecisionsChange({ ...decisions, [rowIndex]: decision });
  };

  const handlePeekCustomer = (customerId: string) => {
    setPeekCustomerId(customerId);
    setPeekOpen(true);
  };

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard
          label="Confident Matches"
          value={summary.confidentMatches}
          icon={<Link2 className="h-4 w-4 text-emerald-500" />}
          borderColor="border-emerald-200 dark:border-emerald-800"
          fillColor="bg-emerald-50/50 dark:bg-emerald-950/40"
          description="Matched by ID or email"
        />
        <SummaryCard
          label="Match + Enrich"
          value={summary.enrichments}
          icon={<Pencil className="h-4 w-4 text-teal-500" />}
          borderColor="border-teal-200 dark:border-teal-700"
          fillColor="bg-teal-50/50 dark:bg-teal-950/40"
          description="Matched with optional data fill"
        />
        <SummaryCard
          label="Review Name"
          value={summary.nameReviewMatches}
          icon={<AlertTriangle className="h-4 w-4 text-orange-500" />}
          borderColor="border-orange-200 dark:border-orange-800"
          fillColor="bg-orange-50/50 dark:bg-orange-950/40"
          description="Email matched, name differs"
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard
          label="Needs Review"
          value={summary.uncertainMatches}
          icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
          borderColor="border-amber-300 dark:border-amber-700"
          fillColor="bg-amber-50/50 dark:bg-amber-950/40"
          description="Potential matches found"
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

      {/* Data Enrichment section */}
      {result.enrichmentRows.length > 0 && (
        <div className="rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50/10 dark:bg-teal-950/20 overflow-hidden">
          <div className="border-b border-teal-200/60 dark:border-teal-800/60 px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Pencil className="h-4 w-4 text-teal-500" />
              <p className="text-[13px] font-medium text-teal-800 dark:text-teal-300">
                Confident Matches + Enrichment — {result.enrichmentRows.length}{" "}
                {result.enrichmentRows.length === 1 ? "customer" : "customers"} matched
              </p>
            </div>
            <p className="text-[11px] text-teal-600 dark:text-teal-400">
              Matched by email or ID. You can optionally update their missing fields.
            </p>
          </div>
          <div className="divide-y divide-teal-100 dark:divide-teal-900/40">
            {result.enrichmentRows.map((row) => (
              <EnrichmentRow
                key={row.rowIndex}
                row={row}
                decision={
                  decisions[row.rowIndex] ?? {
                    action: "accept_enrichment",
                    targetCustomerId: row.existingCustomerId!,
                  }
                }
                onDecisionChange={(d) => setDecision(row.rowIndex, d)}
                onPeekCustomer={handlePeekCustomer}
              />
            ))}
          </div>
        </div>
      )}

      {/* Name review — email matched but name differs */}
      {result.nameReviewRows.length > 0 && (
        <div className="rounded-xl border border-orange-200 dark:border-orange-800 bg-orange-50/10 dark:bg-orange-950/20 overflow-hidden">
          <div className="border-b border-orange-200/60 dark:border-orange-800/60 px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              <p className="text-[13px] font-medium text-orange-800 dark:text-orange-300">
                Review Name — {result.nameReviewRows.length}{" "}
                {result.nameReviewRows.length === 1 ? "match" : "matches"} with different names
              </p>
            </div>
            <p className="text-[11px] text-orange-600 dark:text-orange-400">
              Email matched, but the name in the CSV differs from the existing customer
            </p>
          </div>
          <div className="divide-y divide-orange-100 dark:divide-orange-900/40">
            {result.nameReviewRows.map((row) => (
              <NameReviewRow
                key={row.rowIndex}
                row={row}
                decision={
                  decisions[row.rowIndex] ?? {
                    action: "merge_keep_name",
                    targetCustomerId: row.existingCustomerId!,
                  }
                }
                onDecisionChange={(d) => setDecision(row.rowIndex, d)}
                onPeekCustomer={handlePeekCustomer}
              />
            ))}
          </div>
        </div>
      )}

      {/* Uncertain matches — user must decide */}
      {result.uncertainRows.length > 0 && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/20 dark:bg-amber-950/20 overflow-hidden">
          <div className="border-b border-amber-100 dark:border-amber-800/60 px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <p className="text-[13px] font-medium text-amber-800 dark:text-amber-300">
                Review required — {result.uncertainRows.length} potential{" "}
                {result.uncertainRows.length === 1 ? "match" : "matches"}
              </p>
            </div>
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              No strong identifier (email/ID) found — matched by name only
            </p>
          </div>
          <div className="divide-y divide-amber-100 dark:divide-amber-900/40">
            {result.uncertainRows.map((row) => (
              <UncertainMatchRow
                key={row.rowIndex}
                row={row}
                decision={
                  decisions[row.rowIndex] ?? { action: "create_new" }
                }
                onDecisionChange={(d) => setDecision(row.rowIndex, d)}
                onPeekCustomer={handlePeekCustomer}
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
              <span className="text-emerald-600 dark:text-emerald-400 truncate">
                {row.existingCustomerName ?? row.existingCustomerEmail ?? "—"}
              </span>
              <MatchBadge category={row.category} />
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* New customers — collapsible with link-to-existing */}
      {result.newRows.length > 0 && (
        <CollapsibleSection
          title="New Customers"
          count={summary.newCustomers}
          sampleCount={result.newRows.length}
          color="blue"
        >
          {result.newRows.map((row) => (
            <NewCustomerRow
              key={row.rowIndex}
              row={row}
              decision={decisions[row.rowIndex]}
              onDecisionChange={(d) => setDecision(row.rowIndex, d)}
              onPeekCustomer={handlePeekCustomer}
            />
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

      {/* Peek panel */}
      <CustomerDetailSheet
        open={peekOpen}
        onOpenChange={setPeekOpen}
        customerId={peekCustomerId}
      />
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

function EnrichmentRow({
  row,
  decision,
  onDecisionChange,
  onPeekCustomer,
}: {
  row: StitchPreviewRow;
  decision: StitchDecision;
  onDecisionChange: (d: StitchDecision) => void;
  onPeekCustomer: (id: string) => void;
}) {
  const isAccepted = decision.action === "accept_enrichment";
  const isSkipped = decision.action === "skip";

  return (
    <div className="px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="font-mono text-[11px] text-teal-500 dark:text-teal-400">
              Row {row.rowIndex}
            </span>
            <MatchBadge category={row.category} />
          </div>
          <button
            type="button"
            onClick={() => row.existingCustomerId && onPeekCustomer(row.existingCustomerId)}
            className="text-[13px] font-medium text-text-primary hover:text-teal-700 dark:hover:text-teal-300 hover:underline truncate text-left transition-colors"
          >
            {row.existingCustomerName ?? "Unknown"}
          </button>
          <p className="text-[12px] text-text-muted truncate">
            {row.existingCustomerEmail ?? "No email"}
          </p>

          {/* Enrichable fields list */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {row.enrichableFields.map((field) => (
              <span
                key={field.field}
                className="inline-flex items-center gap-1 rounded-md bg-teal-100/60 dark:bg-teal-900/30 px-2 py-0.5 text-[11px] text-teal-700 dark:text-teal-300"
              >
                <span className="text-teal-500 dark:text-teal-400">{FIELD_LABELS[field.field]}</span>
                <ArrowRight className="h-3 w-3 text-teal-400 dark:text-teal-500" />
                <span className="font-medium">{field.newValue}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Decision buttons */}
        <div className="flex items-center gap-1.5 pt-1 shrink-0">
          <DecisionButton
            active={isAccepted}
            onClick={() =>
              onDecisionChange({
                action: "accept_enrichment",
                targetCustomerId: row.existingCustomerId!,
              })
            }
            icon={<Check className="h-3.5 w-3.5" />}
            label="Accept"
            activeColor="bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-300 dark:border-emerald-700"
          />
          <DecisionButton
            active={isSkipped}
            onClick={() => onDecisionChange({ action: "skip" })}
            icon={<SkipForward className="h-3.5 w-3.5" />}
            label="Skip"
            activeColor="bg-surface-muted text-text-secondary border-border-default"
          />
        </div>
      </div>
    </div>
  );
}

function NameReviewRow({
  row,
  decision,
  onDecisionChange,
  onPeekCustomer,
}: {
  row: StitchPreviewRow;
  decision: StitchDecision;
  onDecisionChange: (d: StitchDecision) => void;
  onPeekCustomer: (id: string) => void;
}) {
  const isKeep = decision.action === "merge_keep_name";
  const isUpdate = decision.action === "merge_update_name";
  const isSkipped = decision.action === "skip";

  return (
    <div className="px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="font-mono text-[11px] text-orange-500 dark:text-orange-400">
              Row {row.rowIndex}
            </span>
            <MatchBadge category={row.category} />
          </div>
          <div className="flex items-center gap-3 mb-1">
            <div className="min-w-0">
              <p className="text-[11px] text-text-muted">Existing name</p>
              <button
                type="button"
                onClick={() => row.existingCustomerId && onPeekCustomer(row.existingCustomerId)}
                className="text-[13px] font-medium text-text-primary hover:text-orange-700 dark:hover:text-orange-300 hover:underline truncate text-left transition-colors"
              >
                {row.existingCustomerName ?? "Unknown"}
              </button>
            </div>
            <span className="text-text-muted text-[12px] pt-3">&harr;</span>
            <div className="min-w-0">
              <p className="text-[11px] text-text-muted">CSV name</p>
              <p className="text-[13px] font-medium text-orange-700 dark:text-orange-300 truncate">
                {row.name ?? "—"}
              </p>
            </div>
          </div>
          <p className="text-[12px] text-text-muted truncate">
            {row.email ?? row.existingCustomerEmail ?? "No email"}
          </p>
        </div>

        {/* Decision buttons */}
        <div className="flex items-center gap-1.5 pt-1 shrink-0">
          <DecisionButton
            active={isKeep}
            onClick={() =>
              onDecisionChange({
                action: "merge_keep_name",
                targetCustomerId: row.existingCustomerId!,
              })
            }
            icon={<Check className="h-3.5 w-3.5" />}
            label="Keep"
            activeColor="bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-300 dark:border-emerald-700"
          />
          <DecisionButton
            active={isUpdate}
            onClick={() =>
              onDecisionChange({
                action: "merge_update_name",
                targetCustomerId: row.existingCustomerId!,
              })
            }
            icon={<Pencil className="h-3.5 w-3.5" />}
            label="Update"
            activeColor="bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/50 dark:text-orange-300 dark:border-orange-700"
          />
          <DecisionButton
            active={isSkipped}
            onClick={() => onDecisionChange({ action: "skip" })}
            icon={<SkipForward className="h-3.5 w-3.5" />}
            label="Skip"
            activeColor="bg-surface-muted text-text-secondary border-border-default"
          />
        </div>
      </div>
    </div>
  );
}

function UncertainMatchRow({
  row,
  decision,
  onDecisionChange,
  onPeekCustomer,
}: {
  row: StitchPreviewRow;
  decision: StitchDecision;
  onDecisionChange: (d: StitchDecision) => void;
  onPeekCustomer: (id: string) => void;
}) {
  const hasMultipleCandidates = row.candidates.length > 1;

  if (hasMultipleCandidates) {
    return (
      <MultiCandidateRow
        row={row}
        decision={decision}
        onDecisionChange={onDecisionChange}
        onPeekCustomer={onPeekCustomer}
      />
    );
  }

  return (
    <SingleCandidateRow
      row={row}
      decision={decision}
      onDecisionChange={onDecisionChange}
      onPeekCustomer={onPeekCustomer}
    />
  );
}

function SingleCandidateRow({
  row,
  decision,
  onDecisionChange,
  onPeekCustomer,
}: {
  row: StitchPreviewRow;
  decision: StitchDecision;
  onDecisionChange: (d: StitchDecision) => void;
  onPeekCustomer: (id: string) => void;
}) {
  const [showRaw, setShowRaw] = useState(false);

  return (
    <div className="px-5 py-4">
      <div className="flex items-start gap-4">
        {/* CSV row info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-[11px] text-amber-500 dark:text-amber-400">
              Row {row.rowIndex}
            </span>
            <MatchBadge category={row.category} />
            {row.rawRow && (
              <button
                type="button"
                onClick={() => setShowRaw(!showRaw)}
                className="flex items-center gap-1 text-[10px] text-text-muted hover:text-text-secondary transition-colors"
              >
                {showRaw ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
                CSV data
              </button>
            )}
          </div>
          <p className="text-[13px] font-medium text-text-primary truncate">
            {row.name ?? "—"}
          </p>
          <p className="text-[12px] text-text-muted truncate">
            {row.email ?? "No email"}
          </p>
          {row.phone && (
            <p className="text-[11px] text-text-muted truncate">
              {row.phone}
            </p>
          )}
        </div>

        {/* Arrow */}
        <div className="flex items-center pt-4 text-text-muted">
          <span className="text-[12px]">&harr;</span>
        </div>

        {/* Existing customer */}
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-text-muted mb-1">Existing customer</p>
          <div className="flex items-center gap-1.5">
            <p className="text-[13px] font-medium text-text-primary truncate">
              {row.existingCustomerName ?? "—"}
            </p>
            {row.existingCustomerId && (
              <button
                type="button"
                onClick={() => onPeekCustomer(row.existingCustomerId!)}
                className="flex items-center gap-1 shrink-0 rounded-md border border-border-muted px-1.5 py-0.5 text-[10px] text-text-muted hover:text-text-secondary hover:border-border-default transition-colors"
              >
                <Eye className="h-3 w-3" />
                View
              </button>
            )}
          </div>
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
            activeColor="bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-300 dark:border-emerald-700"
          />
          <DecisionButton
            active={decision.action === "create_new"}
            onClick={() => onDecisionChange({ action: "create_new" })}
            icon={<Plus className="h-3.5 w-3.5" />}
            label="New"
            activeColor="bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/50 dark:text-blue-300 dark:border-blue-700"
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

      {/* Expandable raw CSV row */}
      {showRaw && row.rawRow && <RawRowDetail rawRow={row.rawRow} />}
    </div>
  );
}

function MultiCandidateRow({
  row,
  decision,
  onDecisionChange,
  onPeekCustomer,
}: {
  row: StitchPreviewRow;
  decision: StitchDecision;
  onDecisionChange: (d: StitchDecision) => void;
  onPeekCustomer: (id: string) => void;
}) {
  const [showRaw, setShowRaw] = useState(false);

  return (
    <div className="px-5 py-4">
      {/* CSV row header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="font-mono text-[11px] text-amber-500 dark:text-amber-400">
          Row {row.rowIndex}
        </span>
        <MatchBadge category={row.category} />
        <span className="text-[12px] text-text-secondary font-medium">
          {row.name ?? "—"}
        </span>
        <span className="text-[12px] text-text-muted">
          {row.email ?? "No email"}
        </span>
        {row.phone && (
          <span className="text-[11px] text-text-muted">
            {row.phone}
          </span>
        )}
        {row.rawRow && (
          <button
            type="button"
            onClick={() => setShowRaw(!showRaw)}
            className="flex items-center gap-1 text-[10px] text-text-muted hover:text-text-secondary transition-colors"
          >
            {showRaw ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
            CSV data
          </button>
        )}
      </div>

      {/* Expandable raw CSV row */}
      {showRaw && row.rawRow && <RawRowDetail rawRow={row.rawRow} />}

      {/* Candidate list */}
      <div className="ml-4 space-y-1.5 mb-3">
        <p className="text-[11px] font-medium text-text-muted uppercase tracking-wide mb-2">
          {row.candidates.length} possible matches
        </p>
        {row.candidates.map((candidate) => (
          <CandidateOption
            key={candidate.customerId}
            candidate={candidate}
            selected={
              decision.action === "merge" &&
              decision.targetCustomerId === candidate.customerId
            }
            onSelect={() =>
              onDecisionChange({
                action: "merge",
                targetCustomerId: candidate.customerId,
              })
            }
            onPeek={() => onPeekCustomer(candidate.customerId)}
          />
        ))}
      </div>

      {/* Bottom actions */}
      <div className="ml-4 flex items-center gap-1.5">
        <DecisionButton
          active={decision.action === "create_new"}
          onClick={() => onDecisionChange({ action: "create_new" })}
          icon={<Plus className="h-3.5 w-3.5" />}
          label="Create New"
          activeColor="bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/50 dark:text-blue-300 dark:border-blue-700"
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

function CandidateOption({
  candidate,
  selected,
  onSelect,
  onPeek,
}: {
  candidate: StitchCandidate;
  selected: boolean;
  onSelect: () => void;
  onPeek: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border px-3 py-2 transition-all cursor-pointer",
        selected
          ? "border-emerald-300 bg-emerald-50/50 dark:border-emerald-700 dark:bg-emerald-950/30"
          : "border-border-muted bg-surface hover:border-border-default hover:bg-surface-elevated/50"
      )}
      onClick={onSelect}
    >
      {/* Radio indicator */}
      <div
        className={cn(
          "h-3.5 w-3.5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
          selected
            ? "border-emerald-500 bg-emerald-500"
            : "border-border-default bg-surface"
        )}
      >
        {selected && (
          <div className="h-1.5 w-1.5 rounded-full bg-white" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-[12px] font-medium text-text-primary truncate">
            {candidate.customerName ?? "Unknown"}
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPeek();
            }}
            className="flex items-center gap-1 shrink-0 rounded-md border border-border-muted px-1.5 py-0.5 text-[10px] text-text-muted hover:text-text-secondary hover:border-border-default transition-colors"
          >
            <Eye className="h-3 w-3" />
            View
          </button>
        </div>
        <p className="text-[11px] text-text-muted truncate">
          {candidate.customerEmail ?? "No email"}
          {candidate.customerPhone ? ` · ${candidate.customerPhone}` : ""}
        </p>
      </div>

      <CandidateMatchBadge matchedBy={candidate.matchedBy} />
    </div>
  );
}

function CandidateMatchBadge({ matchedBy }: { matchedBy: "phone" | "name" }) {
  if (matchedBy === "phone") {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
        Phone
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
      Name
    </span>
  );
}

function NewCustomerRow({
  row,
  decision,
  onDecisionChange,
  onPeekCustomer,
}: {
  row: StitchPreviewRow;
  decision: StitchDecision | undefined;
  onDecisionChange: (d: StitchDecision) => void;
  onPeekCustomer: (id: string) => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const linkedCustomer = decision?.action === "merge" ? decision : null;

  return (
    <div className="flex items-center gap-4 px-5 py-2.5 text-[12px]">
      <span className="font-mono text-text-muted w-12">
        Row {row.rowIndex}
      </span>
      <span className="text-text-secondary min-w-[140px] truncate">
        {row.name ?? "—"}
      </span>
      <span className="text-text-muted min-w-[120px] truncate">
        {row.email ?? "—"}
      </span>

      {linkedCustomer ? (
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-emerald-600 dark:text-emerald-400 text-[11px] font-medium">
            Linked
          </span>
          <button
            type="button"
            onClick={() => onDecisionChange({ action: "create_new" })}
            className="text-text-muted hover:text-text-secondary transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="relative ml-auto">
          <button
            type="button"
            onClick={() => setSearchOpen(!searchOpen)}
            className="flex items-center gap-1 text-[11px] text-text-muted hover:text-text-secondary border border-border-muted rounded-md px-2 py-1 transition-colors hover:border-border-default"
          >
            <Search className="h-3 w-3" />
            Link to existing
          </button>
          {searchOpen && (
            <CustomerSearchPopover
              onSelect={(customer) => {
                onDecisionChange({
                  action: "merge",
                  targetCustomerId: customer.id,
                });
                setSearchOpen(false);
              }}
              onPeek={onPeekCustomer}
              onClose={() => setSearchOpen(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function CustomerSearchPopover({
  onSelect,
  onPeek,
  onClose,
}: {
  onSelect: (customer: { id: string; full_name: string | null; email: string | null; phone: string | null }) => void;
  onPeek: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; full_name: string | null; email: string | null; phone: string | null }[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  const handleSearch = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (!value.trim()) {
        setResults([]);
        return;
      }
      debounceRef.current = setTimeout(async () => {
        setLoading(true);
        try {
          const data = await searchCustomers(value);
          setResults(data);
        } catch {
          setResults([]);
        } finally {
          setLoading(false);
        }
      }, 300);
    },
    []
  );

  return (
    <div
      ref={popoverRef}
      className="absolute right-0 top-full mt-1 w-72 rounded-lg border border-border-default bg-surface shadow-lg z-50"
    >
      <div className="p-2 border-b border-border-muted">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search customers..."
            className="w-full rounded-md border border-border-muted bg-surface-elevated pl-7 pr-3 py-1.5 text-[12px] text-text-primary placeholder:text-text-muted outline-none focus:border-border-default"
          />
        </div>
      </div>
      <div className="max-h-48 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 text-text-muted animate-spin" />
          </div>
        )}
        {!loading && results.length === 0 && query.trim() && (
          <p className="text-center text-[11px] text-text-muted py-4">
            No customers found
          </p>
        )}
        {!loading && results.length === 0 && !query.trim() && (
          <p className="text-center text-[11px] text-text-muted py-4">
            Type to search by name, email, or phone
          </p>
        )}
        {results.map((customer) => (
          <button
            key={customer.id}
            type="button"
            onClick={() => onSelect(customer)}
            className="w-full text-left px-3 py-2 hover:bg-surface-elevated transition-colors flex items-center justify-between group"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-medium text-text-primary truncate">
                {customer.full_name ?? "Unknown"}
              </p>
              <p className="text-[11px] text-text-muted truncate">
                {customer.email ?? "No email"}
                {customer.phone ? ` · ${customer.phone}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPeek(customer.id);
              }}
              className="text-[10px] text-text-muted hover:text-text-secondary opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2"
            >
              Peek
            </button>
          </button>
        ))}
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

function RawRowDetail({ rawRow }: { rawRow: Record<string, string> }) {
  const entries = Object.entries(rawRow);

  return (
    <div className="mt-2 mb-1 rounded-lg border border-border-muted overflow-hidden">
      <div className="overflow-x-auto pb-2">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-surface-muted/50 dark:bg-surface-muted/30">
              {entries.map(([key]) => (
                <th
                  key={key}
                  className="px-3 py-1.5 text-[10px] font-semibold text-text-muted uppercase tracking-wide whitespace-nowrap border-b border-border-muted"
                >
                  {key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="bg-surface">
              {entries.map(([key, value]) => (
                <td
                  key={key}
                  className="px-3 py-2 text-[11px] text-text-secondary whitespace-nowrap border-b border-border-muted"
                >
                  {value || <span className="text-text-muted">—</span>}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MatchBadge({ category }: { category: string }) {
  const config: Record<string, { label: string; color: string }> = {
    external_id: { label: "ID", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
    email: { label: "Email", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
    email_name_mismatch: { label: "Email (Name Differs)", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
    phone: { label: "Phone", color: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" },
    name_match: { label: "Name", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
    name_conflict: { label: "Name", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
    enrichment: { label: "Match + Enrich", color: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300" },
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
  color: "emerald" | "blue" | "amber" | "slate";
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const borderColor =
    color === "emerald"
      ? "border-emerald-200 dark:border-emerald-800"
      : color === "blue"
        ? "border-blue-200 dark:border-blue-800"
        : color === "amber"
          ? "border-amber-200 dark:border-amber-800"
          : "border-border-default";

  const headerBg =
    color === "emerald"
      ? "bg-emerald-50/30 dark:bg-emerald-950/40"
      : color === "blue"
        ? "bg-blue-50/30 dark:bg-blue-950/40"
        : color === "amber"
          ? "bg-amber-50/30 dark:bg-amber-950/40"
          : "bg-surface-elevated/30";

  return (
    <div className={cn("rounded-xl border", borderColor)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "w-full flex items-center justify-between px-5 py-3 text-left transition-colors hover:bg-surface-elevated/50 rounded-t-[11px]",
          !open && "rounded-b-[11px]",
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
