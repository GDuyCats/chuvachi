import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/admin/PasswordResetForms";

// Never pass this page's address on to other sites.
export const metadata: Metadata = { referrer: "no-referrer" };

export default function AdminResetPasswordPage() {
  return <ResetPasswordForm />;
}
