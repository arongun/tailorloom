"use client";

import { useState, useEffect } from "react";
import {
  Loader2,
  CreditCard,
  Calendar,
  UserCheck,
  ChevronDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { riskBadge, tierBadge } from "@/components/badge-helpers";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getCustomerDetail } from "@/lib/actions/dashboard";
import type { CustomerDetail } from "@/lib/types/dashboard";

type TransactionDetail = CustomerDetail["transactions"][number];

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  stripe: { label: "Stripe", color: "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400" },
  calendly: { label: "Calendly", color: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400" },
  passline: { label: "PassLine", color: "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400" },
  pos: { label: "POS", color: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" },
  wetravel: { label: "WeTravel", color: "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-400" },
  manual: { label: "Manual", color: "bg-surface-muted text-text-secondary" },
};

const TRANSACTION_ICONS: Record<string, typeof CreditCard> = {
  payment: CreditCard,
  booking: Calendar,
  attendance: UserCheck,
};

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-text-muted uppercase tracking-wide mb-0.5">
        {label}
      </p>
      <p className="text-[12px] text-text-primary break-words">
        {value}
      </p>
    </div>
  );
}

function formatTimestamp(dateStr: string) {
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function TransactionDetailPanel({
  tx,
  rawDataExpanded,
  onToggleRawData,
}: {
  tx: TransactionDetail;
  rawDataExpanded: boolean;
  onToggleRawData: () => void;
}) {
  const hasRawData =
    tx.raw_data && typeof tx.raw_data === "object" && Object.keys(tx.raw_data).length > 0;

  const hasAttribution =
    tx.utm_source || tx.utm_medium || tx.utm_campaign || tx.utm_content ||
    tx.referrer || tx.referral_partner || tx.lead_source_channel || tx.lead_capture_method;

  return (
    <div className="border-t border-border-muted bg-surface-muted/50 px-3 py-3 space-y-3">
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {/* Payment fields */}
        {tx.type === "payment" && (
          <>
            {tx.external_payment_id && (
              <DetailRow label="Payment ID" value={tx.external_payment_id} />
            )}
            {tx.payment_type && (
              <DetailRow label="Type" value={tx.payment_type} />
            )}
            {tx.status && (
              <DetailRow label="Status" value={tx.status} />
            )}
            {tx.amount !== null && (
              <DetailRow
                label="Amount"
                value={`$${tx.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}${tx.currency ? ` ${tx.currency.toUpperCase()}` : ""}`}
              />
            )}
            <DetailRow label="Date" value={formatTimestamp(tx.date)} />
            <DetailRow label="Source" value={SOURCE_LABELS[tx.source]?.label ?? tx.source} />
          </>
        )}

        {/* Booking fields */}
        {tx.type === "booking" && (
          <>
            {tx.external_booking_id && (
              <DetailRow label="Booking ID" value={tx.external_booking_id} />
            )}
            {tx.event_type && (
              <div className="col-span-2">
                <DetailRow label="Event" value={tx.event_type} />
              </div>
            )}
            {tx.status && (
              <DetailRow label="Status" value={tx.status} />
            )}
            {tx.start_time && (
              <DetailRow label="Start" value={formatTimestamp(tx.start_time)} />
            )}
            {tx.end_time && (
              <DetailRow label="End" value={formatTimestamp(tx.end_time)} />
            )}
            {(tx.start_date || tx.end_date) && (
              <DetailRow
                label="Dates"
                value={[tx.start_date, tx.end_date].filter(Boolean).join(" → ")}
              />
            )}
            <DetailRow label="Source" value={SOURCE_LABELS[tx.source]?.label ?? tx.source} />
          </>
        )}

        {/* Attendance fields */}
        {tx.type === "attendance" && (
          <>
            {tx.external_attendance_id && (
              <DetailRow label="Attendance ID" value={tx.external_attendance_id} />
            )}
            {tx.event_name && (
              <DetailRow label="Event" value={tx.event_name} />
            )}
            {tx.ticket_type && (
              <DetailRow label="Ticket Type" value={tx.ticket_type} />
            )}
            <DetailRow label="Check-in" value={formatTimestamp(tx.date)} />
            <DetailRow label="Source" value={SOURCE_LABELS[tx.source]?.label ?? tx.source} />
          </>
        )}
      </div>

      {/* Attribution section for bookings */}
      {tx.type === "booking" && hasAttribution && (
        <div>
          <p className="text-[11px] text-text-muted uppercase tracking-wide font-medium mb-2">
            Attribution
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            {tx.utm_source && <DetailRow label="UTM Source" value={tx.utm_source} />}
            {tx.utm_medium && <DetailRow label="UTM Medium" value={tx.utm_medium} />}
            {tx.utm_campaign && <DetailRow label="UTM Campaign" value={tx.utm_campaign} />}
            {tx.utm_content && <DetailRow label="UTM Content" value={tx.utm_content} />}
            {tx.referrer && <DetailRow label="Referrer" value={tx.referrer} />}
            {tx.referral_partner && <DetailRow label="Referral Partner" value={tx.referral_partner} />}
            {tx.lead_source_channel && <DetailRow label="Lead Channel" value={tx.lead_source_channel} />}
            {tx.lead_capture_method && <DetailRow label="Lead Capture" value={tx.lead_capture_method} />}
          </div>
        </div>
      )}

      {/* Raw data section */}
      {hasRawData && (
        <div>
          <button
            type="button"
            className="flex items-center gap-1 text-[11px] text-text-muted uppercase tracking-wide font-medium cursor-pointer hover:text-text-secondary transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onToggleRawData();
            }}
          >
            Raw Data
            <ChevronDown
              className={`h-3 w-3 transition-transform duration-150 ${
                rawDataExpanded ? "rotate-180" : ""
              }`}
            />
          </button>
          <div
            className="grid transition-[grid-template-rows] duration-150 ease-out"
            style={{
              gridTemplateRows: rawDataExpanded ? "1fr" : "0fr",
            }}
          >
            <div className="overflow-hidden">
              {rawDataExpanded && (
                <pre className="text-[11px] text-text-primary bg-surface-elevated rounded-md p-3 overflow-x-auto max-h-[200px] mt-2">
                  {JSON.stringify(tx.raw_data, null, 2)}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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
  const [expandedTxId, setExpandedTxId] = useState<string | null>(null);
  const [rawDataExpanded, setRawDataExpanded] = useState(false);

  useEffect(() => {
    if (open && customerId) {
      setLoading(true);
      setDetail(null);
      setExpandedTxId(null);
      setRawDataExpanded(false);
      getCustomerDetail(customerId)
        .then((d) => setDetail(d))
        .catch(() => setDetail(null))
        .finally(() => setLoading(false));
    }
  }, [open, customerId]);

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
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
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

            <div className="grid grid-cols-2 gap-3 mb-6">
              <Card className="border-border-default shadow-none">
                <CardContent className="p-3">
                  <p className="text-[10px] font-medium tracking-wide text-text-muted uppercase mb-1">
                    Lifetime Revenue
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
                    Revenue Tier
                  </p>
                  <div className="mt-0.5">
                    {tierBadge(detail.customer.revenue_tier)}
                  </div>
                </CardContent>
              </Card>
              <Card className="border-border-default shadow-none">
                <CardContent className="p-3">
                  <p className="text-[10px] font-medium tracking-wide text-text-muted uppercase mb-1">
                    Risk Status
                  </p>
                  <div className="mt-0.5">
                    {riskBadge(detail.customer.risk_status)}
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
                  const isRefunded = tx.status === "refunded";
                  const isFailed = tx.status === "failed";
                  const isNonRevenue = isRefunded || isFailed;
                  const isExpanded = expandedTxId === tx.id;
                  return (
                    <div
                      key={tx.id}
                      className={`rounded-lg border transition-colors ${
                        isNonRevenue
                          ? "border-border-muted/60 opacity-60"
                          : isExpanded
                            ? "border-border-default"
                            : "border-border-muted"
                      }`}
                    >
                      <button
                        type="button"
                        className="flex items-start justify-between w-full p-3 cursor-pointer text-left hover:bg-surface-muted/30 rounded-lg transition-colors"
                        onClick={() => {
                          if (isExpanded) {
                            setExpandedTxId(null);
                          } else {
                            setExpandedTxId(tx.id);
                            setRawDataExpanded(false);
                          }
                        }}
                      >
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-surface-elevated mt-0.5 shrink-0">
                            <Icon className="h-3.5 w-3.5 text-text-muted" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-[13px] font-medium truncate ${
                              isNonRevenue
                                ? "text-text-muted line-through"
                                : "text-text-primary"
                            }`}>
                              {tx.description}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge
                                variant="secondary"
                                className={`text-[10px] font-medium px-1.5 py-0 ${sourceInfo.color}`}
                              >
                                {sourceInfo.label}
                              </Badge>
                              {isRefunded && (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] font-medium px-1.5 py-0 bg-rose-50 text-rose-600"
                                >
                                  Refunded
                                </Badge>
                              )}
                              {isFailed && (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] font-medium px-1.5 py-0 bg-surface-muted text-text-muted"
                                >
                                  Failed
                                </Badge>
                              )}
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
                        <div className="flex items-center gap-2 ml-4 shrink-0">
                          {tx.amount !== null && (
                            <p className={`text-[14px] font-semibold tabular-nums ${
                              isNonRevenue
                                ? "text-text-muted line-through"
                                : "text-text-primary"
                            }`}>
                              $
                              {tx.amount.toLocaleString("en-US", {
                                minimumFractionDigits: 2,
                              })}
                            </p>
                          )}
                          <ChevronDown
                            className={`h-3.5 w-3.5 text-text-muted transition-transform duration-150 ${
                              isExpanded ? "rotate-180" : ""
                            }`}
                          />
                        </div>
                      </button>
                      {/* Expandable detail panel */}
                      <div
                        className="grid transition-[grid-template-rows] duration-150 ease-out"
                        style={{
                          gridTemplateRows: isExpanded ? "1fr" : "0fr",
                        }}
                      >
                        <div className="overflow-hidden">
                          {isExpanded && (
                            <TransactionDetailPanel
                              tx={tx}
                              rawDataExpanded={rawDataExpanded}
                              onToggleRawData={() => setRawDataExpanded(!rawDataExpanded)}
                            />
                          )}
                        </div>
                      </div>
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
