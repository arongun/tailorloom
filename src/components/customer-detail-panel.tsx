"use client";

import { useEffect, useCallback } from "react";
import { X, Loader2 } from "lucide-react";
import { useCustomerDetail } from "@/hooks/use-customer-detail";
import { CustomerDetailContent } from "@/components/customer-detail-content";

interface CustomerDetailPanelProps {
  open: boolean;
  onClose: () => void;
  customerId: string | null;
  profileParam?: string;
}

export function CustomerDetailPanel({
  open,
  onClose,
  customerId,
  profileParam,
}: CustomerDetailPanelProps) {
  const {
    detail,
    loading,
    expandedTxId,
    setExpandedTxId,
    rawDataExpanded,
    setRawDataExpanded,
    expandedSources,
    setExpandedSources,
    groupedSources,
  } = useCustomerDetail(customerId, profileParam, open);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !open) return;
      if (e.defaultPrevented) return;

      const target = e.target as HTMLElement;
      const tag = target.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || target.contentEditable === "true") return;
      if (target.closest("[data-radix-popper-content-wrapper]")) return;

      e.preventDefault();
      onClose();
    },
    [open, onClose],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div
      role="region"
      aria-label="Customer details"
      aria-hidden={!open}
      // @ts-expect-error -- inert is a valid HTML attribute, React types lag behind
      inert={!open ? "" : undefined}
      className={`fixed inset-y-0 right-0 z-30 w-full max-w-[540px] bg-surface border-l border-border-default shadow-lg transition-transform duration-300 ease-in-out ${
        open ? "translate-x-0" : "translate-x-full pointer-events-none"
      }`}
    >
      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-10 rounded-sm p-1 opacity-70 hover:opacity-100 transition-opacity cursor-pointer"
        aria-label="Close panel"
      >
        <X className="h-4 w-4 text-text-primary" />
      </button>

      {/* Scrollable content */}
      <div className="h-full overflow-y-auto px-6 pt-6 pb-6">
        {loading && (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-6 w-6 text-text-muted animate-spin" />
          </div>
        )}
        {!loading && detail && (
          <CustomerDetailContent
            detail={detail}
            expandedTxId={expandedTxId}
            setExpandedTxId={setExpandedTxId}
            rawDataExpanded={rawDataExpanded}
            setRawDataExpanded={setRawDataExpanded}
            expandedSources={expandedSources}
            setExpandedSources={setExpandedSources}
            groupedSources={groupedSources}
          />
        )}
        {!loading && !detail && open && customerId && (
          <div className="flex items-center justify-center h-64">
            <p className="text-[13px] text-text-muted">
              Customer not found.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
