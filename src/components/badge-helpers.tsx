import { Badge } from "@/components/ui/badge";

const RISK_STYLES: Record<string, string> = {
  Healthy:
    "bg-emerald-50 text-emerald-700 hover:bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/10",
  "At Risk":
    "bg-amber-50 text-amber-700 hover:bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400 dark:hover:bg-amber-500/10",
  Dormant:
    "bg-orange-50 text-orange-700 hover:bg-orange-50 dark:bg-orange-500/10 dark:text-orange-400 dark:hover:bg-orange-500/10",
  Lost: "bg-rose-50 text-rose-700 hover:bg-rose-50 dark:bg-rose-500/10 dark:text-rose-400 dark:hover:bg-rose-500/10",
};

const TIER_STYLES: Record<string, string> = {
  "Tier A":
    "bg-surface-active text-text-on-active hover:bg-surface-active",
  "Tier B":
    "bg-surface-muted text-text-secondary hover:bg-surface-muted",
  "Tier C":
    "bg-surface-elevated text-text-muted hover:bg-surface-elevated",
};

export function riskBadge(status: string) {
  return (
    <Badge
      variant="secondary"
      className={`text-[11px] font-medium ${RISK_STYLES[status] ?? ""}`}
    >
      {status}
    </Badge>
  );
}

export function tierBadge(tier: string) {
  return (
    <Badge
      variant="secondary"
      className={`text-[11px] font-medium ${TIER_STYLES[tier] ?? ""}`}
    >
      {tier}
    </Badge>
  );
}
