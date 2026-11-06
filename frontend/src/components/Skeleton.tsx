// Grey placeholder blocks shown while data loads ("skeleton loading").
// They keep the page layout steady, so nothing jumps when the real content arrives.
// The pulse animation is switched off for visitors who prefer reduced motion.

import type { ReactNode } from "react";

type BoxProps = { className?: string };

export function Skeleton({ className = "" }: BoxProps) {
  return <div aria-hidden="true" className={`bg-[#ebebeb] motion-safe:animate-pulse ${className}`} />;
}

// Wraps a group of skeletons and tells screen readers that content is loading.
export function SkeletonGroup({ label, className = "", children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div role="status" aria-label={label} aria-busy="true" className={className}>
      {children}
    </div>
  );
}

// Same shape as ProductCard.
export function ProductCardSkeleton({ className = "" }: BoxProps) {
  return (
    <div className={`flex flex-col gap-3 rounded-xl bg-surface p-3 md:gap-4 md:p-5 ${className}`}>
      <Skeleton className="aspect-square w-full" />
      <div className="h-px bg-line" />
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-4 w-1/4" />
    </div>
  );
}

export function ProductGridSkeleton({ count = 8, label }: { count?: number; label: string }) {
  return (
    <SkeletonGroup label={label} className="grid grid-cols-2 gap-3 px-4 pb-16 pt-6 md:grid-cols-3 md:gap-6 md:px-10 xl:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <ProductCardSkeleton key={index} />
      ))}
    </SkeletonGroup>
  );
}

// A generic form: a few labelled inputs and a button.
export function FormSkeleton({ fields = 4, label, className = "" }: { fields?: number; label: string; className?: string }) {
  return (
    <SkeletonGroup label={label} className={`flex flex-col gap-5 ${className}`}>
      {Array.from({ length: fields }, (_, index) => (
        <div key={index} className="flex flex-col gap-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-12 w-full" />
        </div>
      ))}
      <Skeleton className="h-13 w-48" />
    </SkeletonGroup>
  );
}

// Product page: photo on the left, details on the right.
export function ProductDetailSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label} className="flex flex-col gap-8 px-4 pb-16 pt-6 md:flex-row md:gap-14 md:px-10">
      <Skeleton className="aspect-square w-full md:flex-1" />
      <div className="flex flex-col gap-5 md:flex-1">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-14 w-3/4" />
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-20 w-full" />
        <div className="flex flex-wrap gap-2.5">
          {[0, 1, 2].map((option) => (
            <Skeleton key={option} className="h-11 w-28" />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {[0, 1, 2].map((option) => (
            <Skeleton key={option} className="h-16" />
          ))}
        </div>
        <Skeleton className="h-13 w-full" />
      </div>
    </SkeletonGroup>
  );
}

// Checkout: details form on the left, order summary on the right.
export function CheckoutSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label} className="flex flex-col gap-8 lg:flex-row lg:gap-14">
      <div className="flex flex-col gap-8 lg:flex-1">
        <FormSkeleton fields={2} label={label} />
        <FormSkeleton fields={3} label={label} />
      </div>
      <div className="flex flex-col gap-4 bg-surface p-5 lg:w-[400px]">
        <Skeleton className="h-7 w-40" />
        {[0, 1].map((line) => (
          <div key={line} className="flex gap-3">
            <Skeleton className="h-[72px] w-[72px] shrink-0" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
        ))}
        <Skeleton className="h-14 w-full" />
      </div>
    </SkeletonGroup>
  );
}
