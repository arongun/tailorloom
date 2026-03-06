import type { SourceType, SchemaKey, StitchPreviewResult, StitchDecisions } from "@/lib/types";
import type { DetectionResult } from "@/lib/csv/detect-source";
import { putBlob, getBlob, clearBlobs } from "@/lib/upload-store";

const STORAGE_KEY = "tailorloom-upload-session";
const TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

// ─── Public types ─────────────────────────────────────────

export interface MapperRestoredData {
  fileName: string;
  fileSize: number;
  content: string; // hydrated from IndexedDB on load
  source: SourceType;
  schemaKey?: SchemaKey;
  mapping: Record<string, string>;
  headers: string[];
  totalRows: number;
}

export interface MultiFileSessionEntry {
  fileName: string;
  fileSize: number;
  source: SourceType | null;
  headers: string[];
  totalRows: number;
  needsSourcePick: boolean;
  detectionResults: DetectionResult[];
  mapping?: Record<string, string>;
  stitchDecisions?: StitchDecisions;
  preflight?: { newRows: number; matchedRows: number; uncertainRows: number; flaggedRows: number; errorRows: number };
  reviewed?: boolean;
  status: "pending" | "ready" | "error";
  error?: string;
}

/** Full hydrated session (what callers work with) */
export interface UploadSessionFull {
  version: 2;
  savedAt: number;
  step: 1 | 2;
  mapper: MapperRestoredData | null;
  stitch: { preview: StitchPreviewResult; decisions: StitchDecisions } | null;
  multiQueue: MultiFileSessionEntry[] | null;
  multiReviewingIndex: number | null;
  /** Per multi-file entry: content hydrated from IndexedDB */
  multiContents?: (string | null)[];
  /** Per multi-file entry: stitchResult hydrated from IndexedDB */
  multiStitchResults?: (StitchPreviewResult | null)[];
}

/** Lightweight metadata stored in localStorage (no large payloads) */
interface UploadSessionMeta {
  version: 2;
  savedAt: number;
  step: 1 | 2;
  mapper: Omit<MapperRestoredData, "content"> | null;
  stitch: { decisions: StitchDecisions } | null;
  multiQueue: MultiFileSessionEntry[] | null;
  multiReviewingIndex: number | null;
}

// ─── Save ─────────────────────────────────────────────────

export async function saveUploadSession(session: UploadSessionFull): Promise<void> {
  try {
    // 1. Store large blobs in IndexedDB
    if (session.mapper?.content) {
      await putBlob("v2:single:content", session.mapper.content);
    }
    if (session.stitch?.preview) {
      await putBlob("v2:single:stitch", session.stitch.preview);
    }

    // Multi-file blobs
    if (session.multiQueue && session.multiContents) {
      for (let i = 0; i < session.multiQueue.length; i++) {
        const content = session.multiContents[i];
        if (content) await putBlob(`v2:multi:${i}:content`, content);
      }
    }
    if (session.multiQueue && session.multiStitchResults) {
      for (let i = 0; i < session.multiQueue.length; i++) {
        const sr = session.multiStitchResults[i];
        if (sr) await putBlob(`v2:multi:${i}:stitch`, sr);
      }
    }

    // 2. Build lightweight metadata (strip content/preview)
    const meta: UploadSessionMeta = {
      version: 2,
      savedAt: Date.now(),
      step: session.step,
      mapper: session.mapper
        ? {
            fileName: session.mapper.fileName,
            fileSize: session.mapper.fileSize,
            source: session.mapper.source,
            schemaKey: session.mapper.schemaKey,
            mapping: session.mapper.mapping,
            headers: session.mapper.headers,
            totalRows: session.mapper.totalRows,
          }
        : null,
      stitch: session.stitch ? { decisions: session.stitch.decisions } : null,
      multiQueue: session.multiQueue,
      multiReviewingIndex: session.multiReviewingIndex,
    };

    // 3. Write to localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(meta));
  } catch (err) {
    // Non-fatal — quota exceeded or IDB failure
    if (typeof window !== "undefined" && err instanceof DOMException && err.name === "QuotaExceededError") {
      console.warn("[upload-session] localStorage quota exceeded");
    }
  }
}

// ─── Load ─────────────────────────────────────────────────

export async function loadUploadSession(): Promise<UploadSessionFull | null> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);

    // Migrate v1 → discard (too different to safely migrate)
    if (parsed.version === 1 || parsed.version === undefined) {
      clearUploadSession();
      return null;
    }

    const meta: UploadSessionMeta = parsed;

    if (meta.version !== 2) {
      clearUploadSession();
      return null;
    }

    // TTL check
    if (Date.now() - meta.savedAt > TTL_MS) {
      clearUploadSession();
      return null;
    }

    // Hydrate single-file blobs from IndexedDB
    let content: string | null = null;
    let stitchPreview: StitchPreviewResult | null = null;

    if (meta.mapper) {
      content = await getBlob<string>("v2:single:content");
      if (!content) {
        // Can't recover without CSV content — clear and bail
        await clearUploadSession();
        return null;
      }
    }

    if (meta.stitch) {
      stitchPreview = await getBlob<StitchPreviewResult>("v2:single:stitch");
      if (!stitchPreview) {
        // Lost stitch preview — drop back to step 1
        meta.step = 1;
        meta.stitch = null;
      }
    }

    // Hydrate multi-file blobs
    let multiContents: (string | null)[] | undefined;
    let multiStitchResults: (StitchPreviewResult | null)[] | undefined;
    let multiQueue = meta.multiQueue;

    if (multiQueue) {
      multiContents = [];
      multiStitchResults = [];

      const surviving: MultiFileSessionEntry[] = [];
      const survivingContents: (string | null)[] = [];
      const survivingStitchResults: (StitchPreviewResult | null)[] = [];

      for (let i = 0; i < multiQueue.length; i++) {
        const entry = multiQueue[i];

        // Normalize transient statuses
        let status = entry.status;
        if (status as string === "previewing") status = "pending";
        if (status as string === "importing") status = "ready";

        // Skip terminal entries
        if (status as string === "done") continue;

        const entryContent = await getBlob<string>(`v2:multi:${i}:content`);
        if (!entryContent) {
          // Content lost — mark as error
          surviving.push({ ...entry, status: "error", error: "Needs re-upload — file data lost" });
          survivingContents.push(null);
          survivingStitchResults.push(null);
          continue;
        }

        const entryStitch = await getBlob<StitchPreviewResult>(`v2:multi:${i}:stitch`);

        // If stitch result is missing but entry was "ready", downgrade to "pending"
        if (!entryStitch && status === "ready") {
          status = "pending";
        }

        surviving.push({ ...entry, status });
        survivingContents.push(entryContent);
        survivingStitchResults.push(entryStitch);
      }

      if (surviving.length === 0) {
        multiQueue = null;
        multiContents = undefined;
        multiStitchResults = undefined;
      } else {
        multiQueue = surviving;
        multiContents = survivingContents;
        multiStitchResults = survivingStitchResults;
      }
    }

    const session: UploadSessionFull = {
      version: 2,
      savedAt: meta.savedAt,
      step: meta.step,
      mapper: meta.mapper && content
        ? { ...meta.mapper, content }
        : null,
      stitch: meta.stitch && stitchPreview
        ? { preview: stitchPreview, decisions: meta.stitch.decisions }
        : null,
      multiQueue: multiQueue,
      multiReviewingIndex: multiQueue ? meta.multiReviewingIndex : null,
      multiContents,
      multiStitchResults,
    };

    return session;
  } catch {
    await clearUploadSession().catch(() => {});
    return null;
  }
}

// ─── Clear ────────────────────────────────────────────────

export async function clearUploadSession(): Promise<void> {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Silently fail
  }
  try {
    await clearBlobs();
  } catch {
    // Silently fail
  }
}
