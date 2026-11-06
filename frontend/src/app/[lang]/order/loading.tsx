import { CheckoutSkeleton, Skeleton } from "@/components/Skeleton";

// Shown while the checkout page loads.
export default function OrderLoading() {
  return (
    <section className="flex flex-col gap-7 px-4 pb-20 pt-8 md:px-10 md:pt-12">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-12 w-64 md:h-16" />
      </div>
      <CheckoutSkeleton label="Loading" />
    </section>
  );
}
