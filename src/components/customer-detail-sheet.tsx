"use client";

import { useState, useEffect } from "react";
import {
  Loader2,
  CreditCard,
  Calendar,
  UserCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getCustomerDetail } from "@/lib/actions/dashboard";
import type { CustomerDetail } from "@/lib/actions/dashboard";

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  stripe: { label: "Stripe", color: "bg-violet-50 text-violet-700" },
  calendly: { label: "Calendly", color: "bg-blue-50 text-blue-700" },
  passline: { label: "PassLine", color: "bg-orange-50 text-orange-700" },
  pos: { label: "POS", color: "bg-emerald-50 text-emerald-700" },
  wetravel: { label: "WeTravel", color: "bg-cyan-50 text-cyan-700" },
  manual: { label: "Manual", color: "bg-surface-muted text-text-secondary" },
};

const TRANSACTION_ICONS: Record<string, typeof CreditCard> = {
  payment: CreditCard,
  booking: Calendar,
  attendance: UserCheck,
};

interface CustomerDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string | null;
}

export function CustomerDetailSheet({
  open,
  onOpenChange,
  customerId,
}: CustomerDetailSheetProps) {
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && customerId) {
      setLoading(true);
      setDetail(null);
      getCustomerDetail(customerId)
        .then((d) => setDetail(d))
        .catch(() => setDetail(null))
        .finally(() => setLoading(false));
    }
  }, [open, customerId]);

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      Active: "bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
      "At Risk": "bg-amber-50 text-amber-700 hover:bg-amber-50",
      Churned: "bg-rose-50 text-rose-700 hover:bg-rose-50",
    };
    return (
      <Badge
        variant="secondary"
        className={`text-[11px] font-medium ${styles[status]}`}
      >
        {status}
      </Badge>
    );
  };

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
              <SheetTitle className="text-lg font-semibold text-text-primary">
                {detail.customer.full_name || "Unknown Customer"}
              </SheetTitle>
              <p className="text-[12px] text-text-muted">
                {detail.customer.email || "No email"}
              </p>
              {detail.customer.phone && (
                <p className="text-[12px] text-text-muted">
                  {detail.customer.phone}
                </p>
              )}
              {detail.customer.sources.length > 0 && (
                <div className="flex items-center gap-1.5 mt-2">
                  {detail.customer.sources.map((s) => {
                    const info = SOURCE_LABELS[s] ?? {
                      label: s,
                      color: "bg-surface-muted text-text-secondary",
                    };
                    return (
                      <Badge
                        key={s}
                        variant="secondary"
                        className={`text-[10px] font-medium px-1.5 py-0 ${info.color}`}
                      >
                        {info.label}
                      </Badge>
                    );
                  })}
                </div>
              )}
            </SheetHeader>

            <div className="grid grid-cols-3 gap-3 mb-6">
              <Card className="border-border-default shadow-none">
                <CardContent className="p-3">
                  <p className="text-[10px] font-medium tracking-wide text-text-muted uppercase mb-1">
                    Revenue
                  </p>
                  <p className="text-[16px] font-semibold text-text-primary tabular-nums">
                    ${detail.customer.totalRevenue.toLocaleString()}
                  </p>
                </CardContent>
              </Card>
              <Card className="border-border-default shadow-none">
                <CardContent className="p-3">
                  <p className="text-[10px] font-medium tracking-wide text-text-muted uppercase mb-1">
                    Purchases
                  </p>
                  <p className="text-[16px] font-semibold text-text-primary tabular-nums">
                    {detail.customer.purchaseCount}
                  </p>
                </CardContent>
              </Card>
              <Card className="border-border-default shadow-none">
                <CardContent className="p-3">
                  <p className="text-[10px] font-medium tracking-wide text-text-muted uppercase mb-1">
                    Status
                  </p>
                  <div className="mt-0.5">
                    {statusBadge(detail.customer.status)}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Separator className="mb-6" />

            <div>
              <h3 className="text-[13px] font-semibold text-text-primary mb-4">
                Activity History
              </h3>
              <div className="space-y-3">
                {detail.transactions.map((tx) => {
                  const Icon =
                    TRANSACTION_ICONS[tx.type] ?? CreditCard;
                  const sourceInfo = SOURCE_LABELS[tx.source] ?? {
                    label: tx.source,
                    color: "bg-surface-muted text-text-secondary",
                  };
                  return (
                    <div
                      key={tx.id}
                      className="flex items-start justify-between rounded-lg border border-border-muted p-3"
                    >
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-surface-elevated mt-0.5">
                          <Icon className="h-3.5 w-3.5 text-text-muted" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-text-primary truncate">
                            {tx.description}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge
                              variant="secondary"
                              className={`text-[10px] font-medium px-1.5 py-0 ${sourceInfo.color}`}
                            >
                              {sourceInfo.label}
                            </Badge>
                            <span className="text-[11px] text-text-muted">
                              {new Date(tx.date).toLocaleDateString(
                                "en-US",
                                {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                }
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                      {tx.amount !== null && (
                        <p className="text-[14px] font-semibold text-text-primary tabular-nums ml-4">
                          $
                          {tx.amount.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                          })}
                        </p>
                      )}
                    </div>
                  );
                })}
                {detail.transactions.length === 0 && (
                  <p className="text-[13px] text-text-muted text-center py-8">
                    No activity history available.
                  </p>
                )}
              </div>
            </div>
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
