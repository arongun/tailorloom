"use client";

import { useState, useCallback } from "react";
import { ArrowLeft, ArrowRight, Upload, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { SourceSelector } from "./components/source-selector";
import { UploadZone } from "./components/upload-zone";
import { ColumnMapper } from "./components/column-mapper";
import { MappingPreview } from "./components/mapping-preview";
import { ImportProgress } from "./components/import-progress";

import { parseCSVContent } from "@/lib/csv/parser";
import {
  generateMappingSuggestions,
  suggestionsToMapping,
} from "@/lib/csv/heuristic-mapper";
import { getSchema } from "@/lib/csv/schemas";
import { previewCSV, uploadCSV } from "@/lib/actions/import";
import { saveMappingTemplate, getSavedMappings } from "@/lib/actions/mappings";

import type {
  SourceType,
  MappingSuggestion,
  PreviewResult,
  ImportResult,
  SavedMapping,
} from "@/lib/types";

type Step = 1 | 2 | 3 | 4 | 5;

const STEP_LABELS: Record<Step, string> = {
  1: "Select Source",
  2: "Upload File",
  3: "Map Columns",
  4: "Preview",
  5: "Import",
};

export default function UploadPage() {
  const [step, setStep] = useState<Step>(1);

  // Step 1
  const [source, setSource] = useState<SourceType | null>(null);

  // Step 2
  const [file, setFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [headers, setHeaders] = useState<string[]>([]);

  // Step 3
  const [suggestions, setSuggestions] = useState<MappingSuggestion[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [savedMappings, setSavedMappings] = useState<SavedMapping[]>([]);

  // Step 4
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Step 5
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // -- Handlers --

  const handleSourceSelect = (s: SourceType) => {
    setSource(s);
  };

  const handleFileSelected = useCallback(
    async (f: File, content: string) => {
      setFile(f);
      setFileContent(content);

      // Parse headers client-side
      const parsed = parseCSVContent(content);
      setHeaders(parsed.headers);

      if (!source) return;

      // Generate mapping suggestions
      const schema = getSchema(source);
      if (!schema) return;

      const suggs = generateMappingSuggestions(
        parsed.headers,
        schema,
        parsed.sampleRows
      );
      setSuggestions(suggs);
      setMapping(suggestionsToMapping(suggs));

      // Load saved mappings
      try {
        const saved = await getSavedMappings(source);
        setSavedMappings(saved);
      } catch {
        // Non-critical
      }
    },
    [source]
  );

  const handleFileClear = () => {
    setFile(null);
    setFileContent("");
    setHeaders([]);
    setSuggestions([]);
    setMapping({});
  };

  const handleMappingChange = (newMapping: Record<string, string>) => {
    setMapping(newMapping);
  };

  const handleSaveTemplate = async (name: string) => {
    if (!source) return;
    try {
      await saveMappingTemplate(source, name, mapping, headers);
      toast.success("Mapping template saved");
      const saved = await getSavedMappings(source);
      setSavedMappings(saved);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save template"
      );
    }
  };

  const handlePreview = async () => {
    if (!source || !fileContent) return;

    setPreviewLoading(true);
    try {
      const result = await previewCSV({
        source,
        content: fileContent,
        mapping,
      });
      setPreview(result.preview);
      setStep(4);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Preview failed"
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleImport = async () => {
    if (!source || !fileContent || !file) return;

    setIsImporting(true);
    setStep(5);

    try {
      const result = await uploadCSV({
        source,
        fileName: file.name,
        content: fileContent,
        mapping,
      });
      setImportResult(result);

      if (result.errorRows === 0) {
        toast.success(`${result.importedRows} rows imported successfully`);
      } else {
        toast.warning(
          `${result.importedRows} imported, ${result.errorRows} errors`
        );
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Import failed"
      );
    } finally {
      setIsImporting(false);
    }
  };

  const handleStartOver = () => {
    setStep(1);
    setSource(null);
    setFile(null);
    setFileContent("");
    setHeaders([]);
    setSuggestions([]);
    setMapping({});
    setSavedMappings([]);
    setPreview(null);
    setImportResult(null);
  };

  // -- Navigation --

  const canGoNext = () => {
    switch (step) {
      case 1:
        return !!source;
      case 2:
        return !!file;
      case 3:
        return Object.keys(mapping).length > 0;
      case 4:
        return !!preview && preview.validRows > 0;
      default:
        return false;
    }
  };

  const handleNext = async () => {
    if (step === 3) {
      await handlePreview();
      return;
    }
    if (step === 4) {
      await handleImport();
      return;
    }
    if (step < 5) {
      setStep((step + 1) as Step);
    }
  };

  const handleBack = () => {
    if (step > 1 && step < 5) {
      setStep((step - 1) as Step);
    }
  };

  const schema = source ? getSchema(source) : null;

  return (
    <div className="p-8 max-w-[860px]">
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
          {([1, 2, 3, 4, 5] as Step[]).map((s) => (
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
                  "ml-2 text-[12px] font-medium transition-colors hidden sm:inline",
                  s === step
                    ? "text-slate-900"
                    : s < step
                      ? "text-slate-500"
                      : "text-slate-400"
                )}
              >
                {STEP_LABELS[s]}
              </span>
              {s < 5 && (
                <div
                  className={cn(
                    "mx-3 h-px w-8",
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
            <SourceSelector value={source} onChange={handleSourceSelect} />
          </div>
        )}

        {step === 2 && (
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
            </p>
            <UploadZone
              onFileSelected={handleFileSelected}
              file={file}
              onClear={handleFileClear}
            />
          </div>
        )}

        {step === 3 && schema && (
          <div className="space-y-4">
            <p className="text-[13px] text-slate-500 mb-4">
              Map your CSV columns to {schema.label} fields. Auto-mapped columns
              are pre-filled — adjust as needed.
            </p>
            <ColumnMapper
              suggestions={suggestions}
              schema={schema}
              headers={headers}
              savedMappings={savedMappings}
              onMappingChange={handleMappingChange}
              onSaveTemplate={handleSaveTemplate}
            />
          </div>
        )}

        {step === 4 && preview && schema && (
          <div className="space-y-4">
            <p className="text-[13px] text-slate-500 mb-4">
              Review your mapped data before importing
            </p>
            <MappingPreview preview={preview} schema={schema} />
          </div>
        )}

        {step === 5 && (
          <ImportProgress result={importResult} isImporting={isImporting} />
        )}
      </div>

      {/* Navigation buttons */}
      <div className="mt-8 flex items-center justify-between animate-fade-in-up stagger-4">
        <div>
          {step > 1 && step < 5 && (
            <Button
              variant="ghost"
              onClick={handleBack}
              className="text-[13px] text-slate-500 hover:text-slate-700"
            >
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back
            </Button>
          )}
          {step === 5 && !isImporting && (
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
          {step < 5 && (
            <Button
              onClick={handleNext}
              disabled={!canGoNext() || previewLoading}
              className="text-[13px]"
            >
              {previewLoading ? (
                "Validating..."
              ) : step === 3 ? (
                <>
                  Preview
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </>
              ) : step === 4 ? (
                <>
                  <Upload className="mr-1.5 h-4 w-4" />
                  Import {preview?.validRows ?? 0} rows
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
