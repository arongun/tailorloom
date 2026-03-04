"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { getCustomerDetail } from "@/lib/actions/dashboard";
import type { CustomerDetail } from "@/lib/types/dashboard";

const SOURCE_LABELS: Record<string, { label: string }> = {
  stripe: { label: "Stripe" },
  calendly: { label: "Calendly" },
  passline: { label: "PassLine" },
  pos: { label: "POS" },
  wetravel: { label: "WeTravel" },
  manual: { label: "Manual" },
};

export type GroupedSource = [
  string,
  {
    links: CustomerDetail["customer"]["sourceLinks"];
    sampleEmail: string | null;
  },
];

export function useCustomerDetail(
  customerId: string | null,
  profileParam?: string,
  isActive = true,
) {
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(() => isActive && !!customerId);
  const [expandedTxId, setExpandedTxId] = useState<string | null>(null);
  const [rawDataExpanded, setRawDataExpanded] = useState(false);
  const [expandedSources, setExpandedSources] = useState<Set<string>>(
    new Set(),
  );

  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!isActive || !customerId) {
      setDetail(null);
      setLoading(false);
      return;
    }

    requestIdRef.current += 1;
    const currentRequestId = requestIdRef.current;

    setLoading(true);
    setDetail(null);
    setExpandedTxId(null);
    setRawDataExpanded(false);
    setExpandedSources(new Set());

    getCustomerDetail(customerId, profileParam)
      .then((d) => {
        if (currentRequestId === requestIdRef.current) {
          setDetail(d);
        }
      })
      .catch(() => {
        if (currentRequestId === requestIdRef.current) {
          setDetail(null);
        }
      })
      .finally(() => {
        if (currentRequestId === requestIdRef.current) {
          setLoading(false);
        }
      });
  }, [isActive, customerId, profileParam]);

  const groupedSources: GroupedSource[] = useMemo(() => {
    if (!detail) return [];
    const map = new Map<
      string,
      {
        links: CustomerDetail["customer"]["sourceLinks"];
        sampleEmail: string | null;
      }
    >();
    for (const link of detail.customer.sourceLinks) {
      const existing = map.get(link.source);
      if (existing) {
        existing.links.push(link);
        if (!existing.sampleEmail && link.external_email) {
          existing.sampleEmail = link.external_email;
        }
      } else {
        map.set(link.source, {
          links: [link],
          sampleEmail: link.external_email,
        });
      }
    }
    return Array.from(map.entries()).sort((a, b) => {
      const labelA = SOURCE_LABELS[a[0]]?.label ?? a[0];
      const labelB = SOURCE_LABELS[b[0]]?.label ?? b[0];
      return labelA.localeCompare(labelB);
    });
  }, [detail]);

  return {
    detail,
    loading,
    expandedTxId,
    setExpandedTxId,
    rawDataExpanded,
    setRawDataExpanded,
    expandedSources,
    setExpandedSources,
    groupedSources,
  };
}
