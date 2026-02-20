"use client";

import { useState, useCallback, useRef } from "react";
import { Upload, FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface UploadZoneProps {
  onFileSelected: (file: File, content: string) => void;
  file: File | null;
  onClear: () => void;
}

export function UploadZone({ onFileSelected, file, onClear }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    (f: File) => {
      setError(null);

      if (!f.name.toLowerCase().endsWith(".csv")) {
        setError("Only CSV files are supported");
        return;
      }

      if (f.size > 10 * 1024 * 1024) {
        setError("File too large (max 10 MB)");
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        if (!content || content.trim().length === 0) {
          setError("File is empty");
          return;
        }
        onFileSelected(f, content);
      };
      reader.onerror = () => setError("Failed to read file");
      reader.readAsText(f);
    },
    [onFileSelected]
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

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) processFile(f);
    },
    [processFile]
  );

  if (file) {
    const sizeKB = (file.size / 1024).toFixed(1);
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-50">
              <FileText className="h-5 w-5 text-emerald-600" strokeWidth={1.8} />
            </div>
            <div>
              <p className="text-[13px] font-medium text-slate-900">
                {file.name}
              </p>
              <p className="text-[12px] text-slate-400">{sizeKB} KB</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClear}
            className="h-8 w-8 text-slate-400 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
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
            {isDragging ? "Drop your file here" : "Drag & drop your CSV file"}
          </p>
          <p className="mt-1 text-[12px] text-slate-400">
            or{" "}
            <span className="font-medium text-slate-500 underline underline-offset-2">
              browse files
            </span>{" "}
            — up to 10 MB
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        onChange={handleInputChange}
        className="hidden"
      />

      {error && (
        <p className="mt-3 text-[12px] font-medium text-rose-600">{error}</p>
      )}
    </div>
  );
}
