"use client";

import { useCallback, useEffect, useState } from "react";
import { adminApi, type AdminPost, type AdminPostComment } from "@/lib/admin-api";
import { useAdminI18n } from "./AdminI18n";
import { AdminRowsSkeleton } from "./AdminSkeletons";
import { useToast } from "./Toast";

// Comments under one news post, for the shop: hide or show them, and answer as Chuvachi.
export function PostCommentsPanel({ post, onClose }: { post: AdminPost; onClose: () => void }) {
  const toast = useToast();
  const { t, lang } = useAdminI18n();
  const c = t.posts.comments;
  const [comments, setComments] = useState<AdminPostComment[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [replyTo, setReplyTo] = useState<number | "new" | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setComments(await adminApi.listPostComments(post.id));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [post.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function setHidden(comment: AdminPostComment, hidden: boolean) {
    try {
      await adminApi.hidePostComment(comment.id, hidden);
      toast.success(hidden ? c.hiddenDone : c.shownDone);
      await load();
    } catch {
      toast.error(c.error);
    }
  }

  async function send() {
    if (!text.trim() || replyTo === null) return;
    setBusy(true);
    try {
      await adminApi.replyPostComment(post.id, text.trim(), replyTo === "new" ? null : replyTo);
      toast.success(c.sent);
      setText("");
      setReplyTo(null);
      await load();
    } catch {
      toast.error(c.error);
    } finally {
      setBusy(false);
    }
  }

  const when = (iso: string) =>
    new Date(iso).toLocaleString(lang === "vi" ? "vi-VN" : "en-GB", { timeZone: "Asia/Ho_Chi_Minh" });

  const replyBox = (
    <div className="flex flex-col gap-2">
      <textarea
        value={text}
        maxLength={1000}
        rows={3}
        autoFocus
        onChange={(e) => setText(e.target.value)}
        placeholder={c.placeholder}
        className="w-full border-[1.5px] border-black bg-white px-3 py-2 text-[15px]"
      />
      <div className="flex gap-2">
        <button type="button" onClick={send} disabled={busy || !text.trim()} className="min-h-10 bg-black px-4 text-sm font-bold text-white disabled:opacity-50">
          {c.send}
        </button>
        <button type="button" onClick={() => setReplyTo(null)} className="min-h-10 px-3 text-sm font-semibold underline">
          {c.cancel}
        </button>
      </div>
    </div>
  );

  const row = (comment: AdminPostComment, isReply: boolean) => (
    <div
      key={comment.id}
      className={`flex flex-col gap-1.5 ${isReply ? "border-l-[1.5px] border-black pl-4" : ""} ${comment.hidden ? "opacity-60" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-x-2 text-sm">
        <span className="font-bold">{comment.displayName}</span>
        <span className="text-muted">{when(comment.createdAt)}</span>
        {comment.hidden && <span className="border border-black px-1.5 text-[10px] font-bold uppercase">{c.hiddenBadge}</span>}
        {comment.reportCount > 0 && !comment.hidden && (
          <span className="bg-black px-1.5 text-[10px] font-bold uppercase text-white">
            {c.reports.replace("{count}", String(comment.reportCount))}
          </span>
        )}
      </div>
      {comment.deleted ? (
        <p className="text-sm italic text-muted">{c.deleted}</p>
      ) : (
        <p className="whitespace-pre-line text-[15px]">{comment.body}</p>
      )}
      <div className="flex flex-wrap gap-x-3">
        {!isReply && !comment.deleted && !comment.hidden && (
          <button type="button" onClick={() => setReplyTo(comment.id)} className="min-h-9 text-sm font-semibold underline">
            {c.reply}
          </button>
        )}
        {!comment.deleted &&
          (comment.hidden ? (
            <button type="button" onClick={() => setHidden(comment, false)} className="min-h-9 text-sm underline">
              {c.show}
            </button>
          ) : (
            <>
              <button type="button" onClick={() => setHidden(comment, true)} className="min-h-9 text-sm underline">
                {c.hide}
              </button>
              {comment.reportCount > 0 && (
                <button type="button" onClick={() => setHidden(comment, false)} className="min-h-9 text-sm underline">
                  {c.keep}
                </button>
              )}
            </>
          ))}
      </div>
    </div>
  );

  const topLevel = comments?.filter((x) => x.parentId === null) ?? [];

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl uppercase">{c.title}</h1>
          <p className="font-semibold">{post.titleVi}</p>
          <p className="text-sm text-muted">{post.allowComments ? c.hint : c.offHint}</p>
        </div>
        <button type="button" onClick={onClose} className="min-h-11 border-[1.5px] border-black px-4 font-semibold">
          ← {c.back}
        </button>
      </div>

      {failed && <p className="border-[1.5px] border-black bg-white p-4 font-semibold">{c.loadError}</p>}
      {!comments && !failed && <AdminRowsSkeleton label={c.loading} />}
      {comments && (
        <div className="flex flex-col gap-4 border border-[#e0e0e0] bg-white p-4">
          {topLevel.length === 0 && <p className="text-sm text-muted">{c.empty}</p>}
          {topLevel.map((comment) => (
            <div key={comment.id} className="flex flex-col gap-3 border-b border-[#eeeeee] pb-4 last:border-0 last:pb-0">
              {row(comment, false)}
              <div className="ml-4 flex flex-col gap-3">
                {comments.filter((x) => x.parentId === comment.id).map((reply) => row(reply, true))}
                {replyTo === comment.id && replyBox}
              </div>
            </div>
          ))}
          {replyTo === "new" ? (
            replyBox
          ) : (
            <button type="button" onClick={() => setReplyTo("new")} className="self-start text-sm font-semibold underline">
              + {c.write}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
