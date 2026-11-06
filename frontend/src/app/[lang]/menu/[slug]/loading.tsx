import { ProductDetailSkeleton } from "@/components/Skeleton";

// Shown while a cake's page loads.
export default function ProductLoading() {
  return <ProductDetailSkeleton label="Loading" />;
}
