import type { Metadata } from "next";
import { Anton, Be_Vietnam_Pro } from "next/font/google";
import type { ReactNode } from "react";
import { AdminI18nProvider } from "@/components/admin/AdminI18n";
import "../globals.css";

const anton = Anton({ weight: "400", subsets: ["latin", "vietnamese"], variable: "--font-anton" });
const beVietnamPro = Be_Vietnam_Pro({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin", "vietnamese"],
  variable: "--font-be-vietnam",
});

export const metadata: Metadata = {
  title: "Chuvachi — Staff",
  // Keep the staff pages out of search engines.
  robots: { index: false, follow: false },
};

// Separate root layout for staff pages: no shop header or footer.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" className={`${anton.variable} ${beVietnamPro.variable} h-full antialiased`}>
      <body className="min-h-full">
        <AdminI18nProvider>{children}</AdminI18nProvider>
      </body>
    </html>
  );
}
