export default function DashboardLoading() {
  return (
    <div className="p-8 max-w-[1400px] animate-pulse">
      {/* Header row */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="h-7 w-32 bg-surface-muted rounded-md" />
          <div className="h-4 w-64 bg-surface-muted rounded-md mt-2" />
        </div>
        <div className="h-8 w-80 bg-surface-muted rounded-md" />
      </div>

      {/* Hero row */}
      <div className="flex gap-4 mb-6">
        <div className="flex-[3] h-[160px] bg-surface-muted rounded-xl" />
        <div className="flex-[2] grid grid-cols-2 gap-4">
          <div className="h-[70px] bg-surface-muted rounded-xl" />
          <div className="h-[70px] bg-surface-muted rounded-xl" />
          <div className="h-[70px] bg-surface-muted rounded-xl" />
          <div className="h-[70px] bg-surface-muted rounded-xl" />
        </div>
      </div>

      {/* Chart row */}
      <div className="h-[400px] bg-surface-muted rounded-xl mb-6" />

      {/* Two columns */}
      <div className="flex gap-4 mb-6">
        <div className="flex-[3] h-[280px] bg-surface-muted rounded-xl" />
        <div className="flex-[2] h-[280px] bg-surface-muted rounded-xl" />
      </div>

      {/* Compact strip */}
      <div className="h-[56px] bg-surface-muted rounded-xl" />
    </div>
  );
}
