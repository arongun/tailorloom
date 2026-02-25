import type { SourceType, StitchPreviewResult, StitchDecisions } from "@/lib/types";

const STORAGE_KEY = "tailorloom-upload-session";
const TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

export interface MapperRestoredData {
  fileName: string;
  fileSize: number;
  content: string;
  source: SourceType;
  mapping: Record<string, string>;
  headers: string[];
  totalRows: number;
}

export interface UploadSession {
  version: 1;
  savedAt: number;
  step: 1 | 2;
  mapper: MapperRestoredData | null;
  stitch: {
    preview: StitchPreviewResult;
    decisions: StitchDecisions;
  } | null;
}

export function saveUploadSession(session: UploadSession): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Silently fail (QuotaExceededError for large CSVs, localStorage disabled, etc.)
  }
}

export function loadUploadSession(): UploadSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const session: UploadSession = JSON.parse(raw);

    if (session.version !== 1) {
      clearUploadSession();
      return null;
    }

    if (Date.now() - session.savedAt > TTL_MS) {
      clearUploadSession();
      return null;
    }

    return session;
  } catch {
    clearUploadSession();
    return null;
  }
}

export function clearUploadSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Silently fail
  }
}
