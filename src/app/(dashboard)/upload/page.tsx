import { Upload } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function UploadPage() {
  return (
    <div className="p-8 max-w-[1000px]">
      <div className="mb-8 animate-fade-in">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-slate-900">
          Upload Data
        </h1>
        <p className="mt-1 text-[13px] text-slate-500">
          Import CSV files from Stripe, Calendly, or PassLine
        </p>
      </div>

      <Card className="border-slate-200 shadow-none border-dashed animate-fade-in-up stagger-2">
        <CardContent className="flex flex-col items-center justify-center py-16 px-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 mb-4">
            <Upload className="h-6 w-6 text-slate-400" />
          </div>
          <p className="text-[14px] font-medium text-slate-700 mb-1">
            CSV Upload Coming Soon
          </p>
          <p className="text-[13px] text-slate-400 text-center max-w-md">
            The upload flow with source selection, column mapping, identity
            stitching, and import validation will be built in Checkpoint 3.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
