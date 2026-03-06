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
  ShoppingCart,
  Plane,
  Users,
  TrendingUp,
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
import { getSchema, schemaKeyToSourceType, detectAttributionSubtype } from "@/lib/csv/schemas";
import { detectSource, isConfidentDetection } from "@/lib/csv/detect-source";
import { getSavedMappings } from "@/lib/actions/mappings";
import type {
  SourceType,
  SchemaKey,
  SourceSchema,
  MappingSuggestion,
  SavedMapping,
} from "@/lib/types";
import type { DetectionResult } from "@/lib/csv/detect-source";
import type { MapperRestoredData } from "@/lib/upload-session";

// ─── Types ───────────────────────────────────────────────────

export interface MultiFileEntry {
  file: File;
  content: string;
  source: SourceType | null;
  schemaKey?: SchemaKey;
  headers: string[];
  totalRows: number;
  needsSourcePick: boolean;
  detectionResults: DetectionResult[];
  mapping?: Record<string, string>;
}

interface UploadMapperProps {
  onReady: (data: {
    source: SourceType;
    schemaKey?: SchemaKey;
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
  onMultipleFiles?: (entries: MultiFileEntry[]) => void;
  initialData?: MapperRestoredData | null;
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
  pos: { label: "POS", icon: ShoppingCart, color: "text-orange-500" },
  wetravel: { label: "WeTravel", icon: Plane, color: "text-cyan-500" },
  crm: { label: "CRM / Members", icon: Users, color: "text-indigo-500" },
  attribution: { label: "Attribution", icon: TrendingUp, color: "text-rose-500" },
  attribution_firsttouch: { label: "Attribution (First Touch)", icon: TrendingUp, color: "text-rose-500" },
  attribution_journeys: { label: "Attribution (Journeys)", icon: TrendingUp, color: "text-rose-500" },
};

function SourcePicker({
  results,
  onSelect,
}: {
  results: DetectionResult[];
  onSelect: (source: SourceType | SchemaKey) => void;
}) {
  const crmMeta = SOURCE_META.crm;
  const CrmIcon = crmMeta.icon;
  const attrMeta = SOURCE_META.attribution;
  const AttrIcon = attrMeta.icon;

  return (
    <div className="rounded-xl border border-amber-200 dark:border-amber-500/20 bg-amber-50/40 dark:bg-amber-500/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
        <p className="text-[12px] font-medium text-amber-800 dark:text-amber-300">
          Couldn&apos;t confidently detect the source type. Which is it?
        </p>
      </div>
      {results.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {results.map((r) => {
            const meta = SOURCE_META[r.source];
            if (!meta) return null;
            const Icon = meta.icon;
            return (
              <button
                key={r.source}
                onClick={() => onSelect(r.source)}
                className="flex items-center gap-2 rounded-lg border border-amber-200 bg-surface px-3 py-2 text-[12px] font-medium text-text-secondary hover:border-border-default hover:shadow-sm transition-all"
              >
                <Icon className={cn("h-4 w-4", meta.color)} strokeWidth={1.8} />
                {meta.label}
                <span className="text-[10px] text-text-muted">
                  {Math.round(r.confidence * 100)}%
                </span>
              </button>
            );
          })}
        </div>
      )}
      <div className="border-t border-amber-200 dark:border-amber-500/20 pt-3">
        <p className="text-[11px] text-text-muted mb-2">Or choose a data type:</p>
        <div className="flex gap-2">
          <button
            onClick={() => onSelect("crm")}
            className="flex items-center gap-2 rounded-lg border border-border-default bg-surface px-3 py-2 text-[12px] font-medium text-text-secondary hover:border-border-default hover:shadow-sm transition-all"
          >
            <CrmIcon className={cn("h-4 w-4", crmMeta.color)} strokeWidth={1.8} />
            {crmMeta.label}
          </button>
          <button
            onClick={() => onSelect("attribution")}
            className="flex items-center gap-2 rounded-lg border border-border-default bg-surface px-3 py-2 text-[12px] font-medium text-text-secondary hover:border-border-default hover:shadow-sm transition-all"
          >
            <AttrIcon className={cn("h-4 w-4", attrMeta.color)} strokeWidth={1.8} />
            {attrMeta.label}
          </button>
        </div>
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
            ? "text-text-secondary hover:bg-surface-muted"
            : "text-text-muted hover:bg-surface-elevated italic"
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
        <span className="text-[10px] font-mono text-text-muted truncate block">
          {csvHeader}
        </span>
      </div>

      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-56 rounded-lg border border-border-default bg-surface shadow-lg shadow-border-default/50 py-1 animate-fade-in">
          <button
            onClick={() => {
              onSelect(csvHeader, null);
              setOpen(false);
            }}
            className={cn(
              "flex items-center gap-2 w-full px-3 py-2 text-[12px] text-left transition-colors",
              !currentField
                ? "bg-surface-elevated text-text-secondary font-medium"
                : "text-text-muted hover:bg-surface-elevated"
            )}
          >
            <Minus className="h-3.5 w-3.5 text-text-muted" />
            <span className="italic">Skip this column</span>
            {!currentField && (
              <Check className="ml-auto h-3.5 w-3.5 text-text-muted" />
            )}
          </button>

          <div className="my-1 h-px bg-surface-muted" />

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
                    ? "bg-surface-active text-text-on-active"
                    : "text-text-secondary hover:bg-surface-elevated"
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
                  <span className="text-[10px] text-text-muted">in use</span>
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
  onMultipleFiles,
  initialData,
}: UploadMapperProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const restoredRef = useRef(false);

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

  // Attribution sub-type tracking
  const [resolvedSchemaKey, setResolvedSchemaKey] = useState<SchemaKey | undefined>();

  const schema = resolvedSchemaKey ? getSchema(resolvedSchemaKey) : (detectedSource ? getSchema(detectedSource) : null);

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

  // Restore from initialData on mount
  useEffect(() => {
    if (!initialData || restoredRef.current) return;
    restoredRef.current = true;

    const parsed = parseCSVContent(initialData.content);
    const syntheticFile = new File([initialData.content], initialData.fileName, {
      type: "text/csv",
    });

    setFile(syntheticFile);
    setFileContent(initialData.content);
    setHeaders(parsed.headers);
    setAllRows(parsed.rows);
    setTotalRows(parsed.totalRows);
    setSampleRows(parsed.sampleRows);
    setDetectedSource(initialData.source);
    setMapping(initialData.mapping);

    const schema = getSchema(initialData.source);
    if (schema) {
      setSuggestions(
        generateMappingSuggestions(parsed.headers, schema, parsed.sampleRows)
      );
    }

    getSavedMappings(initialData.source)
      .then(setSavedMappings)
      .catch(() => {});
  }, [initialData]);

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
        schemaKey: resolvedSchemaKey,
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
    resolvedSchemaKey,
    headers,
    totalRows,
    onReady,
  ]);

  // ─── Apply mapping for a given source ────────────────────

  const applySource = useCallback(
    async (source: SourceType, hdrs: string[], samples: Record<string, string>[]) => {
      // For attribution, resolve sub-type from headers
      let effectiveKey: SchemaKey = source;
      if (source === "attribution") {
        effectiveKey = detectAttributionSubtype(hdrs);
      }
      setResolvedSchemaKey(effectiveKey);
      setDetectedSource(source);

      const s = getSchema(effectiveKey) ?? getSchema(source)!;
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
        // Auto-select — map SchemaKey back to SourceType
        const detectedKey = results[0].source;
        const dbSource = (detectedKey.startsWith("attribution") ? "attribution" : detectedKey) as SourceType;
        await applySource(dbSource, parsed.headers, parsed.sampleRows);
      } else {
        // Need user to pick
        setNeedsSourcePick(true);
      }
    },
    [applySource]
  );

  const processMultipleFiles = useCallback(
    async (files: File[]) => {
      const entries: MultiFileEntry[] = [];
      for (const f of files) {
        if (!f.name.toLowerCase().endsWith(".csv")) continue;
        if (f.size > 10 * 1024 * 1024) continue;

        const content = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = () => reject(new Error("Failed to read file"));
          reader.readAsText(f);
        });

        if (!content?.trim()) continue;

        const parsed = parseCSVContent(content);
        const results = detectSource(parsed.headers, parsed.sampleRows);
        const confident = isConfidentDetection(results);

        // Map SchemaKey back to SourceType for DB writes
        const detectedKey = confident ? results[0].source : null;
        const dbSource = detectedKey ? (detectedKey.startsWith("attribution") ? "attribution" : detectedKey) as SourceType : null;

        entries.push({
          file: f,
          content,
          source: dbSource,
          schemaKey: detectedKey ?? undefined,
          headers: parsed.headers,
          totalRows: parsed.totalRows,
          needsSourcePick: !confident,
          detectionResults: results,
        });
      }
      return entries;
    },
    []
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.name.toLowerCase().endsWith(".csv")
      );

      if (files.length > 1 && onMultipleFiles) {
        const entries = await processMultipleFiles(files);
        if (entries.length > 0) onMultipleFiles(entries);
        return;
      }

      const f = files[0];
      if (f) processFile(f);
    },
    [processFile, processMultipleFiles, onMultipleFiles]
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

  const handleSourcePick = async (source: SourceType | SchemaKey) => {
    setNeedsSourcePick(false);
    // For attribution sub-types detected by the source detector, resolve to base SourceType
    const dbSource = (source.startsWith("attribution") ? "attribution" : source) as SourceType;
    await applySource(dbSource, headers, sampleRows);
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
              ? "border-surface-active bg-surface-elevated"
              : "border-border-default bg-surface hover:border-border-default hover:bg-surface-elevated/50"
          )}
        >
          <div className="flex flex-col items-center justify-center py-16 px-8">
            <div
              className={cn(
                "flex h-12 w-12 items-center justify-center rounded-xl transition-colors",
                isDragging
                  ? "bg-surface-active text-text-on-active"
                  : "bg-surface-muted text-text-muted group-hover:bg-surface-muted group-hover:text-text-muted"
              )}
            >
              <Upload className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <p className="mt-4 text-[13px] font-medium text-text-secondary">
              {isDragging
                ? "Drop your file(s) here"
                : "Drag & drop CSV exports from your systems"}
            </p>
            <p className="mt-1 text-[12px] text-text-muted">
              or{" "}
              <span className="font-medium text-text-muted underline underline-offset-2">
                browse files
              </span>{" "}
              — drop multiple files to batch import
            </p>
          </div>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          multiple
          onChange={async (e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length > 1 && onMultipleFiles) {
              const entries = await processMultipleFiles(files);
              if (entries.length > 0) onMultipleFiles(entries);
              return;
            }
            const f = files[0];
            if (f) processFile(f);
          }}
          className="hidden"
        />
        {fileError && (
          <p className="mt-3 text-[12px] font-medium text-rose-600">
            {fileError}
          </p>
        )}
        {/* Supported sources */}
        <p className="mt-4 text-center text-[11px] text-text-muted">
          Stripe &bull; Square &bull; Mindbody &bull; Calendly &bull; WeTravel &bull; POS exports &middot; Multiple files supported
        </p>
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
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-500/10 shrink-0">
            <FileText
              className="h-4 w-4 text-emerald-600"
              strokeWidth={1.8}
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-[13px] font-medium text-text-primary truncate">
                {file.name}
              </p>
              <span className="inline-flex items-center gap-1 rounded-md bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-text-secondary">
                <sourceMeta.icon
                  className={cn("h-3 w-3", sourceMeta.color)}
                  strokeWidth={2}
                />
                {sourceMeta.label}
              </span>
            </div>
            <p className="text-[11px] text-text-muted">
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
            className="h-7 w-7 shrink-0 text-text-muted hover:text-text-secondary"
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
                className="h-8 rounded-md border border-border-default bg-surface px-2 pr-7 text-[11px] font-medium text-text-secondary appearance-none cursor-pointer hover:border-border-default transition-colors"
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
              <FolderOpen className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-text-muted pointer-events-none" />
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSaveDialogOpen(true)}
            className="h-8 text-[11px] border-border-default"
          >
            <Save className="mr-1 h-3 w-3" />
            Save
          </Button>
        </div>
      </div>

      {/* Missing required warning */}
      {missingRequired.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 dark:border-amber-500/20 bg-amber-50/60 dark:bg-amber-500/5 px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          <p className="text-[11px] text-amber-700 dark:text-amber-300">
            <span className="font-medium">Required fields not mapped:</span>{" "}
            {missingRequired.map((f) => f.label).join(", ")}
          </p>
        </div>
      )}

      {/* Data table */}
      <div className="rounded-xl border border-border-default bg-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border-muted">
                <th className="sticky left-0 z-10 bg-surface-elevated px-3 py-2 text-[10px] font-semibold text-text-muted uppercase tracking-wider w-10 border-r border-border-muted">
                  #
                </th>
                {headers.map((header) => {
                  const currentField = mapping[header] ?? null;
                  const confidence = confidenceMap.get(header) ?? 0;

                  return (
                    <th
                      key={header}
                      className={cn(
                        "bg-surface-elevated/80 min-w-[160px] max-w-[220px] border-r border-border-muted last:border-r-0",
                        !currentField && "bg-surface-elevated/40"
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
                  className="border-b border-border-muted last:border-b-0 hover:bg-surface-elevated/30 transition-colors"
                >
                  <td className="sticky left-0 z-10 bg-surface px-3 py-2.5 text-[11px] font-mono text-text-muted border-r border-border-muted tabular-nums">
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
                          "px-3 py-2.5 text-[12px] max-w-[220px] border-r border-border-muted last:border-r-0",
                          isMapped ? "text-text-secondary" : "text-text-muted",
                          cellWarning && "bg-rose-50/40 dark:bg-rose-500/5"
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

        <div className="border-t border-border-muted bg-surface-elevated/50 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <p className="text-[11px] text-text-muted">
              Showing {rows.length} of {totalRows} rows
            </p>
            {totalRows > 50 && (
              <select
                value={visibleRowCount}
                onChange={(e) => setVisibleRowCount(Number(e.target.value))}
                className="h-6 rounded border border-border-default bg-surface px-1.5 text-[11px] text-text-secondary cursor-pointer hover:border-border-default transition-colors"
              >
                <option value={50}>50 rows</option>
                <option value={100}>100 rows</option>
                <option value={250}>250 rows</option>
                <option value={500}>500 rows</option>
                <option value={totalRows}>All ({totalRows})</option>
              </select>
            )}
          </div>
          <div className="flex items-center gap-4 text-[11px] text-text-muted">
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
              className="h-9 text-[13px] border-border-default"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveTemplate();
              }}
            />
            <p className="mt-2 text-[11px] text-text-muted">
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
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-muted shrink-0">
        <FileText className="h-4 w-4 text-text-muted" strokeWidth={1.8} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-text-primary truncate">
          {file.name}
        </p>
        <p className="text-[11px] text-text-muted">
          {(file.size / 1024).toFixed(1)} KB
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={onClear}
        className="h-7 w-7 shrink-0 text-text-muted hover:text-text-secondary"
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
    <div className="rounded-xl border border-border-default bg-surface overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border-muted">
              <th className="bg-surface-elevated px-3 py-2.5 text-[10px] font-semibold text-text-muted uppercase tracking-wider w-10 border-r border-border-muted">
                #
              </th>
              {headers.map((h) => (
                <th
                  key={h}
                  className="bg-surface-elevated px-3 py-2.5 text-[11px] font-semibold text-text-muted uppercase tracking-wider min-w-[120px] border-r border-border-muted last:border-r-0"
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
                className="border-b border-border-muted last:border-b-0"
              >
                <td className="px-3 py-2 text-[11px] font-mono text-text-muted border-r border-border-muted">
                  {i + 1}
                </td>
                {headers.map((h) => (
                  <td
                    key={h}
                    className="px-3 py-2 text-[12px] text-text-muted max-w-[200px] truncate border-r border-border-muted last:border-r-0"
                  >
                    {row[h] || "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-border-muted bg-surface-elevated/50 px-4 py-2">
        <p className="text-[11px] text-text-muted">
          {totalRows} rows total — select a source type to map columns
        </p>
      </div>
    </div>
  );
}
