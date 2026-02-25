"use client";

import { useState, useCallback, useRef } from "react";
import {
  Upload,
  RotateCcw,
  CheckCircle2,
  XCircle,
  SkipForward,
  FileText,
  Loader2,
  ArrowLeft,
  ArrowRight,
  Link2,
  Mail,
  UserPlus,
  Copy,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

import { UploadMapper } from "./components/upload-mapper";
import { StitchPreview } from "./components/stitch-preview";

import { previewCSV, uploadCSV, previewStitching } from "@/lib/actions/import";
import { saveMappingTemplate } from "@/lib/actions/mappings";

import type {
  SourceType,
  ImportResultDetailed,
  StitchPreviewResult,
  StitchDecisions,
} from "@/lib/types";

type Step = 1 | 2 | 3;

const STEP_LABELS: Record<Step, string> = {
  1: "Upload & Map",
  2: "Verify",
  3: "Import",
};

export default function UploadPage() {
  const [step, setStep] = useState<Step>(1);

  // Step 1 — data from UploadMapper
  const mapperData = useRef<{
    source: SourceType;
    file: File;
    content: string;
    mapping: Record<string, string>;
    headers: string[];
    totalRows: number;
  } | null>(null);

  const [isMapperReady, setIsMapperReady] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  // Step 2 — stitch preview
  const [stitchPreview, setStitchPreviewResult] =
    useState<StitchPreviewResult | null>(null);
  const [stitchDecisions, setStitchDecisions] = useState<StitchDecisions>({});

  // Step 3
  const [importResult, setImportResult] =
    useState<ImportResultDetailed | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // ─── Handlers ──────────────────────────────────────────

  const handleMapperReady = useCallback(
    (data: {
      source: SourceType;
      file: File;
      content: string;
      mapping: Record<string, string>;
      headers: string[];
      totalRows: number;
    }) => {
      mapperData.current = data;
      setIsMapperReady(true);
    },
    []
  );

  const handleMapperClear = useCallback(() => {
    mapperData.current = null;
    setIsMapperReady(false);
  }, []);

  const handleSaveTemplate = useCallback(
    async (
      source: SourceType,
      name: string,
      mapping: Record<string, string>,
      headers: string[]
    ) => {
      try {
        await saveMappingTemplate(source, name, mapping, headers);
        toast.success("Mapping template saved");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to save template"
        );
      }
    },
    []
  );

  /** Step 1 → Step 2: validate CSV then run stitch preview */
  const handleContinueToVerify = async () => {
    const data = mapperData.current;
    if (!data) return;

    setIsVerifying(true);
    try {
      // Validate via preview
      const result = await previewCSV({
        source: data.source,
        content: data.content,
        mapping: data.mapping,
      });
      if (result.preview.validRows === 0) {
        toast.error("No valid rows to import. Check your column mapping.");
        setIsVerifying(false);
        return;
      }

      // Run stitch preview
      const stitchResult = await previewStitching({
        source: data.source,
        content: data.content,
        mapping: data.mapping,
      });

      // Initialize default decisions: all uncertain rows → "create_new"
      const defaults: StitchDecisions = {};
      for (const row of stitchResult.uncertainRows) {
        defaults[row.rowIndex] = { action: "create_new" };
      }

      setStitchPreviewResult(stitchResult);
      setStitchDecisions(defaults);
      setStep(2);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to verify data"
      );
    } finally {
      setIsVerifying(false);
    }
  };

  /** Step 2 → Step 3: run import with decisions */
  const handleImport = async () => {
    const data = mapperData.current;
    if (!data) return;

    setStep(3);
    setIsImporting(true);

    try {
      const importRes = await uploadCSV({
        source: data.source,
        fileName: data.file.name,
        content: data.content,
        mapping: data.mapping,
        stitchDecisions,
      });
      setImportResult(importRes);

      if (importRes.errorRows === 0) {
        toast.success(`${importRes.importedRows} rows imported successfully`);
      } else {
        toast.warning(
          `${importRes.importedRows} imported, ${importRes.errorRows} errors`
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
      setImportResult({
        importId: "",
        totalRows: data.totalRows,
        importedRows: 0,
        skippedRows: 0,
        errorRows: data.totalRows,
        errors: [
          {
            row: 0,
            field: "",
            message: err instanceof Error ? err.message : "Import failed",
          },
        ],
        matchedByExternalId: 0,
        matchedByEmail: 0,
        newCustomersCreated: 0,
        duplicateRowsSkipped: 0,
        userSkippedRows: 0,
        conflictsCreated: 0,
        matchedByPhone: 0,
        enrichedCount: 0,
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleStartOver = () => {
    setStep(1);
    mapperData.current = null;
    setIsMapperReady(false);
    setStitchPreviewResult(null);
    setStitchDecisions({});
    setImportResult(null);
  };

  const canContinue = isMapperReady &&
    !!mapperData.current &&
    Object.keys(mapperData.current.mapping).length > 0;

  // ─── Render ────────────────────────────────────────────

  return (
    <div className="p-8 max-w-[960px]">
      {/* Header */}
      <div className="mb-8 animate-fade-in">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-text-primary">
          Upload Data
        </h1>
        <p className="mt-1 text-[13px] text-text-muted">
          Import CSV files from Stripe, Calendly, PassLine, POS, or WeTravel
        </p>
      </div>

      {/* Step indicator */}
      <div className="mb-8 animate-fade-in-up stagger-2">
        <div className="flex items-center gap-1">
          {([1, 2, 3] as Step[]).map((s) => (
            <div key={s} className="flex items-center">
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold transition-all",
                  s === step
                    ? "bg-surface-active text-text-on-active"
                    : s < step
                      ? "bg-surface-muted text-text-secondary"
                      : "bg-surface-muted text-text-muted"
                )}
              >
                {s < step ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  s
                )}
              </div>
              <span
                className={cn(
                  "ml-2 text-[12px] font-medium transition-colors",
                  s === step
                    ? "text-text-primary"
                    : s < step
                      ? "text-text-muted"
                      : "text-text-muted"
                )}
              >
                {STEP_LABELS[s]}
              </span>
              {s < 3 && (
                <div
                  className={cn(
                    "mx-4 h-px w-10",
                    s < step ? "bg-text-muted" : "bg-surface-muted"
                  )}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step content */}
      <div className="animate-fade-in-up stagger-3">
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-[13px] text-text-muted mb-4">
              Upload a CSV export — the source type is auto-detected from the
              column headers
            </p>
            <UploadMapper
              onReady={handleMapperReady}
              onClear={handleMapperClear}
              onSaveTemplate={handleSaveTemplate}
            />
          </div>
        )}

        {step === 2 && stitchPreview && (
          <div className="space-y-4">
            {stitchPreview.summary.confidentMatches === 0 &&
            stitchPreview.summary.uncertainMatches === 0 &&
            stitchPreview.summary.newCustomers === 0 &&
            stitchPreview.summary.duplicateRows > 0 ? (
              <>
                <div className="flex flex-col items-center text-center py-8">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100">
                    <Copy className="h-7 w-7 text-amber-600" />
                  </div>
                  <p className="mt-4 text-[16px] font-semibold text-text-primary">
                    All rows already imported
                  </p>
                  <p className="mt-1 text-[13px] text-text-muted max-w-sm">
                    Every row in this file matches data that&apos;s already in the
                    system. There&apos;s nothing new to import.
                  </p>
                </div>
                <StitchPreview
                  result={stitchPreview}
                  decisions={stitchDecisions}
                  onDecisionsChange={setStitchDecisions}
                />
              </>
            ) : (
              <>
                <p className="text-[13px] text-text-muted mb-4">
                  Review how rows will be matched to existing customers before
                  importing
                </p>
                <StitchPreview
                  result={stitchPreview}
                  decisions={stitchDecisions}
                  onDecisionsChange={setStitchDecisions}
                />
              </>
            )}
          </div>
        )}

        {step === 3 && (
          <DetailedImportResultView
            result={importResult}
            isImporting={isImporting}
          />
        )}
      </div>

      {/* Navigation */}
      <div className="mt-8 flex items-center justify-between animate-fade-in-up stagger-4">
        <div>
          {step === 2 && (
            <Button
              variant="ghost"
              onClick={() => setStep(1)}
              className="text-[13px] text-text-muted hover:text-text-secondary"
            >
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back
            </Button>
          )}
          {step === 3 && !isImporting && (
            <Button
              variant="ghost"
              onClick={handleStartOver}
              className="text-[13px] text-text-muted hover:text-text-secondary"
            >
              <RotateCcw className="mr-1.5 h-4 w-4" />
              Upload another CSV
            </Button>
          )}
        </div>
        <div>
          {step === 1 && (
            <Button
              onClick={handleContinueToVerify}
              disabled={!canContinue || isVerifying}
              className="text-[13px]"
            >
              {isVerifying ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </>
              )}
            </Button>
          )}
          {step === 2 && stitchPreview && (
            stitchPreview.summary.confidentMatches === 0 &&
            stitchPreview.summary.uncertainMatches === 0 &&
            stitchPreview.summary.newCustomers === 0 ? null : (
              <Button onClick={handleImport} className="text-[13px]">
                <Upload className="mr-1.5 h-4 w-4" />
                Import data
              </Button>
            )
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Detailed Import Result (Step 3) ────────────────────

function DetailedImportResultView({
  result,
  isImporting,
}: {
  result: ImportResultDetailed | null;
  isImporting: boolean;
}) {
  if (isImporting) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-active">
          <Loader2 className="h-6 w-6 text-text-on-active animate-spin" />
        </div>
        <p className="mt-5 text-[14px] font-medium text-text-primary">
          Importing data...
        </p>
        <p className="mt-1 text-[12px] text-text-muted">
          Stitching identities, writing records, detecting conflicts
        </p>
        <div className="mt-6 w-64">
          <Progress value={66} className="h-1.5" />
        </div>
      </div>
    );
  }

  if (!result) return null;

  const isFullSuccess = result.errorRows === 0 && result.importedRows > 0;
  const isPartial = result.importedRows > 0 && result.errorRows > 0;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="flex flex-col items-center text-center py-6">
        {isFullSuccess ? (
          <>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100">
              <CheckCircle2 className="h-7 w-7 text-emerald-600" />
            </div>
            <p className="mt-4 text-[16px] font-semibold text-text-primary">
              Import complete
            </p>
            <p className="mt-1 text-[13px] text-text-muted">
              {result.importedRows} of {result.totalRows} rows imported
              successfully
            </p>
          </>
        ) : isPartial ? (
          <>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100">
              <FileText className="h-7 w-7 text-amber-600" />
            </div>
            <p className="mt-4 text-[16px] font-semibold text-text-primary">
              Import completed with issues
            </p>
            <p className="mt-1 text-[13px] text-text-muted">
              {result.importedRows} imported, {result.errorRows} failed,{" "}
              {result.skippedRows} skipped
            </p>
          </>
        ) : (
          <>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100">
              <XCircle className="h-7 w-7 text-rose-600" />
            </div>
            <p className="mt-4 text-[16px] font-semibold text-text-primary">
              Import failed
            </p>
            <p className="mt-1 text-[13px] text-text-muted">
              No rows could be imported. Check your mapping and data.
            </p>
          </>
        )}
      </div>

      {/* Detailed breakdown */}
      <div className="rounded-xl border border-border-default overflow-hidden">
        <div className="border-b border-border-muted px-5 py-3">
          <p className="text-[13px] font-medium text-text-secondary">
            Import breakdown
          </p>
        </div>
        <div className="divide-y divide-border-muted">
          <BreakdownRow
            icon={<Link2 className="h-4 w-4 text-emerald-500" />}
            label="Matched by External ID"
            value={result.matchedByExternalId}
          />
          <BreakdownRow
            icon={<Mail className="h-4 w-4 text-blue-500" />}
            label="Matched by Email"
            value={result.matchedByEmail}
          />
          <BreakdownRow
            icon={<UserPlus className="h-4 w-4 text-violet-500" />}
            label="New Customers Created"
            value={result.newCustomersCreated}
          />
          <BreakdownRow
            icon={<Copy className="h-4 w-4 text-text-muted" />}
            label="Duplicate Rows Skipped"
            value={result.duplicateRowsSkipped}
          />
          {result.userSkippedRows > 0 && (
            <BreakdownRow
              icon={<SkipForward className="h-4 w-4 text-text-muted" />}
              label="User Skipped"
              value={result.userSkippedRows}
            />
          )}
          {result.conflictsCreated > 0 && (
            <BreakdownRow
              icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
              label="Conflicts Flagged"
              value={result.conflictsCreated}
            />
          )}
          {result.errorRows > 0 && (
            <BreakdownRow
              icon={<XCircle className="h-4 w-4 text-rose-500" />}
              label="Errors"
              value={result.errorRows}
            />
          )}
          <div className="flex items-center justify-between px-5 py-3 bg-surface-elevated/50">
            <span className="text-[13px] font-medium text-text-primary">
              Total Imported
            </span>
            <span className="text-[13px] font-semibold text-text-primary tabular-nums">
              {result.importedRows} / {result.totalRows}
            </span>
          </div>
        </div>
      </div>

      {/* Errors list */}
      {result.errors.length > 0 && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/30 overflow-hidden">
          <div className="border-b border-rose-100 px-5 py-3">
            <p className="text-[12px] font-medium text-rose-700">
              Errors ({result.errors.length})
            </p>
          </div>
          <div className="max-h-[200px] overflow-y-auto divide-y divide-rose-100">
            {result.errors.slice(0, 20).map((err, i) => (
              <div key={i} className="px-5 py-2.5">
                <p className="text-[12px] text-rose-700">
                  <span className="font-mono text-rose-400">
                    Row {err.row}
                  </span>
                  {err.field && (
                    <span className="text-rose-400">
                      {" "}
                      &middot; {err.field}
                    </span>
                  )}
                  <span className="mx-1.5 text-rose-300">&mdash;</span>
                  {err.message}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BreakdownRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between px-5 py-2.5">
      <div className="flex items-center gap-2.5">
        {icon}
        <span className="text-[13px] text-text-secondary">{label}</span>
      </div>
      <span className="text-[13px] font-medium text-text-primary tabular-nums">
        {value}
      </span>
    </div>
  );
}
