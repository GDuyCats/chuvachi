import type { ReactNode } from "react";

// Each staff page fades in when you switch tabs.
export default function AdminTemplate({ children }: { children: ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
