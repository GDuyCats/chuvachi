import { Skeleton, SkeletonGroup } from "../Skeleton";

// Loading placeholders for the staff pages. Each one has the same shape as the page it stands in for.

// Top bar and tabs, shown while we check that the visitor is signed in.
export function AdminShellSkeleton() {
  return (
    <div className="min-h-screen bg-[#fafafa]">
      <div className="flex items-center justify-between bg-black px-4 py-3.5 md:px-8">
        <span className="font-display text-2xl tracking-[0.18em] text-white">CHUVACHI</span>
        <div className="h-5 w-32 bg-[#2e2e2e] motion-safe:animate-pulse" />
      </div>
      <div className="flex gap-7 border-b border-[#e0e0e0] bg-white px-4 py-4 md:px-8">
        {[0, 1, 2, 3].map((tab) => (
          <Skeleton key={tab} className="h-5 w-20" />
        ))}
      </div>
      <div className="px-4 pt-6 md:px-8">
        <AdminFormSkeleton label="Loading" />
      </div>
    </div>
  );
}

// Long forms: settings, product editor, homepage editor.
export function AdminFormSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label} className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-11 w-36" />
      </div>
      {[0, 1, 2].map((section) => (
        <div key={section} className="flex flex-col gap-4 border border-[#e0e0e0] bg-white p-5 md:p-6">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {[0, 1, 2, 3].map((field) => (
              <div key={field} className="flex flex-col gap-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-11 w-full" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </SkeletonGroup>
  );
}

// Product cards on the Products page.
export function AdminCardsSkeleton({ label, count = 6 }: { label: string; count?: number }) {
  return (
    <SkeletonGroup label={label} className="flex flex-col gap-8">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-10 w-44" />
        <Skeleton className="h-11 w-36" />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: count }, (_, index) => (
          <div key={index} className="flex gap-4 border border-[#e0e0e0] bg-white p-4">
            <Skeleton className="h-20 w-20 shrink-0" />
            <div className="flex flex-1 flex-col gap-2 pt-1">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </SkeletonGroup>
  );
}

// Order rows on the Orders page.
export function AdminRowsSkeleton({ label, count = 5 }: { label: string; count?: number }) {
  return (
    <SkeletonGroup label={label} className="flex flex-col gap-2.5">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex items-center gap-4 border border-[#e0e0e0] bg-white p-4">
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
          <Skeleton className="h-7 w-24" />
        </div>
      ))}
    </SkeletonGroup>
  );
}
