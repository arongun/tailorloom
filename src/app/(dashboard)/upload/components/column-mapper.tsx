"use client";

import { useState, useMemo, useEffect } from "react";
import { Check, AlertCircle, HelpCircle, Save, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { MappingSuggestion, SourceSchema, SavedMapping } from "@/lib/types";

interface ColumnMapperProps {
  suggestions: MappingSuggestion[];
  schema: SourceSchema;
  headers: string[];
  savedMappings: SavedMapping[];
  onMappingChange: (mapping: Record<string, string>) => void;
  onSaveTemplate: (name: string) => void;
}

function confidenceBadge(confidence: number) {
  if (confidence >= 0.8)
    return (
      <Badge
        variant="outline"
        className="ml-2 border-emerald-200 bg-emerald-50 text-emerald-700 text-[10px] font-medium px-1.5 py-0"
      >
        <Check className="mr-0.5 h-3 w-3" />
        {Math.round(confidence * 100)}%
      </Badge>
    );
  if (confidence >= 0.5)
    return (
      <Badge
        variant="outline"
        className="ml-2 border-amber-200 bg-amber-50 text-amber-700 text-[10px] font-medium px-1.5 py-0"
      >
        <AlertCircle className="mr-0.5 h-3 w-3" />
        {Math.round(confidence * 100)}%
      </Badge>
    );
  if (confidence > 0)
    return (
      <Badge
        variant="outline"
        className="ml-2 border-rose-200 bg-rose-50 text-rose-700 text-[10px] font-medium px-1.5 py-0"
      >
        <HelpCircle className="mr-0.5 h-3 w-3" />
        {Math.round(confidence * 100)}%
      </Badge>
    );
  return null;
}

export function ColumnMapper({
  suggestions,
  schema,
  headers,
  savedMappings,
  onMappingChange,
  onSaveTemplate,
}: ColumnMapperProps) {
  // Build initial mapping from suggestions
  const [mapping, setMapping] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const s of suggestions) {
      if (s.schemaField) m[s.csvHeader] = s.schemaField;
    }
    return m;
  });

  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");

  // Re-initialize when suggestions change
  useEffect(() => {
    const m: Record<string, string> = {};
    for (const s of suggestions) {
      if (s.schemaField) m[s.csvHeader] = s.schemaField;
    }
    setMapping(m);
  }, [suggestions]);

  // Track which schema fields are already used
  const usedFields = useMemo(() => {
    return new Set(Object.values(mapping));
  }, [mapping]);

  // Check required fields coverage
  const requiredFields = schema.fields.filter((f) => f.required);
  const missingRequired = requiredFields.filter(
    (f) => !usedFields.has(f.key)
  );

  // Build suggestion confidence lookup
  const confidenceMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of suggestions) {
      m.set(s.csvHeader, s.confidence);
    }
    return m;
  }, [suggestions]);

  const handleFieldChange = (csvHeader: string, schemaField: string) => {
    const newMapping = { ...mapping };
    if (schemaField === "__none__") {
      delete newMapping[csvHeader];
    } else {
      // Remove any other header mapped to this field
      for (const [k, v] of Object.entries(newMapping)) {
        if (v === schemaField && k !== csvHeader) {
          delete newMapping[k];
        }
      }
      newMapping[csvHeader] = schemaField;
    }
    setMapping(newMapping);
    onMappingChange(newMapping);
  };

  const handleLoadSavedMapping = (saved: SavedMapping) => {
    setMapping(saved.mapping);
    onMappingChange(saved.mapping);
  };

  const handleSaveTemplate = () => {
    if (!templateName.trim()) return;
    onSaveTemplate(templateName.trim());
    setSaveDialogOpen(false);
    setTemplateName("");
  };

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {savedMappings.length > 0 && (
            <Select
              onValueChange={(id) => {
                const saved = savedMappings.find((m) => m.id === id);
                if (saved) handleLoadSavedMapping(saved);
              }}
            >
              <SelectTrigger className="h-8 w-[200px] text-[12px] border-slate-200">
                <FolderOpen className="mr-1.5 h-3.5 w-3.5 text-slate-400" />
                <SelectValue placeholder="Load saved mapping" />
              </SelectTrigger>
              <SelectContent>
                {savedMappings.map((m) => (
                  <SelectItem key={m.id} value={m.id} className="text-[12px]">
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSaveDialogOpen(true)}
          className="h-8 text-[12px] border-slate-200"
        >
          <Save className="mr-1.5 h-3.5 w-3.5" />
          Save as template
        </Button>
      </div>

      {/* Missing required fields warning */}
      {missingRequired.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div>
            <p className="text-[12px] font-medium text-amber-800">
              Required fields not mapped
            </p>
            <p className="mt-0.5 text-[11px] text-amber-600">
              {missingRequired.map((f) => f.label).join(", ")}
            </p>
          </div>
        </div>
      )}

      {/* Mapping rows */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[1fr,auto,1fr] items-center gap-4 border-b border-slate-100 bg-slate-50/50 px-5 py-3">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            CSV Column
          </p>
          <div className="w-6" />
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Maps to
          </p>
        </div>

        {/* Rows */}
        {headers.map((header) => {
          const currentField = mapping[header];
          const confidence = confidenceMap.get(header) ?? 0;
          return (
            <div
              key={header}
              className="grid grid-cols-[1fr,auto,1fr] items-center gap-4 border-b border-slate-50 px-5 py-3 last:border-b-0"
            >
              {/* CSV header */}
              <div className="flex items-center min-w-0">
                <code className="truncate text-[12px] font-mono text-slate-700 bg-slate-50 rounded px-2 py-1">
                  {header}
                </code>
                {currentField && confidenceBadge(confidence)}
              </div>

              {/* Arrow */}
              <div className="flex items-center justify-center">
                <div
                  className={cn(
                    "h-px w-6",
                    currentField ? "bg-slate-300" : "bg-slate-100"
                  )}
                />
              </div>

              {/* Schema field selector */}
              <Select
                value={currentField ?? "__none__"}
                onValueChange={(val) => handleFieldChange(header, val)}
              >
                <SelectTrigger
                  className={cn(
                    "h-9 text-[12px] border-slate-200",
                    !currentField && "text-slate-400"
                  )}
                >
                  <SelectValue placeholder="Skip this column" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" className="text-[12px] text-slate-400">
                    Skip this column
                  </SelectItem>
                  {schema.fields.map((field) => {
                    const isUsed = usedFields.has(field.key) && field.key !== currentField;
                    return (
                      <SelectItem
                        key={field.key}
                        value={field.key}
                        disabled={isUsed}
                        className="text-[12px]"
                      >
                        <span className="flex items-center gap-2">
                          {field.label}
                          {field.required && (
                            <span className="text-[10px] text-rose-500">*</span>
                          )}
                          {isUsed && (
                            <span className="text-[10px] text-slate-400">
                              (mapped)
                            </span>
                          )}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
          High confidence (80%+)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
          Medium (50-80%)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-rose-400" />
          Low (&lt;50%)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-rose-500">*</span> Required field
        </span>
      </div>

      {/* Save template dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle className="text-[14px]">Save mapping template</DialogTitle>
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
              This template will auto-load when you upload a similar CSV.
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
