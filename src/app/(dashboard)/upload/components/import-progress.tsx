"use client";

import { CheckCircle2, XCircle, SkipForward, FileText, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { ImportResult } from "@/lib/types";

interface ImportProgressProps {
  result: ImportResult | null;
  isImporting: boolean;
}

export function ImportProgress({ result, isImporting }: ImportProgressProps) {
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

  const isFullSuccess = result.errorRows === 0;
  const isPartial = result.importedRows > 0 && result.errorRows > 0;

  return (
    <div className="space-y-6">
      {/* Hero status */}
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

      {/* Error list */}
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
                  <span className="font-mono text-rose-400">Row {err.row}</span>
                  {err.field && (
                    <span className="text-rose-400"> &middot; {err.field}</span>
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
