import { Suspense } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { ProductEditor } from "@/components/admin/ProductEditor";

// /admin/products/edit          -> new product
// /admin/products/edit?id=3     -> edit product 3
export default function AdminProductEditPage() {
  return (
    <AdminShell>
      {/* The editor reads ?id=... from the URL, so it renders inside a Suspense boundary. */}
      <Suspense>
        <ProductEditor />
      </Suspense>
    </AdminShell>
  );
}
