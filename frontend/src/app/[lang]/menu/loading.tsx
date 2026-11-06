import { ProductGridSkeleton, Skeleton } from "@/components/Skeleton";

// Shown while the menu loads.
export default function MenuLoading() {
  return (
    <>
      <div className="flex flex-col gap-3.5 px-4 pt-8 md:px-10 md:pt-12">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-12 w-48 md:h-20 md:w-80" />
        <Skeleton className="h-5 w-full max-w-xl" />
      </div>
      <div className="flex gap-2.5 border-b border-line px-4 pb-4 pt-6 md:px-10">
        {[0, 1, 2, 3].map((filter) => (
          <Skeleton key={filter} className="h-11 w-24" />
        ))}
      </div>
      <ProductGridSkeleton label="Loading" />
    </>
  );
}
