import type { ReactNode } from "react";

// A template (unlike a layout) is created fresh on every page change,
// so each new page fades in gently instead of appearing all at once.
export default function ShopTemplate({ children }: { children: ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
