"use client";

import { useState, useCallback, useRef } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Upload,
  RotateCcw,
  CheckCircle2,
  XCircle,
  SkipForward,
  FileText,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

import { SourceSelector } from "./components/source-selector";
import { UploadMapper } from "./components/upload-mapper";

import { previewCSV, uploadCSV } from "@/lib/actions/import";
import { saveMappingTemplate } from "@/lib/actions/mappings";

import type {
  SourceType,
  ImportResult,
  SavedMapping,
  PreviewResult,
} from "@/lib/types";

type Step = 1 | 2 | 3;

const STEP_LABELS: Record<Step, string> = {
  1: "Select Source",
  2: "Upload & Map",
  3: "Import",
};

export default function UploadPage() {
  const [step, setStep] = useState<Step>(1);

  // Step 1
  const [source, setSource] = useState<SourceType | null>(null);

  // Step 2 — data from UploadMapper
  const mapperData = useRef<{
    file: File;
    content: string;
    mapping: Record<string, string>;
    headers: string[];
    totalRows: number;
    savedMappings: SavedMapping[];
  } | null>(null);

  // Step 2 — preview validation
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Step 3
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // ─── Handlers ──────────────────────────────────────────

  const handleMapperReady = useCallback(
    (data: {
      file: File;
      content: string;
      mapping: Record<string, string>;
      headers: string[];
      totalRows: number;
      savedMappings: SavedMapping[];
    }) => {
      mapperData.current = data;
      // Clear stale preview when mapping changes
      setPreview(null);
    },
    []
  );

  const handleSaveTemplate = useCallback(
    async (
      name: string,
      mapping: Record<string, string>,
      headers: string[]
    ) => {
      if (!source) return;
      try {
        await saveMappingTemplate(source, name, mapping, headers);
        toast.success("Mapping template saved");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to save template"
        );
      }
    },
    [source]
  );

  const handleValidateAndImport = async () => {
    const data = mapperData.current;
    if (!source || !data) return;

    // First validate via preview
    setPreviewLoading(true);
    try {
      const result = await previewCSV({
        source,
        content: data.content,
        mapping: data.mapping,
      });
      setPreview(result.preview);

      if (result.preview.validRows === 0) {
        toast.error("No valid rows to import. Check your column mapping.");
        setPreviewLoading(false);
        return;
      }

      // Proceed to import
      setStep(3);
      setPreviewLoading(false);
      setIsImporting(true);

      const importRes = await uploadCSV({
        source,
        fileName: data.file.name,
        content: data.content,
        mapping: data.mapping,
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
      // Stay on step 2 if preview fails, go back from 3 if import fails
      if (step === 3) {
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
              message:
                err instanceof Error ? err.message : "Import failed",
            },
          ],
        });
      }
    } finally {
      setPreviewLoading(false);
      setIsImporting(false);
    }
  };

  const handleStartOver = () => {
    setStep(1);
    setSource(null);
    mapperData.current = null;
    setPreview(null);
    setImportResult(null);
  };

  // ─── Navigation ────────────────────────────────────────

  const canGoNext = () => {
    switch (step) {
      case 1:
        return !!source;
      case 2:
        return !!mapperData.current && Object.keys(mapperData.current.mapping).length > 0;
      default:
        return false;
    }
  };

  const handleNext = async () => {
    if (step === 1) {
      setStep(2);
      return;
    }
    if (step === 2) {
      await handleValidateAndImport();
      return;
    }
  };

  const handleBack = () => {
    if (step === 2) {
      setStep(1);
      mapperData.current = null;
      setPreview(null);
    }
  };

  // ─── Render ────────────────────────────────────────────

  return (
    <div className="p-8 max-w-[960px]">
      {/* Header */}
      <div className="mb-8 animate-fade-in">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-slate-900">
          Upload Data
        </h1>
        <p className="mt-1 text-[13px] text-slate-500">
          Import CSV files from Stripe, Calendly, or PassLine
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
                    ? "bg-slate-900 text-white"
                    : s < step
                      ? "bg-slate-200 text-slate-600"
                      : "bg-slate-100 text-slate-400"
                )}
              >
                {s}
              </div>
              <span
                className={cn(
                  "ml-2 text-[12px] font-medium transition-colors",
                  s === step
                    ? "text-slate-900"
                    : s < step
                      ? "text-slate-500"
                      : "text-slate-400"
                )}
              >
                {STEP_LABELS[s]}
              </span>
              {s < 3 && (
                <div
                  className={cn(
                    "mx-4 h-px w-10",
                    s < step ? "bg-slate-300" : "bg-slate-100"
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
            <p className="text-[13px] text-slate-500 mb-4">
              Choose the data source for your CSV file
            </p>
            <SourceSelector value={source} onChange={setSource} />
          </div>
        )}

        {step === 2 && source && (
          <div className="space-y-4">
            <p className="text-[13px] text-slate-500 mb-4">
              Upload a CSV export from{" "}
              <span className="font-medium text-slate-700">
                {source === "stripe"
                  ? "Stripe"
                  : source === "calendly"
                    ? "Calendly"
                    : "PassLine"}
              </span>
              , then map columns to the right fields
            </p>
            <UploadMapper
              source={source}
              onReady={handleMapperReady}
              onSaveTemplate={handleSaveTemplate}
            />
          </div>
        )}

        {step === 3 && (
          <ImportResultView
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
              onClick={handleBack}
              className="text-[13px] text-slate-500 hover:text-slate-700"
            >
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back
            </Button>
          )}
          {step === 3 && !isImporting && (
            <Button
              variant="ghost"
              onClick={handleStartOver}
              className="text-[13px] text-slate-500 hover:text-slate-700"
            >
              <RotateCcw className="mr-1.5 h-4 w-4" />
              Start over
            </Button>
          )}
        </div>
        <div>
          {step < 3 && (
            <Button
              onClick={handleNext}
              disabled={!canGoNext() || previewLoading}
              className="text-[13px]"
            >
              {previewLoading ? (
                "Validating..."
              ) : step === 1 ? (
                <>
                  Continue
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </>
              ) : (
                <>
                  <Upload className="mr-1.5 h-4 w-4" />
                  Import data
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Import result sub-component ─────────────────────────

function ImportResultView({
  result,
  isImporting,
}: {
  result: ImportResult | null;
  isImporting: boolean;
}) {
  if (isImporting) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900">
          <Loader2 className="h-6 w-6 text-white animate-spin" />
        </div>
        <p className="mt-5 text-[14px] font-medium text-slate-900">
          Importing data...
        </p>
        <p className="mt-1 text-[12px] text-slate-400">
          Mapping columns, stitching identities, and writing records
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
            <p className="mt-4 text-[16px] font-semibold text-slate-900">
              Import complete
            </p>
            <p className="mt-1 text-[13px] text-slate-500">
              All {result.importedRows} rows imported successfully
            </p>
          </>
        ) : isPartial ? (
          <>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100">
              <FileText className="h-7 w-7 text-amber-600" />
            </div>
            <p className="mt-4 text-[16px] font-semibold text-slate-900">
              Import completed with issues
            </p>
            <p className="mt-1 text-[13px] text-slate-500">
              {result.importedRows} imported, {result.errorRows} failed,{" "}
              {result.skippedRows} skipped
            </p>
          </>
        ) : (
          <>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100">
              <XCircle className="h-7 w-7 text-rose-600" />
            </div>
            <p className="mt-4 text-[16px] font-semibold text-slate-900">
              Import failed
            </p>
            <p className="mt-1 text-[13px] text-slate-500">
              No rows could be imported. Check your mapping and data.
            </p>
          </>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard
          label="Total"
          value={result.totalRows}
          icon={<FileText className="h-4 w-4 text-slate-500" />}
          color="bg-white border-slate-200"
        />
        <StatCard
          label="Imported"
          value={result.importedRows}
          icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
          color="bg-emerald-50/50 border-emerald-200"
        />
        <StatCard
          label="Skipped"
          value={result.skippedRows}
          icon={<SkipForward className="h-4 w-4 text-slate-400" />}
          color="bg-white border-slate-200"
        />
        <StatCard
          label="Errors"
          value={result.errorRows}
          icon={<XCircle className="h-4 w-4 text-rose-500" />}
          color={
            result.errorRows > 0
              ? "bg-rose-50/50 border-rose-200"
              : "bg-white border-slate-200"
          }
        />
      </div>

      {/* Errors */}
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
                  <span className="mx-1.5 text-rose-300">—</span>
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

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className={`rounded-lg border p-4 ${color}`}>
      <div className="flex items-center gap-2 mb-2">{icon}</div>
      <p className="text-[18px] font-semibold text-slate-900 tabular-nums">
        {value}
      </p>
      <p className="text-[11px] text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}
