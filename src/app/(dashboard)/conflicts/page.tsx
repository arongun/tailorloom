import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function ConflictsPage() {
  return (
    <div className="p-8 max-w-[1400px]">
      <div className="mb-8 animate-fade-in">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-slate-900">
          Identity Conflicts
        </h1>
        <p className="mt-1 text-[13px] text-slate-500">
          Review flagged customer identity matches that need manual confirmation
        </p>
      </div>

      <Card className="border-slate-200 shadow-none animate-fade-in-up stagger-2">
        <CardContent className="flex flex-col items-center justify-center py-16 px-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-amber-50 mb-4">
            <AlertTriangle className="h-6 w-6 text-amber-500" />
          </div>
          <p className="text-[14px] font-medium text-slate-700 mb-1">
            No Conflicts
          </p>
          <p className="text-[13px] text-slate-400 text-center max-w-md">
            Identity conflicts will appear here when the system detects
            potential customer matches that need your review. This page will be
            built in Checkpoint 4.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
