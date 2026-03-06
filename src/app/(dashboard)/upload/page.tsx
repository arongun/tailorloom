"use client";

import { useState, useCallback, useRef, useEffect } from "react";
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
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

import { UploadMapper, type MultiFileEntry } from "./components/upload-mapper";
import { StitchPreview } from "./components/stitch-preview";

import { previewCSV, uploadCSV, previewStitching, previewStitchingFast, previewCRMStitching, previewAttributionStitching } from "@/lib/actions/import";
import { generateMappingSuggestions, suggestionsToMapping } from "@/lib/csv/heuristic-mapper";
import { getSchema } from "@/lib/csv/schemas";
import { parseCSVContent } from "@/lib/csv/parser";
import { saveMappingTemplate } from "@/lib/actions/mappings";

import type {
  SourceType,
  SchemaKey,
  ImportResultDetailed,
  StitchPreviewResult,
  StitchDecisions,
} from "@/lib/types";
import { detectSource, isConfidentDetection, type DetectionResult } from "@/lib/csv/detect-source";

import {
  saveUploadSession,
  loadUploadSession,
  clearUploadSession,
} from "@/lib/upload-session";
import type { MapperRestoredData, MultiFileSessionEntry } from "@/lib/upload-session";

interface MultiFileQueueEntry {
  file: File;
  content: string;
  source: SourceType | null;
  headers: string[];
  totalRows: number;
  needsSourcePick: boolean;
  detectionResults: DetectionResult[];
  mapping?: Record<string, string>;
  // Preflight results (filled after "Preview All")
  preflight?: { newRows: number; matchedRows: number; uncertainRows: number; flaggedRows: number; errorRows: number };
  // Full stitch result per file
  stitchResult?: StitchPreviewResult;
  // Per-file user decisions
  stitchDecisions?: StitchDecisions;
  // User has seen this file's preview
  reviewed?: boolean;
  // Import status
  status: "pending" | "previewing" | "ready" | "importing" | "done" | "error";
  result?: ImportResultDetailed;
  error?: string;
}

type Step = 1 | 2 | 3;

const STEP_LABELS: Record<Step, string> = {
  1: "Upload & Map",
  2: "Verify",
  3: "Import",
};

export default function UploadPage() {
  const [step, setStep] = useState<Step>(1);

  // Scroll to top on step change
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  // Step 1 — data from UploadMapper
  const mapperData = useRef<{
    source: SourceType;
    schemaKey?: SchemaKey;
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

  // Multi-file queue
  const [multiFileQueue, setMultiFileQueue] = useState<MultiFileQueueEntry[] | null>(null);
  const [multiImporting, setMultiImporting] = useState(false);
  const [reviewingIndex, setReviewingIndex] = useState<number | null>(null);
  const [multiImportStarted, setMultiImportStarted] = useState(false);
  const [importingFileIndex, setImportingFileIndex] = useState<number | null>(null);
  const [importingFileStart, setImportingFileStart] = useState<number>(0);
  const addMoreInputRef = useRef<HTMLInputElement>(null);
  const multiImportAbortRef = useRef(false);

  // Scroll to top when switching between multi-file review files
  useEffect(() => {
    if (reviewingIndex !== null) window.scrollTo({ top: 0 });
  }, [reviewingIndex]);

  // Session persistence
  const [restoredMapperData, setRestoredMapperData] =
    useState<MapperRestoredData | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);

  // Per-file import progress: eased value for the currently-importing file
  const [fileImportProgress, setFileImportProgress] = useState(0);
  useEffect(() => {
    if (importingFileIndex === null) {
      setFileImportProgress(0);
      return;
    }
    const HALF_LIFE = 10_000;
    const RATE = Math.LN2 / HALF_LIFE;
    const INTERVAL = 200;
    const timer = setInterval(() => {
      const elapsed = Date.now() - importingFileStart;
      setFileImportProgress(100 * (1 - Math.exp(-RATE * elapsed)));
    }, INTERVAL);
    return () => clearInterval(timer);
  }, [importingFileIndex, importingFileStart]);

  // Restore session on mount (async — load is now async due to IndexedDB)
  useEffect(() => {
    (async () => {
      try {
        const session = await loadUploadSession();
        if (!session) {
          setSessionLoaded(true);
          return;
        }

        // Multi-file restore takes priority
        if (session.multiQueue && session.multiContents) {
          const restored: MultiFileQueueEntry[] = session.multiQueue.map((entry, i) => {
            const content = session.multiContents?.[i] ?? "";
            const stitchResult = session.multiStitchResults?.[i] ?? undefined;
            return {
              file: new File([content], entry.fileName),
              content,
              source: entry.source,
              headers: entry.headers,
              totalRows: entry.totalRows,
              needsSourcePick: entry.needsSourcePick,
              detectionResults: entry.detectionResults,
              mapping: entry.mapping,
              stitchDecisions: entry.stitchDecisions,
              preflight: entry.preflight,
              reviewed: entry.reviewed,
              status: entry.status === "error" ? "error" : (stitchResult ? "ready" : "pending"),
              stitchResult,
              error: entry.error,
            };
          });
          setMultiFileQueue(restored);
          setReviewingIndex(session.multiReviewingIndex);
          setSessionLoaded(true);
          return;
        }

        // Single-file restore
        if (session.mapper) {
          mapperData.current = {
            source: session.mapper.source,
            schemaKey: session.mapper.schemaKey,
            file: new File([session.mapper.content], session.mapper.fileName),
            content: session.mapper.content,
            mapping: session.mapper.mapping,
            headers: session.mapper.headers,
            totalRows: session.mapper.totalRows,
          };
          setIsMapperReady(true);
          setRestoredMapperData(session.mapper);

          if (session.step === 2 && session.stitch) {
            setStitchPreviewResult(session.stitch.preview);
            setStitchDecisions(session.stitch.decisions);
            setStep(2);
          }
        }
      } catch {
        // Failed to restore — start fresh
      }
      setSessionLoaded(true);
    })();
  }, []);

  // ─── Handlers ──────────────────────────────────────────

  const handleMapperReady = useCallback(
    (data: {
      source: SourceType;
      schemaKey?: SchemaKey;
      file: File;
      content: string;
      mapping: Record<string, string>;
      headers: string[];
      totalRows: number;
    }) => {
      mapperData.current = data;
      setIsMapperReady(true);

      saveUploadSession({
        version: 2,
        savedAt: Date.now(),
        step: 1,
        mapper: {
          fileName: data.file.name,
          fileSize: data.file.size,
          content: data.content,
          source: data.source,
          schemaKey: data.schemaKey,
          mapping: data.mapping,
          headers: data.headers,
          totalRows: data.totalRows,
        },
        stitch: null,
        multiQueue: null,
        multiReviewingIndex: null,
      });
    },
    []
  );

  const handleMapperClear = useCallback(() => {
    mapperData.current = null;
    setIsMapperReady(false);
    clearUploadSession().catch(() => {});
    setRestoredMapperData(null);
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

  // Persist decision changes while on step 2
  useEffect(() => {
    if (step !== 2 || !stitchPreview || !mapperData.current) return;
    const data = mapperData.current;
    saveUploadSession({
      version: 2,
      savedAt: Date.now(),
      step: 2,
      mapper: {
        fileName: data.file.name,
        fileSize: data.file.size,
        content: data.content,
        source: data.source,
        schemaKey: data.schemaKey,
        mapping: data.mapping,
        headers: data.headers,
        totalRows: data.totalRows,
      },
      stitch: { preview: stitchPreview, decisions: stitchDecisions },
      multiQueue: null,
      multiReviewingIndex: null,
    });
  }, [stitchDecisions, step, stitchPreview]);

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

      // Run stitch preview (fast in-memory version)
      const stitchResult = await previewStitchingFast({
        source: data.source,
        content: data.content,
        mapping: data.mapping,
      });

      // Initialize default decisions: all uncertain rows → "create_new", flagged → "skip"
      const defaults: StitchDecisions = {};
      for (const row of stitchResult.uncertainRows) {
        defaults[row.rowIndex] = { action: "create_new" };
      }
      for (const row of stitchResult.flaggedRows) {
        defaults[row.rowIndex] = { action: "skip" };
      }

      setStitchPreviewResult(stitchResult);
      setStitchDecisions(defaults);
      setStep(2);

      saveUploadSession({
        version: 2,
        savedAt: Date.now(),
        step: 2,
        mapper: {
          fileName: data.file.name,
          fileSize: data.file.size,
          content: data.content,
          source: data.source,
          schemaKey: data.schemaKey,
          mapping: data.mapping,
          headers: data.headers,
          totalRows: data.totalRows,
        },
        stitch: { preview: stitchResult, decisions: defaults },
        multiQueue: null,
        multiReviewingIndex: null,
      });
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
        schemaKey: data.schemaKey,
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
      clearUploadSession().catch(() => {});
    }
  };

  const handleStartOver = () => {
    setStep(1);
    mapperData.current = null;
    setIsMapperReady(false);
    setStitchPreviewResult(null);
    setStitchDecisions({});
    setImportResult(null);
    clearUploadSession().catch(() => {});
    setRestoredMapperData(null);
  };

  // ─── Multi-file handlers ──────────────────────────────

  const handleMultipleFiles = useCallback((entries: MultiFileEntry[]) => {
    const entriesWithMapping = entries.map((e) => {
      if (!e.source) return { ...e, status: "pending" as const };
      const schema = getSchema(e.source);
      if (!schema) return { ...e, status: "pending" as const };
      const suggestions = generateMappingSuggestions(e.headers, schema, []);
      const mapping = suggestionsToMapping(suggestions);
      return { ...e, status: "pending" as const, mapping };
    });
    setMultiFileQueue(entriesWithMapping);
  }, []);

  // Persist multi-file queue changes
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!multiFileQueue) return;
    // Skip saving if all terminal
    if (multiFileQueue.every((e) => e.status === "done" || e.status === "error")) return;

    // Debounce to avoid thrashing IndexedDB on rapid state updates
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      const entries: MultiFileSessionEntry[] = multiFileQueue.map((e) => ({
        fileName: e.file.name,
        fileSize: e.file.size,
        source: e.source,
        headers: e.headers,
        totalRows: e.totalRows,
        needsSourcePick: e.needsSourcePick,
        detectionResults: e.detectionResults,
        mapping: e.mapping,
        stitchDecisions: e.stitchDecisions,
        preflight: e.preflight,
        reviewed: e.reviewed,
        // Normalize transient statuses
        status: e.status === "previewing" ? "pending" : e.status === "importing" ? "ready" : (e.status === "done" ? "ready" : e.status) as MultiFileSessionEntry["status"],
        error: e.error,
      }));

      saveUploadSession({
        version: 2,
        savedAt: Date.now(),
        step: 1,
        mapper: null,
        stitch: null,
        multiQueue: entries,
        multiReviewingIndex: reviewingIndex,
        multiContents: multiFileQueue.map((e) => e.content),
        multiStitchResults: multiFileQueue.map((e) => e.stitchResult ?? null),
      }).catch(() => {
        // Non-fatal — toast only on first failure
      });
    }, 500);

    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, [multiFileQueue, reviewingIndex]);

  const handleMultiSourcePick = useCallback((index: number, source: SourceType) => {
    setMultiFileQueue((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      const entry = next[index];
      const schema = getSchema(source);
      let mapping: Record<string, string> | undefined;
      if (schema) {
        const suggestions = generateMappingSuggestions(entry.headers, schema, []);
        mapping = suggestionsToMapping(suggestions);
      }
      next[index] = { ...entry, source, needsSourcePick: false, mapping };
      return next;
    });
  }, []);

  const handleMultiPreviewAll = useCallback(async () => {
    if (!multiFileQueue) return;

    // Collect indices that need previewing
    const toPreview = multiFileQueue
      .map((entry, i) => ({ entry, i }))
      .filter(({ entry }) => entry.source && !entry.preflight && entry.status !== "error");

    // Process a single file preview with timeout
    const processOne = async (idx: number) => {
      const entry = multiFileQueue[idx];

      // Set "previewing" status
      setMultiFileQueue((prev) => {
        if (!prev) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], status: "previewing" };
        return next;
      });
      await new Promise((r) => setTimeout(r, 0));

      try {
        const mapping = entry.mapping;
        if (!mapping) {
          setMultiFileQueue((prev) => {
            if (!prev) return prev;
            const next = [...prev];
            next[idx] = { ...next[idx], status: "error", error: "No mapping available" };
            return next;
          });
          return;
        }

        // Wrap preview in 30s timeout — use previewStitchingFast for full results
        const TIMEOUT_MS = 30_000;
        const startTime = performance.now();

        const previewPromise = previewStitchingFast({
          source: entry.source!,
          content: entry.content,
          mapping,
        });

        const stitchResult = await Promise.race([
          previewPromise,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Preview timed out")), TIMEOUT_MS)
          ),
        ]);

        if (process.env.NODE_ENV === "development") {
          const elapsed = Math.round(performance.now() - startTime);
          console.log(`[preview] ${entry.file.name} (${entry.totalRows} rows) — ${elapsed}ms`);
        }

        // Initialize default decisions for uncertain rows
        const defaults: StitchDecisions = {};
        for (const row of stitchResult.uncertainRows) {
          defaults[row.rowIndex] = { action: "create_new" };
        }
        // Default flagged rows to skip
        for (const row of stitchResult.flaggedRows) {
          defaults[row.rowIndex] = { action: "skip" };
        }

        setMultiFileQueue((prev) => {
          if (!prev) return prev;
          const next = [...prev];
          next[idx] = {
            ...next[idx],
            status: "ready",
            stitchResult,
            stitchDecisions: defaults,
            preflight: {
              newRows: stitchResult.summary.newCustomers,
              matchedRows: stitchResult.summary.confidentMatches + stitchResult.summary.enrichments,
              uncertainRows: stitchResult.summary.uncertainMatches + stitchResult.summary.nameReviewMatches,
              flaggedRows: stitchResult.summary.flaggedCount,
              errorRows: entry.totalRows - stitchResult.summary.totalValidRows - stitchResult.summary.flaggedCount,
            },
          };
          return next;
        });
      } catch (err) {
        setMultiFileQueue((prev) => {
          if (!prev) return prev;
          const next = [...prev];
          next[idx] = { ...next[idx], status: "error", error: err instanceof Error ? err.message : "Preview failed" };
          return next;
        });
      }
    };

    // Bounded concurrency: process up to 2 files at a time
    const CONCURRENCY = 2;
    let cursor = 0;

    const runNext = async (): Promise<void> => {
      while (cursor < toPreview.length) {
        const current = cursor++;
        await processOne(toPreview[current].i);
      }
    };

    const workers = Array.from({ length: Math.min(CONCURRENCY, toPreview.length) }, () => runNext());
    await Promise.all(workers);
  }, [multiFileQueue]);

  const handleMultiImportAll = useCallback(async () => {
    if (!multiFileQueue) return;
    multiImportAbortRef.current = false;
    setMultiImporting(true);
    setMultiImportStarted(true);

    for (let i = 0; i < multiFileQueue.length; i++) {
      if (multiImportAbortRef.current) break;

      const entry = multiFileQueue[i];
      if (!entry.source || entry.status === "done" || entry.status === "error") continue;

      // Set "importing" status and yield
      setImportingFileIndex(i);
      setImportingFileStart(Date.now());
      setMultiFileQueue((prev) => {
        if (!prev) return prev;
        const next = [...prev];
        next[i] = { ...next[i], status: "importing" };
        return next;
      });
      await new Promise((r) => setTimeout(r, 50));

      if (multiImportAbortRef.current) break;

      try {
        const mapping = entry.mapping;
        if (!mapping) {
          setMultiFileQueue((prev) => {
            if (!prev) return prev;
            const next = [...prev];
            next[i] = { ...next[i], status: "error", error: "No mapping available" };
            return next;
          });
          continue;
        }

        const result = await uploadCSV({
          source: entry.source,
          fileName: entry.file.name,
          content: entry.content,
          mapping,
          stitchDecisions: entry.stitchDecisions ?? {},
        });

        if (multiImportAbortRef.current) break;

        setMultiFileQueue((prev) => {
          if (!prev) return prev;
          const next = [...prev];
          next[i] = { ...next[i], status: "done", result };
          return next;
        });
      } catch (err) {
        if (multiImportAbortRef.current) break;

        setMultiFileQueue((prev) => {
          if (!prev) return prev;
          const next = [...prev];
          next[i] = { ...next[i], status: "error", error: err instanceof Error ? err.message : "Import failed" };
          return next;
        });
      }
    }

    if (multiImportAbortRef.current) return;

    setImportingFileIndex(null);
    setMultiImporting(false);
    clearUploadSession().catch(() => {});

    // Read final state for toast
    setMultiFileQueue((prev) => {
      if (!prev) return prev;
      const totalImported = prev.reduce((sum, e) => sum + (e.result?.importedRows ?? 0), 0);
      const totalErrors = prev.filter((e) => e.status === "error").length;
      if (totalErrors === 0) {
        toast.success(`${totalImported} rows imported from ${prev.length} files`);
      } else {
        toast.warning(`${totalImported} rows imported, ${totalErrors} file(s) had errors`);
      }
      return prev;
    });
  }, [multiFileQueue]);

  const handleAddMoreFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const csvFiles = Array.from(files).filter((f) => f.name.toLowerCase().endsWith(".csv"));
    if (csvFiles.length === 0) return;

    const newEntries: MultiFileQueueEntry[] = [];
    for (const f of csvFiles) {
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
      const detectedKey = confident ? results[0].source : null;
      const dbSource = detectedKey ? (detectedKey.startsWith("attribution") ? "attribution" : detectedKey) as SourceType : null;

      let mapping: Record<string, string> | undefined;
      if (dbSource) {
        const schema = getSchema(dbSource);
        if (schema) {
          const suggestions = generateMappingSuggestions(parsed.headers, schema, []);
          mapping = suggestionsToMapping(suggestions);
        }
      }

      newEntries.push({
        file: f,
        content,
        source: dbSource,
        headers: parsed.headers,
        totalRows: parsed.totalRows,
        needsSourcePick: !confident,
        detectionResults: results,
        mapping,
        status: "pending",
      });
    }

    if (newEntries.length > 0) {
      setMultiFileQueue((prev) => prev ? [...prev, ...newEntries] : newEntries);
    }
    if (addMoreInputRef.current) addMoreInputRef.current.value = "";
  }, []);

  const canContinue = isMapperReady &&
    !!mapperData.current &&
    Object.keys(mapperData.current.mapping).length > 0;

  // Derive step for multi-file mode (step indicator only)
  const displayStep: Step = multiFileQueue
    ? multiImportStarted
      ? 3
      : reviewingIndex !== null
        ? 2
        : multiFileQueue.some((e) => e.stitchResult)
          ? 2
          : 1
    : step;

  // ─── Render ────────────────────────────────────────────

  if (!sessionLoaded) return null;

  return (
    <div className="p-8 max-w-[960px]">
      {/* Header */}
      <div className="mb-8 animate-fade-in">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-text-primary">
          Upload Data
        </h1>
        <p className="mt-1 text-[13px] text-text-muted">
          Import revenue and customer data from your payment, booking, ticketing, or POS systems.
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
                  s === displayStep
                    ? "bg-surface-active text-text-on-active"
                    : s < displayStep
                      ? "bg-surface-muted text-text-secondary"
                      : "bg-surface-muted text-text-muted"
                )}
              >
                {s < displayStep ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  s
                )}
              </div>
              <span
                className={cn(
                  "ml-2 text-[12px] font-medium transition-colors",
                  s === displayStep
                    ? "text-text-primary"
                    : s < displayStep
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
                    s < displayStep ? "bg-text-muted" : "bg-surface-muted"
                  )}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step content */}
      <div className="animate-fade-in-up stagger-3">
        {/* Multi-file queue mode */}
        {multiFileQueue && reviewingIndex === null && (
          <div className="space-y-4">
            <p className="text-[13px] text-text-muted mb-4">
              {multiFileQueue.length} files queued for import
            </p>

            {/* Warnings: uncertain + flagged */}
            {multiFileQueue.some((e) => e.preflight && (e.preflight.uncertainRows > 0 || e.preflight.flaggedRows > 0)) && (
              <div className="space-y-2">
                {multiFileQueue.some((e) => e.preflight && e.preflight.uncertainRows > 0) && (
                  <div className="flex items-center gap-2 rounded-lg border border-amber-200 dark:border-amber-500/20 bg-amber-50/60 dark:bg-amber-500/5 px-3 py-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    <p className="text-[11px] text-amber-700 dark:text-amber-300">
                      {multiFileQueue.reduce((sum, e) => sum + (e.preflight?.uncertainRows ?? 0), 0)} rows need review across{" "}
                      {multiFileQueue.filter((e) => e.preflight && e.preflight.uncertainRows > 0).length} files
                    </p>
                  </div>
                )}
                {multiFileQueue.some((e) => e.preflight && e.preflight.flaggedRows > 0) && (
                  <div className="flex items-center gap-2 rounded-lg border border-rose-200 dark:border-rose-500/20 bg-rose-50/60 dark:bg-rose-500/5 px-3 py-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                    <p className="text-[11px] text-rose-700 dark:text-rose-300">
                      {multiFileQueue.reduce((sum, e) => sum + (e.preflight?.flaggedRows ?? 0), 0)} rows flagged (validation errors or missing identifiers)
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="rounded-xl border border-border-default overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border-muted bg-surface-elevated/50">
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-text-muted uppercase tracking-wider">File</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-text-muted uppercase tracking-wider">Source</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-text-muted uppercase tracking-wider text-right">Rows</th>
                    {multiFileQueue.some((e) => e.preflight) && (
                      <>
                        <th className="px-4 py-2.5 text-[11px] font-semibold text-text-muted uppercase tracking-wider text-right">New</th>
                        <th className="px-4 py-2.5 text-[11px] font-semibold text-text-muted uppercase tracking-wider text-right">Matched</th>
                        <th className="px-4 py-2.5 text-[11px] font-semibold text-text-muted uppercase tracking-wider text-right">Review</th>
                        <th className="px-4 py-2.5 text-[11px] font-semibold text-text-muted uppercase tracking-wider text-right">Flagged</th>
                      </>
                    )}
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-text-muted uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {multiFileQueue.map((entry, idx) => (
                    <tr key={idx} className="border-b border-border-muted last:border-b-0">
                      <td className="px-4 py-2.5 text-[13px] font-medium text-text-primary truncate max-w-[200px]">
                        {entry.file.name}
                      </td>
                      <td className="px-4 py-2.5">
                        {entry.source ? (
                          <span className="text-[12px] text-text-secondary">{entry.source}</span>
                        ) : entry.needsSourcePick ? (
                          <div className="flex gap-1">
                            {(["crm", "attribution", ...entry.detectionResults.map((r) => r.source)] as SourceType[]).slice(0, 4).map((s) => (
                              <button
                                key={s}
                                onClick={() => handleMultiSourcePick(idx, s)}
                                className="px-2 py-0.5 rounded text-[10px] font-medium border border-border-default text-text-secondary hover:bg-surface-elevated transition-colors"
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[12px] text-text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-[13px] text-right tabular-nums text-text-secondary">
                        {entry.totalRows}
                      </td>
                      {multiFileQueue.some((e) => e.preflight) && (
                        <>
                          <td className="px-4 py-2.5 text-[13px] text-right tabular-nums text-text-secondary">
                            {entry.preflight?.newRows ?? "—"}
                          </td>
                          <td className="px-4 py-2.5 text-[13px] text-right tabular-nums text-emerald-600">
                            {entry.preflight?.matchedRows ?? "—"}
                          </td>
                          <td className="px-4 py-2.5 text-[13px] text-right tabular-nums text-amber-600">
                            {entry.preflight ? (entry.preflight.uncertainRows > 0 ? entry.preflight.uncertainRows : "—") : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-[13px] text-right tabular-nums text-rose-600">
                            {entry.preflight ? (entry.preflight.flaggedRows > 0 ? entry.preflight.flaggedRows : "—") : "—"}
                          </td>
                        </>
                      )}
                      <td className="px-4 py-2.5">
                        {entry.status === "pending" && <span className="text-[11px] text-text-muted">Pending</span>}
                        {entry.status === "previewing" && <Loader2 className="h-3 w-3 text-text-muted animate-spin" />}
                        {entry.status === "ready" && !entry.reviewed && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                        {entry.status === "ready" && entry.reviewed && (
                          <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                            <CheckCircle2 className="h-3 w-3" /> Reviewed
                          </span>
                        )}
                        {entry.status === "importing" && (
                          <div className="flex items-center gap-2 min-w-[100px]">
                            <div className="flex-1">
                              <Progress value={importingFileIndex === idx ? fileImportProgress : 0} className="h-1" />
                            </div>
                            <span className="text-[10px] text-text-muted tabular-nums w-7 text-right">
                              {importingFileIndex === idx ? Math.round(fileImportProgress) : 0}%
                            </span>
                          </div>
                        )}
                        {entry.status === "done" && (
                          <span className="text-[11px] text-emerald-600 font-medium">
                            {entry.result?.importedRows} imported
                          </span>
                        )}
                        {entry.status === "error" && (
                          <span className="text-[11px] text-rose-600" title={entry.error}>Error</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Add more files */}
            {!multiImporting && !multiFileQueue.every((e) => e.status === "done" || e.status === "error") && (
              <div className="flex justify-center">
                <button
                  onClick={() => addMoreInputRef.current?.click()}
                  className="flex items-center gap-1.5 rounded-lg border border-dashed border-border-default px-3 py-1.5 text-[12px] text-text-muted hover:text-text-secondary hover:border-border-default hover:bg-surface-elevated/50 transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  Add more files
                </button>
                <input
                  ref={addMoreInputRef}
                  type="file"
                  accept=".csv"
                  multiple
                  onChange={(e) => handleAddMoreFiles(e.target.files)}
                  className="hidden"
                />
              </div>
            )}

            {/* Import progress summary */}
            {multiImporting && (
              <p className="text-[11px] text-text-muted text-center">
                {multiFileQueue.filter((e) => e.status === "done" || e.status === "error").length} of {multiFileQueue.length} files imported
              </p>
            )}

            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                onClick={() => { multiImportAbortRef.current = true; setMultiFileQueue(null); setReviewingIndex(null); setMultiImportStarted(false); setMultiImporting(false); setImportingFileIndex(null); clearUploadSession().catch(() => {}); }}
                className="text-[13px] text-text-muted hover:text-text-secondary"
              >
                Cancel
              </Button>
              <div className="flex items-center gap-2">
                {/* Phase 1: Preview All */}
                {multiFileQueue.some((e) => e.status === "pending" && !e.preflight) && (
                  <Button
                    onClick={handleMultiPreviewAll}
                    disabled={multiFileQueue.some((e) => !e.source) || multiFileQueue.some((e) => e.status === "previewing")}
                    className="text-[13px]"
                  >
                    {multiFileQueue.some((e) => e.status === "previewing") ? (
                      <>
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        Previewing...
                      </>
                    ) : (
                      "Preview All"
                    )}
                  </Button>
                )}
                {/* Phase 1→2: Review Files (after preview, before all reviewed) */}
                {multiFileQueue.some((e) => e.stitchResult) &&
                 !multiFileQueue.every((e) => e.reviewed || e.status === "error") &&
                 !multiFileQueue.every((e) => e.status === "done" || e.status === "error") &&
                 !multiFileQueue.some((e) => e.status === "previewing") && (
                  <Button
                    onClick={() => {
                      // Start reviewing from first non-reviewed, non-error file
                      const idx = multiFileQueue.findIndex((e) => !e.reviewed && e.stitchResult && e.status !== "error");
                      setReviewingIndex(idx >= 0 ? idx : 0);
                    }}
                    className="text-[13px]"
                  >
                    Review Files
                    <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Button>
                )}
                {/* Phase 3: Import All (all reviewed) */}
                {multiFileQueue.every((e) => e.reviewed || e.status === "error") &&
                 !multiFileQueue.every((e) => e.status === "done" || e.status === "error") && (
                  <Button
                    onClick={handleMultiImportAll}
                    disabled={multiImporting}
                    className="text-[13px]"
                  >
                    {multiImporting ? (
                      <>
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        Importing...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-1.5 h-4 w-4" />
                        Import All
                      </>
                    )}
                  </Button>
                )}
                {multiFileQueue.every((e) => e.status === "done" || e.status === "error") && (
                  <Button
                    onClick={() => { setMultiFileQueue(null); setReviewingIndex(null); setMultiImportStarted(false); setImportingFileIndex(null); clearUploadSession().catch(() => {}); }}
                    className="text-[13px]"
                  >
                    Done
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Phase 2: Per-file review */}
        {multiFileQueue && reviewingIndex !== null && (() => {
          const entry = multiFileQueue[reviewingIndex];
          const isFirst = reviewingIndex === 0;
          const isLast = reviewingIndex === multiFileQueue.length - 1;
          if (!entry?.stitchResult) return null;

          return (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[14px] font-medium text-text-primary">
                    File {reviewingIndex + 1} of {multiFileQueue.length} — {entry.file.name}
                  </p>
                  <p className="text-[12px] text-text-muted">
                    {entry.source} · {entry.totalRows} rows
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {multiFileQueue.map((e, i) => (
                    <div
                      key={i}
                      className={cn(
                        "h-2 w-2 rounded-full transition-colors",
                        i === reviewingIndex
                          ? "bg-surface-active"
                          : e.reviewed
                            ? "bg-emerald-500"
                            : "bg-surface-muted"
                      )}
                    />
                  ))}
                </div>
              </div>

              <StitchPreview
                result={entry.stitchResult}
                decisions={entry.stitchDecisions ?? {}}
                onDecisionsChange={(decisions) => {
                  setMultiFileQueue((prev) => {
                    if (!prev) return prev;
                    const next = [...prev];
                    next[reviewingIndex] = { ...next[reviewingIndex], stitchDecisions: decisions };
                    return next;
                  });
                }}
              />

              <div className="flex items-center justify-between pt-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (isFirst) {
                      // Back to file list
                      setReviewingIndex(null);
                    } else {
                      setReviewingIndex(reviewingIndex - 1);
                    }
                  }}
                  className="text-[13px] text-text-muted hover:text-text-secondary"
                >
                  <ArrowLeft className="mr-1.5 h-4 w-4" />
                  {isFirst ? "Back to File List" : "Previous File"}
                </Button>
                <Button
                  onClick={() => {
                    // Mark current file as reviewed
                    setMultiFileQueue((prev) => {
                      if (!prev) return prev;
                      const next = [...prev];
                      next[reviewingIndex] = { ...next[reviewingIndex], reviewed: true };
                      return next;
                    });
                    if (isLast) {
                      // Done reviewing → back to file list (Phase 3)
                      setReviewingIndex(null);
                    } else {
                      setReviewingIndex(reviewingIndex + 1);
                    }
                  }}
                  className="text-[13px]"
                >
                  {isLast ? (
                    <>
                      <CheckCircle2 className="mr-1.5 h-4 w-4" />
                      Done Reviewing
                    </>
                  ) : (
                    <>
                      Next File
                      <ArrowRight className="ml-1.5 h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          );
        })()}

        {/* Single file flow */}
        {!multiFileQueue && step === 1 && (
          <div className="space-y-4">
            <p className="text-[13px] text-text-muted mb-4">
              Upload a CSV export — the source type is auto-detected from the
              column headers
            </p>
            <UploadMapper
              onReady={handleMapperReady}
              onClear={handleMapperClear}
              onSaveTemplate={handleSaveTemplate}
              onMultipleFiles={handleMultipleFiles}
              initialData={restoredMapperData}
            />
          </div>
        )}

        {!multiFileQueue && step === 2 && stitchPreview && (
          <div className="space-y-4">
            {stitchPreview.summary.confidentMatches === 0 &&
            stitchPreview.summary.uncertainMatches === 0 &&
            stitchPreview.summary.newCustomers === 0 &&
            stitchPreview.summary.duplicateRows > 0 ? (
              <>
                <div className="flex flex-col items-center text-center py-8">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-500/10">
                    <Copy className="h-7 w-7 text-amber-600 dark:text-amber-400" />
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

        {!multiFileQueue && step === 3 && (
          <DetailedImportResultView
            result={importResult}
            isImporting={isImporting}
          />
        )}
      </div>

      {/* Navigation (hidden in multi-file mode) */}
      {!multiFileQueue && <div className="mt-8 flex items-center justify-between animate-fade-in-up stagger-4">
        <div>
          {step === 2 && (
            <Button
              variant="ghost"
              onClick={() => {
                setStep(1);
                if (mapperData.current) {
                  setRestoredMapperData({
                    fileName: mapperData.current.file.name,
                    fileSize: mapperData.current.file.size,
                    content: mapperData.current.content,
                    source: mapperData.current.source,
                    mapping: mapperData.current.mapping,
                    headers: mapperData.current.headers,
                    totalRows: mapperData.current.totalRows,
                  });
                }
              }}
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
      </div>}
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
  // Animated progress: starts fast, decelerates, caps at 90%
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!isImporting) {
      setProgress(0);
      return;
    }

    const HALF_LIFE = 15_000; // reaches ~50% at 15s, ~90% at ~50s
    const RATE = Math.LN2 / HALF_LIFE; // exponential decay constant
    const INTERVAL = 200;
    let elapsed = 0;

    const timer = setInterval(() => {
      elapsed += INTERVAL;
      // Exponential ease-out: fast start, continuously decelerates, never hits 100%
      setProgress(100 * (1 - Math.exp(-RATE * elapsed)));
    }, INTERVAL);

    return () => clearInterval(timer);
  }, [isImporting]);

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
          <p className="text-[12px] text-text-muted text-center mb-1.5 tabular-nums">
            {Math.round(progress)}%
          </p>
          <Progress value={progress} className="h-1.5" />
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
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-500/10">
              <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
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
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-500/10">
              <FileText className="h-7 w-7 text-amber-600 dark:text-amber-400" />
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
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 dark:bg-rose-500/10">
              <XCircle className="h-7 w-7 text-rose-600 dark:text-rose-400" />
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
        <div className="rounded-xl border border-rose-200 dark:border-rose-500/20 bg-rose-50/30 dark:bg-rose-500/5 overflow-hidden">
          <div className="border-b border-rose-100 dark:border-rose-500/20 px-5 py-3">
            <p className="text-[12px] font-medium text-rose-700 dark:text-rose-400">
              Errors ({result.errors.length})
            </p>
          </div>
          <div className="max-h-[200px] overflow-y-auto divide-y divide-rose-100 dark:divide-rose-500/20">
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
