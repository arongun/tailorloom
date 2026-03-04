"use client";

import { Loader2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useCustomerDetail } from "@/hooks/use-customer-detail";
import { CustomerDetailContent } from "@/components/customer-detail-content";

interface CustomerDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string | null;
  profileParam?: string;
}

export function CustomerDetailSheet({
  open,
  onOpenChange,
  customerId,
  profileParam,
}: CustomerDetailSheetProps) {
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[480px] sm:w-[540px] overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-6 w-6 text-text-muted animate-spin" />
          </div>
        )}
        {!loading && detail && (
          <div className="px-6 pb-6">
            <SheetHeader className="pb-4 px-0">
              <SheetTitle className="sr-only">
                {detail.customer.full_name || detail.customer.email || "Customer Details"}
              </SheetTitle>
            </SheetHeader>
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
          </div>
        )}
        {!loading && !detail && (
          <div className="flex items-center justify-center h-64">
            <p className="text-[13px] text-text-muted">
              Customer not found.
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
