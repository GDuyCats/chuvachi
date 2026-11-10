import { AdminShell } from "@/components/admin/AdminShell";
import { PostsPage } from "@/components/admin/PostsPage";

export default function AdminPostsPage() {
  return (
    <AdminShell adminOnly>
      <PostsPage />
    </AdminShell>
  );
}
