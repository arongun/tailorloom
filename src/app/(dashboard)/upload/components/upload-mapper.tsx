"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import {
  Upload,
  FileText,
  X,
  ChevronDown,
  Check,
  AlertCircle,
  Save,
  FolderOpen,
  Minus,
  CreditCard,
  Calendar,
  Ticket,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { parseCSVContent } from "@/lib/csv/parser";
import {
  generateMappingSuggestions,
  suggestionsToMapping,
} from "@/lib/csv/heuristic-mapper";
import { getSchema } from "@/lib/csv/schemas";
import { detectSource, isConfidentDetection } from "@/lib/csv/detect-source";
import { getSavedMappings } from "@/lib/actions/mappings";
import type {
  SourceType,
  SourceSchema,
  MappingSuggestion,
  SavedMapping,
} from "@/lib/types";
import type { DetectionResult } from "@/lib/csv/detect-source";

// ─── Types ───────────────────────────────────────────────────

interface UploadMapperProps {
  onReady: (data: {
    source: SourceType;
    file: File;
    content: string;
    mapping: Record<string, string>;
    headers: string[];
    totalRows: number;
  }) => void;
  onClear: () => void;
  onSaveTemplate: (
    source: SourceType,
    name: string,
    mapping: Record<string, string>,
    headers: string[]
  ) => void;
}

interface ColumnDropdownProps {
  csvHeader: string;
  currentField: string | null;
  confidence: number;
  schema: SourceSchema;
  usedFields: Set<string>;
  onSelect: (csvHeader: string, schemaField: string | null) => void;
}

// ─── Source picker (fallback) ────────────────────────────────

const SOURCE_META: Record<
  string,
  { label: string; icon: React.ElementType; color: string }
> = {
  stripe: { label: "Stripe", icon: CreditCard, color: "text-violet-500" },
  calendly: { label: "Calendly", icon: Calendar, color: "text-blue-500" },
  passline: { label: "PassLine", icon: Ticket, color: "text-emerald-500" },
};

function SourcePicker({
  results,
  onSelect,
}: {
  results: DetectionResult[];
  onSelect: (source: SourceType) => void;
}) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
        <p className="text-[12px] font-medium text-amber-800">
          Couldn&apos;t confidently detect the source type. Which is it?
        </p>
      </div>
      <div className="flex gap-2">
        {results.map((r) => {
          const meta = SOURCE_META[r.source];
          const Icon = meta.icon;
          return (
            <button
              key={r.source}
              onClick={() => onSelect(r.source)}
              className="flex items-center gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2 text-[12px] font-medium text-slate-700 hover:border-slate-300 hover:shadow-sm transition-all"
            >
              <Icon className={cn("h-4 w-4", meta.color)} strokeWidth={1.8} />
              {meta.label}
              <span className="text-[10px] text-slate-400">
                {Math.round(r.confidence * 100)}%
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Confidence indicator ────────────────────────────────────

function ConfidenceDot({ confidence }: { confidence: number }) {
  if (confidence === 0) return null;
  const color =
    confidence >= 0.8
      ? "bg-emerald-400"
      : confidence >= 0.5
        ? "bg-amber-400"
        : "bg-rose-400";
  return (
    <span className={cn("inline-block h-1.5 w-1.5 rounded-full", color)} />
  );
}

// ─── Column header dropdown ──────────────────────────────────

function ColumnDropdown({
  csvHeader,
  currentField,
  confidence,
  schema,
  usedFields,
  onSelect,
}: ColumnDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const fieldDef = schema.fields.find((f) => f.key === currentField);
  const isMapped = !!currentField;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-1.5 w-full text-left px-3 py-2 rounded-md transition-all text-[11px] font-semibold uppercase tracking-wider",
          isMapped
            ? "text-slate-700 hover:bg-slate-100"
            : "text-slate-400 hover:bg-slate-50 italic"
        )}
      >
        <ConfidenceDot confidence={confidence} />
        <span className="truncate">
          {fieldDef ? fieldDef.label : "Skip"}
        </span>
        {fieldDef?.required && (
          <span className="text-rose-400 text-[9px] not-italic">*</span>
        )}
        <ChevronDown className="ml-auto h-3 w-3 shrink-0 opacity-40" />
      </button>

      <div className="px-3 pb-1.5">
        <span className="text-[10px] font-mono text-slate-400 truncate block">
          {csvHeader}
        </span>
      </div>

      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-56 rounded-lg border border-slate-200 bg-white shadow-lg shadow-slate-200/50 py-1 animate-fade-in">
          <button
            onClick={() => {
              onSelect(csvHeader, null);
              setOpen(false);
            }}
            className={cn(
              "flex items-center gap-2 w-full px-3 py-2 text-[12px] text-left transition-colors",
              !currentField
                ? "bg-slate-50 text-slate-700 font-medium"
                : "text-slate-500 hover:bg-slate-50"
            )}
          >
            <Minus className="h-3.5 w-3.5 text-slate-400" />
            <span className="italic">Skip this column</span>
            {!currentField && (
              <Check className="ml-auto h-3.5 w-3.5 text-slate-500" />
            )}
          </button>

          <div className="my-1 h-px bg-slate-100" />

          {schema.fields.map((field) => {
            const isUsed =
              usedFields.has(field.key) && field.key !== currentField;
            const isSelected = field.key === currentField;

            return (
              <button
                key={field.key}
                onClick={() => {
                  onSelect(csvHeader, field.key);
                  setOpen(false);
                }}
                className={cn(
                  "flex items-center gap-2 w-full px-3 py-2 text-[12px] text-left transition-colors",
                  isSelected
                    ? "bg-slate-900 text-white"
                    : "text-slate-700 hover:bg-slate-50"
                )}
              >
                <span className="truncate flex-1">
                  {field.label}
                  {field.required && (
                    <span
                      className={cn(
                        "ml-1 text-[10px]",
                        isSelected ? "text-rose-300" : "text-rose-400"
                      )}
                    >
                      *
                    </span>
                  )}
                </span>
                {isUsed && (
                  <span className="text-[10px] text-slate-400">in use</span>
                )}
                {isSelected && <Check className="h-3.5 w-3.5 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────

export function UploadMapper({
  onReady,
  onClear,
  onSaveTemplate,
}: UploadMapperProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // File state
  const [file, setFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  // Detection state
  const [detectedSource, setDetectedSource] = useState<SourceType | null>(null);
  const [detectionResults, setDetectionResults] = useState<DetectionResult[]>(
    []
  );
  const [needsSourcePick, setNeedsSourcePick] = useState(false);

  // Data state
  const [headers, setHeaders] = useState<string[]>([]);
  const [allRows, setAllRows] = useState<Record<string, string>[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [sampleRows, setSampleRows] = useState<Record<string, string>[]>([]);
  const [visibleRowCount, setVisibleRowCount] = useState(50);

  // Mapping state
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [suggestions, setSuggestions] = useState<MappingSuggestion[]>([]);
  const [savedMappings, setSavedMappings] = useState<SavedMapping[]>([]);

  // UI state
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");

  const schema = detectedSource ? getSchema(detectedSource) : null;

  // Confidence map
  const confidenceMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of suggestions) {
      m.set(s.csvHeader, s.confidence);
    }
    return m;
  }, [suggestions]);

  // Used fields
  const usedFields = useMemo(() => {
    return new Set(Object.values(mapping));
  }, [mapping]);

  // Required fields check
  const requiredFields = schema?.fields.filter((f) => f.required) ?? [];
  const missingRequired = requiredFields.filter(
    (f) => !usedFields.has(f.key)
  );
  const mappedCount = Object.values(mapping).filter(Boolean).length;

  // Visible rows for the table
  const rows = useMemo(
    () => allRows.slice(0, visibleRowCount),
    [allRows, visibleRowCount]
  );

  // Notify parent when mapping changes
  useEffect(() => {
    if (
      file &&
      fileContent &&
      detectedSource &&
      Object.keys(mapping).length > 0
    ) {
      onReady({
        source: detectedSource,
        file,
        content: fileContent,
        mapping,
        headers,
        totalRows,
      });
    }
  }, [
    mapping,
    file,
    fileContent,
    detectedSource,
    headers,
    totalRows,
    onReady,
  ]);

  // ─── Apply mapping for a given source ────────────────────

  const applySource = useCallback(
    async (source: SourceType, hdrs: string[], samples: Record<string, string>[]) => {
      setDetectedSource(source);

      const s = getSchema(source)!;
      const suggs = generateMappingSuggestions(hdrs, s, samples);
      setSuggestions(suggs);
      setMapping(suggestionsToMapping(suggs));

      try {
        const saved = await getSavedMappings(source);
        setSavedMappings(saved);
      } catch {
        // Non-critical
      }
    },
    []
  );

  // ─── File handling ───────────────────────────────────────

  const processFile = useCallback(
    async (f: File) => {
      setFileError(null);
      setNeedsSourcePick(false);

      if (!f.name.toLowerCase().endsWith(".csv")) {
        setFileError("Only CSV files are supported");
        return;
      }
      if (f.size > 10 * 1024 * 1024) {
        setFileError("File too large (max 10 MB)");
        return;
      }

      const content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsText(f);
      });

      if (!content?.trim()) {
        setFileError("File is empty");
        return;
      }

      setFile(f);
      setFileContent(content);

      // Parse
      const parsed = parseCSVContent(content);
      setHeaders(parsed.headers);
      setAllRows(parsed.rows);
      setTotalRows(parsed.totalRows);
      setSampleRows(parsed.sampleRows);
      setVisibleRowCount(50);

      // Auto-detect source
      const results = detectSource(parsed.headers, parsed.sampleRows);
      setDetectionResults(results);

      if (isConfidentDetection(results)) {
        // Auto-select
        await applySource(results[0].source, parsed.headers, parsed.sampleRows);
      } else {
        // Need user to pick
        setNeedsSourcePick(true);
      }
    },
    [applySource]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) processFile(f);
    },
    [processFile]
  );

  const clearFile = () => {
    setFile(null);
    setFileContent("");
    setHeaders([]);
    setAllRows([]);
    setTotalRows(0);
    setSampleRows([]);
    setVisibleRowCount(50);
    setMapping({});
    setSuggestions([]);
    setDetectedSource(null);
    setDetectionResults([]);
    setNeedsSourcePick(false);
    setSavedMappings([]);
    if (inputRef.current) inputRef.current.value = "";
    onClear();
  };

  const handleSourcePick = async (source: SourceType) => {
    setNeedsSourcePick(false);
    await applySource(source, headers, sampleRows);
  };

  // ─── Mapping handling ────────────────────────────────────

  const handleFieldSelect = (
    csvHeader: string,
    schemaField: string | null
  ) => {
    const newMapping = { ...mapping };

    if (schemaField) {
      for (const [k, v] of Object.entries(newMapping)) {
        if (v === schemaField && k !== csvHeader) {
          delete newMapping[k];
        }
      }
      newMapping[csvHeader] = schemaField;
    } else {
      delete newMapping[csvHeader];
    }

    setMapping(newMapping);
  };

  const handleLoadSaved = (saved: SavedMapping) => {
    setMapping(saved.mapping);
  };

  const handleSaveTemplate = () => {
    if (!templateName.trim() || !detectedSource) return;
    onSaveTemplate(detectedSource, templateName.trim(), mapping, headers);
    setSaveDialogOpen(false);
    setTemplateName("");
  };

  // ─── Render: Upload zone (no file) ──────────────────────

  if (!file) {
    return (
      <div>
        <div
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDragging(false);
          }}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "group cursor-pointer rounded-xl border-2 border-dashed transition-all duration-200",
            isDragging
              ? "border-slate-900 bg-slate-50"
              : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
          )}
        >
          <div className="flex flex-col items-center justify-center py-16 px-8">
            <div
              className={cn(
                "flex h-12 w-12 items-center justify-center rounded-xl transition-colors",
                isDragging
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-400 group-hover:bg-slate-200 group-hover:text-slate-500"
              )}
            >
              <Upload className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <p className="mt-4 text-[13px] font-medium text-slate-700">
              {isDragging
                ? "Drop your file here"
                : "Drag & drop a CSV from Stripe, Calendly, or PassLine"}
            </p>
            <p className="mt-1 text-[12px] text-slate-400">
              or{" "}
              <span className="font-medium text-slate-500 underline underline-offset-2">
                browse files
              </span>{" "}
              — source type is auto-detected
            </p>
          </div>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) processFile(f);
          }}
          className="hidden"
        />
        {fileError && (
          <p className="mt-3 text-[12px] font-medium text-rose-600">
            {fileError}
          </p>
        )}
        {/* Sample CSVs */}
        <div className="mt-4 flex items-center justify-center gap-4">
          <span className="text-[11px] text-slate-400">Try a sample:</span>
          <a
            href="/samples/stripe_export.csv"
            download
            className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-slate-600 transition-colors"
          >
            <Download className="h-3 w-3" />
            Stripe
          </a>
          <a
            href="/samples/calendly_export.csv"
            download
            className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-slate-600 transition-colors"
          >
            <Download className="h-3 w-3" />
            Calendly
          </a>
          <a
            href="/samples/passline_export.csv"
            download
            className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-slate-600 transition-colors"
          >
            <Download className="h-3 w-3" />
            PassLine
          </a>
        </div>
      </div>
    );
  }

  // ─── Render: File loaded, needs source pick ──────────────

  if (needsSourcePick) {
    return (
      <div className="space-y-4">
        {/* Compact file bar */}
        <FileBar file={file} onClear={clearFile} />

        <SourcePicker results={detectionResults} onSelect={handleSourcePick} />

        {/* Still show raw data preview while picking */}
        <RawPreview headers={headers} rows={allRows.slice(0, 4)} totalRows={totalRows} />
      </div>
    );
  }

  // ─── Render: File loaded + source detected — full table ──

  if (!schema) return null;

  const sourceMeta = SOURCE_META[detectedSource!];

  return (
    <div className="space-y-4">
      {/* Compact file bar + detected source + toolbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 shrink-0">
            <FileText
              className="h-4 w-4 text-emerald-600"
              strokeWidth={1.8}
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-[13px] font-medium text-slate-900 truncate">
                {file.name}
              </p>
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                <sourceMeta.icon
                  className={cn("h-3 w-3", sourceMeta.color)}
                  strokeWidth={2}
                />
                {sourceMeta.label}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              {totalRows} rows &middot;{" "}
              {(file.size / 1024).toFixed(1)} KB &middot;{" "}
              <span
                className={cn(
                  "font-medium",
                  missingRequired.length > 0
                    ? "text-amber-600"
                    : "text-emerald-600"
                )}
              >
                {mappedCount}/{headers.length} mapped
              </span>
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={clearFile}
            className="h-7 w-7 shrink-0 text-slate-400 hover:text-slate-600"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {savedMappings.length > 0 && (
            <div className="relative">
              <select
                onChange={(e) => {
                  const saved = savedMappings.find(
                    (m) => m.id === e.target.value
                  );
                  if (saved) handleLoadSaved(saved);
                  e.target.value = "";
                }}
                defaultValue=""
                className="h-8 rounded-md border border-slate-200 bg-white px-2 pr-7 text-[11px] font-medium text-slate-600 appearance-none cursor-pointer hover:border-slate-300 transition-colors"
              >
                <option value="" disabled>
                  Load template
                </option>
                {savedMappings.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <FolderOpen className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSaveDialogOpen(true)}
            className="h-8 text-[11px] border-slate-200"
          >
            <Save className="mr-1 h-3 w-3" />
            Save
          </Button>
        </div>
      </div>

      {/* Missing required warning */}
      {missingRequired.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          <p className="text-[11px] text-amber-700">
            <span className="font-medium">Required fields not mapped:</span>{" "}
            {missingRequired.map((f) => f.label).join(", ")}
          </p>
        </div>
      )}

      {/* Data table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider w-10 border-r border-slate-100">
                  #
                </th>
                {headers.map((header) => {
                  const currentField = mapping[header] ?? null;
                  const confidence = confidenceMap.get(header) ?? 0;

                  return (
                    <th
                      key={header}
                      className={cn(
                        "bg-slate-50/80 min-w-[160px] max-w-[220px] border-r border-slate-50 last:border-r-0",
                        !currentField && "bg-slate-50/40"
                      )}
                    >
                      <ColumnDropdown
                        csvHeader={header}
                        currentField={currentField}
                        confidence={confidence}
                        schema={schema}
                        usedFields={usedFields}
                        onSelect={handleFieldSelect}
                      />
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-slate-50 last:border-b-0 hover:bg-slate-50/30 transition-colors"
                >
                  <td className="sticky left-0 z-10 bg-white px-3 py-2.5 text-[11px] font-mono text-slate-300 border-r border-slate-100 tabular-nums">
                    {i + 1}
                  </td>
                  {headers.map((header) => {
                    const val = row[header] ?? "";
                    const field = mapping[header];
                    const fieldDef = field
                      ? schema.fields.find((f) => f.key === field)
                      : null;
                    const isMapped = !!field;

                    let cellWarning = false;
                    if (fieldDef?.required && !val.trim()) {
                      cellWarning = true;
                    }

                    return (
                      <td
                        key={header}
                        className={cn(
                          "px-3 py-2.5 text-[12px] max-w-[220px] border-r border-slate-50 last:border-r-0",
                          isMapped ? "text-slate-700" : "text-slate-300",
                          cellWarning && "bg-rose-50/40"
                        )}
                      >
                        <span className="block truncate">{val || "—"}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <p className="text-[11px] text-slate-400">
              Showing {rows.length} of {totalRows} rows
            </p>
            {totalRows > 50 && (
              <select
                value={visibleRowCount}
                onChange={(e) => setVisibleRowCount(Number(e.target.value))}
                className="h-6 rounded border border-slate-200 bg-white px-1.5 text-[11px] text-slate-600 cursor-pointer hover:border-slate-300 transition-colors"
              >
                <option value={50}>50 rows</option>
                <option value={100}>100 rows</option>
                <option value={250}>250 rows</option>
                <option value={500}>500 rows</option>
                <option value={totalRows}>All ({totalRows})</option>
              </select>
            )}
          </div>
          <div className="flex items-center gap-4 text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              High match
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              Uncertain
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-rose-400 text-[9px]">*</span>
              Required
            </span>
          </div>
        </div>
      </div>

      {/* Save template dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle className="text-[14px]">
              Save mapping template
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              placeholder="e.g. Stripe Default Export"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              className="h-9 text-[13px] border-slate-200"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveTemplate();
              }}
            />
            <p className="mt-2 text-[11px] text-slate-400">
              Auto-loads when you upload a similar CSV next time.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSaveDialogOpen(false)}
              className="text-[12px]"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveTemplate}
              disabled={!templateName.trim()}
              className="text-[12px]"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Helper sub-components ───────────────────────────────────

function FileBar({ file, onClear }: { file: File; onClear: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 shrink-0">
        <FileText className="h-4 w-4 text-slate-500" strokeWidth={1.8} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-slate-900 truncate">
          {file.name}
        </p>
        <p className="text-[11px] text-slate-400">
          {(file.size / 1024).toFixed(1)} KB
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={onClear}
        className="h-7 w-7 shrink-0 text-slate-400 hover:text-slate-600"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function RawPreview({
  headers,
  rows,
  totalRows,
}: {
  headers: string[];
  rows: Record<string, string>[];
  totalRows: number;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="bg-slate-50 px-3 py-2.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider w-10 border-r border-slate-100">
                #
              </th>
              {headers.map((h) => (
                <th
                  key={h}
                  className="bg-slate-50 px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider min-w-[120px] border-r border-slate-50 last:border-r-0"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 4).map((row, i) => (
              <tr
                key={i}
                className="border-b border-slate-50 last:border-b-0"
              >
                <td className="px-3 py-2 text-[11px] font-mono text-slate-300 border-r border-slate-100">
                  {i + 1}
                </td>
                {headers.map((h) => (
                  <td
                    key={h}
                    className="px-3 py-2 text-[12px] text-slate-500 max-w-[200px] truncate border-r border-slate-50 last:border-r-0"
                  >
                    {row[h] || "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-2">
        <p className="text-[11px] text-slate-400">
          {totalRows} rows total — select a source type to map columns
        </p>
      </div>
    </div>
  );
}
