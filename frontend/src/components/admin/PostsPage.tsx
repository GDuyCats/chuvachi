"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { adminApi, AdminApiError, AdminValidationError, type AdminPost, type PostCategory, type PostInput } from "@/lib/admin-api";
import { PostBody } from "../news/PostBody";
import { PostCommentsPanel } from "./PostCommentsPanel";
import { useAdminI18n } from "./AdminI18n";
import { AdminRowsSkeleton } from "./AdminSkeletons";
import { ImageUploadField } from "./ImageUploadField";
import { useToast } from "./Toast";

const CATEGORIES: PostCategory[] = ["NEW_CAKE", "NEWS", "UPDATE", "EVENT", "LETTER"];
const inputBase = "h-11 w-full border-[1.5px] border-black bg-white px-3 text-[15px] font-normal";
const nullable = (value: string) => (value.trim() === "" ? null : value);

// "2026-11-10T09:30" in Vietnam time <-> ISO time, for the <input type="datetime-local">.
function toLocalInput(iso: string): string {
  const date = new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 16);
}
function fromLocalInput(value: string): string {
  return new Date(`${value}:00+07:00`).toISOString();
}

function emptyPost(): PostInput {
  return {
    slug: "",
    category: "NEWS",
    titleVi: "",
    titleEn: null,
    summaryVi: null,
    summaryEn: null,
    bodyVi: "",
    bodyEn: null,
    coverImageUrl: null,
    isPublished: false,
    isPinned: false,
    allowComments: true,
    publishAt: new Date().toISOString(),
  };
}

// Admin "News" page: the list of posts and the editor.
export function PostsPage() {
  const router = useRouter();
  const { t, lang } = useAdminI18n();
  const p = t.posts;
  const [posts, setPosts] = useState<AdminPost[] | null>(null);
  const [failed, setFailed] = useState(false);
  // null = list only; "new" = writing a new post; a number = editing that post
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [commentsOf, setCommentsOf] = useState<AdminPost | null>(null); // post whose comments are open

  useEffect(() => {
    adminApi
      .listPosts()
      .then(setPosts)
      .catch((error: unknown) => {
        if (error instanceof AdminApiError && error.status === 401) {
          router.replace("/admin/login");
          return;
        }
        setFailed(true);
      });
  }, [router]);

  const status = (post: AdminPost) => {
    if (!post.isPublished) return p.status.draft;
    if (new Date(post.publishAt) > new Date()) return p.status.scheduled;
    return p.status.live;
  };

  if (commentsOf) {
    return (
      <PostCommentsPanel
        post={commentsOf}
        onClose={() => {
          setCommentsOf(null);
          adminApi.listPosts().then(setPosts).catch(() => undefined); // refresh the counts
        }}
      />
    );
  }

  if (editing !== null) {
    const current = editing === "new" ? null : (posts?.find((post) => post.id === editing) ?? null);
    return (
      <PostEditor
        post={current}
        onSaved={(list) => {
          setPosts(list);
          setEditing(null);
        }}
        onClose={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl uppercase md:text-[40px]">{p.title}</h1>
          <p className="text-sm text-muted">{p.hint}</p>
        </div>
        <button type="button" onClick={() => setEditing("new")} className="min-h-11 bg-black px-5 font-bold text-white">
          + {p.add}
        </button>
      </div>

      {failed && <p className="border-[1.5px] border-black bg-white p-4 font-semibold">{p.loadError}</p>}
      {!posts && !failed && <AdminRowsSkeleton label={p.loading} />}
      {posts && posts.length === 0 && (
        <p className="border border-dashed border-[#a8a8a8] bg-white p-6 text-center text-muted">{p.empty}</p>
      )}

      {posts && posts.length > 0 && (
        <ul className="flex flex-col gap-2">
          {posts.map((post) => (
            <li key={post.id} className="flex flex-wrap items-center justify-between gap-3 border border-[#e0e0e0] bg-white p-4">
              <div className="flex min-w-0 items-center gap-3">
                {post.coverImageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- small preview
                  <img src={post.coverImageUrl} alt="" className="h-12 w-16 shrink-0 object-cover" />
                )}
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="font-bold">
                    {post.isPinned && <span className="mr-2 bg-black px-1.5 py-0.5 text-[10px] uppercase text-white">{p.pinned}</span>}
                    {post.titleVi}
                  </span>
                  <span className="text-sm text-muted">
                    {p.categories[post.category]} · {new Date(post.publishAt).toLocaleString(lang === "vi" ? "vi-VN" : "en-GB", { timeZone: "Asia/Ho_Chi_Minh" })}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`px-2 py-1 text-[11px] font-bold uppercase tracking-wider ${status(post) === p.status.live ? "bg-black text-white" : "border border-black"}`}
                >
                  {status(post)}
                </span>
                {status(post) === p.status.live && (
                  <a href={`/vi/news/${post.slug}`} target="_blank" rel="noopener" className="min-h-11 content-center px-1 text-sm underline">
                    {p.view}
                  </a>
                )}
                <button type="button" onClick={() => setCommentsOf(post)} className="min-h-11 px-2 text-sm font-semibold underline">
                  {p.comments.button.replace("{count}", String(post.commentCount))}
                  {post.reportedComments > 0 && (
                    <span className="ml-1.5 bg-black px-1.5 py-0.5 text-[10px] uppercase text-white no-underline">
                      {p.comments.reportedBadge.replace("{count}", String(post.reportedComments))}
                    </span>
                  )}
                  {!post.allowComments && <span className="ml-1 text-xs text-muted">({p.comments.off})</span>}
                </button>
                <button type="button" onClick={() => setEditing(post.id)} className="min-h-11 px-2 text-sm font-semibold underline">
                  {p.edit}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PostEditor({
  post,
  onSaved,
  onClose,
}: {
  post: AdminPost | null;
  onSaved: (list: AdminPost[]) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const { t } = useAdminI18n();
  const p = t.posts;
  const [draft, setDraft] = useState<PostInput>(() => {
    if (!post) return emptyPost();
    const { id: _id, createdAt: _c, updatedAt: _u, commentCount: _n, reportedComments: _r, ...input } = post;
    return input;
  });
  const [tab, setTab] = useState<"vi" | "en">("vi");
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [badFields, setBadFields] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const bodyKey = tab === "vi" ? "bodyVi" : "bodyEn";
  const body = draft[bodyKey] ?? "";

  function update<K extends keyof PostInput>(key: K, value: PostInput[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function setBody(value: string) {
    update(bodyKey, tab === "vi" ? value : nullable(value));
  }

  // Wraps the selected text (or inserts an example) with Markdown marks, e.g. **bold**.
  function wrap(before: string, after = "", placeholder = "") {
    const area = bodyRef.current;
    if (!area) return;
    const { selectionStart: start, selectionEnd: end } = area;
    const selected = body.slice(start, end) || placeholder;
    const next = body.slice(0, start) + before + selected + after + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      area.focus();
      area.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  }

  // Starts each selected line (or the current one) with a mark, e.g. "- " for a list.
  function prefixLines(mark: (index: number) => string) {
    const area = bodyRef.current;
    if (!area) return;
    const lineStart = body.lastIndexOf("\n", area.selectionStart - 1) + 1;
    const lineEnd = body.indexOf("\n", area.selectionEnd);
    const end = lineEnd === -1 ? body.length : lineEnd;
    const lines = body.slice(lineStart, end).split("\n").map((line, i) => mark(i) + line);
    setBody(body.slice(0, lineStart) + lines.join("\n") + body.slice(end));
    requestAnimationFrame(() => area.focus());
  }

  function insertBlock(text: string) {
    const area = bodyRef.current;
    const at = area ? area.selectionStart : body.length;
    const before = body.slice(0, at).replace(/\s*$/, "");
    const after = body.slice(at).replace(/^\s*/, "");
    setBody(`${before}${before ? "\n\n" : ""}${text}${after ? "\n\n" : ""}${after}`);
  }

  async function uploadInline(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await adminApi.uploadImage("post", file);
      insertBlock(`![${p.photoCaption}](${url})`);
      toast.success(p.photoInserted);
    } catch (error) {
      if (error instanceof AdminApiError && error.status === 401) {
        router.replace("/admin/login");
        return;
      }
      toast.error(t.images.failed);
    } finally {
      setUploading(false);
    }
  }

  async function run(action: () => Promise<AdminPost[]>, done: string) {
    setBusy(true);
    setBadFields([]);
    try {
      onSaved(await action());
      toast.success(done);
    } catch (error) {
      if (error instanceof AdminApiError && error.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (error instanceof AdminValidationError) {
        setBadFields(error.fields);
        toast.error(p.invalid);
      } else if (error instanceof AdminApiError && error.code === "SLUG_TAKEN") {
        setBadFields(["slug"]);
        toast.error(p.slugTaken);
      } else {
        toast.error(p.saveError);
      }
    } finally {
      setBusy(false);
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(() => (post ? adminApi.updatePost(post.id, draft) : adminApi.createPost(draft)), p.saved);
  }

  const fieldClass = (field: string) =>
    `${inputBase} ${badFields.includes(field) ? "bg-[#fff6f6] outline outline-2 outline-offset-1 outline-black" : ""}`;
  const tool = "min-h-9 border-[1.5px] border-black bg-white px-2.5 text-sm font-bold hover:bg-[#ececec]";

  return (
    <form onSubmit={save} className="flex max-w-4xl flex-col gap-5">
      <div className="sticky top-0 z-20 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#e0e0e0] bg-[#fafafa]/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
        <h1 className="font-display text-3xl uppercase md:text-[40px]">{post ? p.editTitle : p.newTitle}</h1>
        <div className="flex items-center gap-3">
          <button type="button" onClick={onClose} className="min-h-11 px-2 text-sm font-semibold underline">
            {p.back}
          </button>
          <button type="submit" disabled={busy || uploading} className="min-h-11 bg-black px-6 font-bold text-white disabled:opacity-60">
            {busy ? p.saving : p.save}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          {p.titleVi}
          <input required maxLength={140} value={draft.titleVi} onChange={(e) => update("titleVi", e.target.value)} className={fieldClass("titleVi")} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          {p.titleEn}
          <input maxLength={140} value={draft.titleEn ?? ""} onChange={(e) => update("titleEn", nullable(e.target.value))} className={fieldClass("titleEn")} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          {p.category}
          <select value={draft.category} onChange={(e) => update("category", e.target.value as PostCategory)} className={fieldClass("category")}>
            {CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {p.categories[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          {p.slug}
          <input
            maxLength={80}
            placeholder={p.slugPlaceholder}
            value={draft.slug}
            onChange={(e) => update("slug", e.target.value)}
            className={fieldClass("slug")}
          />
          <span className="text-xs font-normal text-muted">{p.slugHint}</span>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          {p.summaryVi}
          <textarea
            rows={2}
            maxLength={400}
            value={draft.summaryVi ?? ""}
            onChange={(e) => update("summaryVi", nullable(e.target.value))}
            className={`${fieldClass("summaryVi")} h-auto py-2.5`}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          {p.summaryEn}
          <textarea
            rows={2}
            maxLength={400}
            value={draft.summaryEn ?? ""}
            onChange={(e) => update("summaryEn", nullable(e.target.value))}
            className={`${fieldClass("summaryEn")} h-auto py-2.5`}
          />
        </label>
      </div>
      <p className="-mt-2 text-xs text-muted">{p.summaryHint}</p>

      <ImageUploadField
        kind="post"
        value={draft.coverImageUrl}
        onChange={(url) => update("coverImageUrl", url)}
        invalid={badFields.includes("coverImageUrl")}
        saveLabel={p.save}
      />

      {/* Body: Vietnamese / English tabs, a small toolbar and a preview. */}
      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div role="tablist" className="flex">
            {(["vi", "en"] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={`min-h-10 border-[1.5px] border-black px-4 text-sm font-bold ${tab === value ? "bg-black text-white" : "bg-white"}`}
              >
                {value === "vi" ? p.bodyVi : p.bodyEn}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setPreview((v) => !v)} aria-pressed={preview} className={tool}>
            {preview ? p.backToWriting : p.preview}
          </button>
        </div>

        {!preview && (
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className={tool} onClick={() => prefixLines(() => "## ")}>
              {p.toolHeading}
            </button>
            <button type="button" className={tool} onClick={() => wrap("**", "**", p.toolBoldSample)}>
              <strong>B</strong>
            </button>
            <button type="button" className={tool} onClick={() => wrap("*", "*", p.toolItalicSample)}>
              <em>I</em>
            </button>
            <button type="button" className={tool} onClick={() => prefixLines(() => "- ")}>
              {p.toolList}
            </button>
            <button type="button" className={tool} onClick={() => prefixLines((i) => `${i + 1}. `)}>
              {p.toolNumbered}
            </button>
            <button type="button" className={tool} onClick={() => prefixLines(() => "> ")}>
              {p.toolQuote}
            </button>
            <button type="button" className={tool} onClick={() => wrap("[", "](https://)", p.toolLinkSample)}>
              {p.toolLink}
            </button>
            <button type="button" className={tool} disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? p.uploading : p.toolPhoto}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(e) => {
                void uploadInline(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
        )}

        {preview ? (
          <div className="min-h-64 border-[1.5px] border-black bg-white p-5">
            {body.trim() ? <PostBody text={body} /> : <p className="text-muted">{p.previewEmpty}</p>}
          </div>
        ) : (
          <textarea
            ref={bodyRef}
            required={tab === "vi"}
            rows={18}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={tab === "vi" ? p.bodyPlaceholder : p.bodyEnPlaceholder}
            className={`${fieldClass(bodyKey)} h-auto py-3 font-mono text-[14px] leading-relaxed`}
          />
        )}
        <p className="text-xs text-muted">{p.bodyHint}</p>
      </section>

      <section className="flex flex-col gap-3 border-t border-[#e0e0e0] pt-5">
        <label className="flex flex-col gap-1.5 text-sm font-semibold md:max-w-xs">
          {p.publishAt}
          <input
            type="datetime-local"
            value={toLocalInput(draft.publishAt)}
            onChange={(e) => e.target.value && update("publishAt", fromLocalInput(e.target.value))}
            className={fieldClass("publishAt")}
          />
          <span className="text-xs font-normal text-muted">{p.publishAtHint}</span>
        </label>
        <label className="flex items-center gap-2.5 font-semibold">
          <input type="checkbox" checked={draft.isPublished} onChange={(e) => update("isPublished", e.target.checked)} className="h-5 w-5 accent-black" />
          {p.published}
        </label>
        <label className="flex items-center gap-2.5 font-semibold">
          <input type="checkbox" checked={draft.isPinned} onChange={(e) => update("isPinned", e.target.checked)} className="h-5 w-5 accent-black" />
          {p.pin}
        </label>
        <label className="flex flex-col gap-1 font-semibold">
          <span className="flex items-center gap-2.5">
            <input
              type="checkbox"
              checked={draft.allowComments}
              onChange={(e) => update("allowComments", e.target.checked)}
              className="h-5 w-5 accent-black"
            />
            {p.allowComments}
          </span>
          <span className="pl-[30px] text-xs font-normal text-muted">{p.allowCommentsHint}</span>
        </label>
      </section>

      {post && (
        <div className="flex flex-wrap items-center gap-3 border-t border-[#e0e0e0] pt-4">
          {confirmDelete ? (
            <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
              {p.confirmDelete}
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => adminApi.deletePost(post.id), p.deleted)}
                className="min-h-11 border-[1.5px] border-black px-3 font-bold"
              >
                {p.yesDelete}
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="min-h-11 px-2 underline">
                {p.no}
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className="min-h-11 px-2 text-sm font-semibold underline">
              {p.delete}
            </button>
          )}
        </div>
      )}
    </form>
  );
}
