import { notFound } from "next/navigation";

// Any address under /vi/... or /en/... that isn't a real page ends up here,
// so the "not found" page is shown with the normal header and footer.
export default function UnknownPage() {
  notFound();
}
