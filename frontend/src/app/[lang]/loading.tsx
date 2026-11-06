import { ProductCardSkeleton, Skeleton, SkeletonGroup } from "@/components/Skeleton";

// Shown while a page of the shop is loading (homepage and any page without its own loading screen).
export default function Loading() {
  return (
    <SkeletonGroup label="Loading">
      <div className="flex flex-col gap-4 bg-[#141414] px-4 py-12 md:px-14 md:py-20">
        <div className="h-4 w-28 bg-[#2e2e2e] motion-safe:animate-pulse" />
        <div className="h-14 w-3/4 max-w-xl bg-[#2e2e2e] motion-safe:animate-pulse md:h-20" />
        <div className="h-5 w-1/2 max-w-md bg-[#2e2e2e] motion-safe:animate-pulse" />
        <div className="mt-2 h-12 w-40 bg-[#2e2e2e] motion-safe:animate-pulse" />
      </div>
      <div className="flex flex-col items-center gap-7 px-4 py-12 md:px-10 md:py-16">
        <Skeleton className="h-10 w-32" />
        <div className="grid w-full max-w-4xl grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5 md:gap-5">
          {[0, 1, 2, 3, 4].map((tile) => (
            <Skeleton key={tile} className="h-36 md:h-56" />
          ))}
        </div>
      </div>
      <div className="flex gap-4 overflow-hidden px-4 pb-16 md:px-10">
        {[0, 1, 2].map((card) => (
          <ProductCardSkeleton key={card} className="w-[75%] shrink-0 sm:w-[45%] xl:w-[32%]" />
        ))}
      </div>
    </SkeletonGroup>
  );
}
