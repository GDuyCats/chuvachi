"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { accountApi, ACCOUNT_CHANGED_EVENT } from "@/lib/account-api";
import { ApiError, request } from "@/lib/public-api";

type Labels = Dictionary["news"]["comments"];

type PostComment = {
  id: number;
  parentId: number | null;
  displayName: string;
  isShop: boolean;
  body: string | null;
  deleted: boolean;
  createdAt: string;
  mine: boolean;
};
type Thread = { allowComments: boolean; comments: PostComment[] };

function formatWhen(iso: string, lang: Locale): string {
  return new Intl.DateTimeFormat(lang === "vi" ? "vi-VN" : "en-GB", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(iso));
}

function errorText(labels: Labels, error: unknown): string {
  const code = error instanceof ApiError ? error.code : "UNKNOWN";
  return labels.errors[code as keyof typeof labels.errors] ?? labels.errors.UNKNOWN;
}

// Comments under a news post: signed-in customers write, reply (two levels), delete their own
// and report others'. When the shop switches comments off, old ones stay readable.
export function PostComments({ lang, slug, labels }: { lang: Locale; slug: string; labels: Labels }) {
  const [thread, setThread] = useState<Thread | null>(null);
  const [failed, setFailed] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [replyTo, setReplyTo] = useState<PostComment | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const base = `/api/posts/${encodeURIComponent(slug)}/comments`;

  const load = useCallback(async () => {
    try {
      setThread(await request<Thread>(base, { cache: "no-store" }));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [base]);

  useEffect(() => {
    setThread(null);
    setReplyTo(null);
    setMessage(null);
    void load();
  }, [load]);

  useEffect(() => {
    const check = () =>
      accountApi
        .current()
        .then((profile) => setSignedIn(profile !== null))
        .catch(() => setSignedIn(false));
    void check();
    window.addEventListener(ACCOUNT_CHANGED_EVENT, check);
    return () => window.removeEventListener(ACCOUNT_CHANGED_EVENT, check);
  }, []);

  const signInHref = `/${lang}/login?next=${encodeURIComponent(`/${lang}/news/${slug}`)}`;

  async function remove(comment: PostComment) {
    if (!window.confirm(labels.deleteConfirm)) return;
    try {
      await request(`/api/posts/comments/${comment.id}`, { method: "DELETE" });
      await load();
    } catch (error) {
      setMessage(errorText(labels, error));
    }
  }

  async function report(comment: PostComment) {
    if (!window.confirm(labels.reportConfirm)) return;
    try {
      await request(`/api/posts/comments/${comment.id}/report`, { method: "POST" });
      setMessage(labels.reported);
    } catch (error) {
      setMessage(errorText(labels, error));
    }
  }

  if (failed) return <p className="text-sm font-semibold">{labels.loadError}</p>;
  if (!thread) return <p className="text-sm text-muted">{labels.loading}</p>;

  const open = thread.allowComments;
  const topLevel = thread.comments.filter((c) => c.parentId === null);
  const repliesOf = (id: number) => thread.comments.filter((c) => c.parentId === id);
  const count = thread.comments.filter((c) => !c.deleted).length;

  const renderComment = (comment: PostComment, isReply: boolean) => (
    <div key={comment.id} className={`flex flex-col gap-1.5 ${isReply ? "border-l-[1.5px] border-black pl-4" : ""}`}>
      <div className="flex flex-wrap items-center gap-x-2 text-sm">
        <span className="font-bold">{comment.displayName}</span>
        {comment.isShop && (
          <span className="bg-black px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">{labels.shop}</span>
        )}
        <span className="text-muted">{formatWhen(comment.createdAt, lang)}</span>
      </div>
      {comment.deleted ? (
        <p className="text-sm italic text-muted">{labels.deleted}</p>
      ) : (
        <>
          <p className="whitespace-pre-line text-[15px]">{comment.body}</p>
          <div className="flex flex-wrap items-center gap-x-3">
            {open && (
              <button type="button" onClick={() => setReplyTo(comment)} className="min-h-9 text-sm font-semibold underline">
                {labels.reply}
              </button>
            )}
            {comment.mine ? (
              <button type="button" onClick={() => remove(comment)} className="min-h-9 text-xs text-muted underline">
                {labels.delete}
              </button>
            ) : (
              signedIn &&
              !comment.isShop && (
                <button type="button" onClick={() => report(comment)} className="min-h-9 text-xs text-muted underline">
                  {labels.report}
                </button>
              )
            )}
          </div>
        </>
      )}
    </div>
  );

  return (
    <section aria-labelledby="news-comments-title" className="flex flex-col gap-4">
      <h3 id="news-comments-title" className="text-lg font-bold uppercase tracking-wide">
        {count > 0 ? labels.titleCount.replace("{count}", String(count)) : labels.title}
      </h3>
      {!open && <p className="border-[1.5px] border-black px-3 py-2 text-sm font-semibold">{labels.closed}</p>}
      {topLevel.length === 0 && open && <p className="text-sm text-muted">{labels.empty}</p>}
      {topLevel.map((comment) => (
        <div key={comment.id} className="flex flex-col gap-3">
          {renderComment(comment, false)}
          <div className="ml-4 flex flex-col gap-3">
            {repliesOf(comment.id).map((reply) => renderComment(reply, true))}
            {open && replyTo && (replyTo.id === comment.id || replyTo.parentId === comment.id) && (
              <CommentForm
                base={base}
                parent={replyTo}
                labels={labels}
                signedIn={signedIn}
                signInHref={signInHref}
                onDone={(next) => {
                  setThread(next);
                  setReplyTo(null);
                }}
                onCancel={() => setReplyTo(null)}
              />
            )}
          </div>
        </div>
      ))}
      {message && <p className="text-sm font-semibold">{message}</p>}
      {open && (
        <CommentForm base={base} parent={null} labels={labels} signedIn={signedIn} signInHref={signInHref} onDone={setThread} />
      )}
    </section>
  );
}

type FormProps = {
  base: string;
  parent: PostComment | null;
  labels: Labels;
  signedIn: boolean;
  signInHref: string;
  onDone: (thread: Thread) => void;
  onCancel?: () => void;
};

function CommentForm({ base, parent, labels, signedIn, signInHref, onDone, onCancel }: FormProps) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!signedIn) {
    return (
      <Link href={signInHref} className="self-start text-sm font-semibold underline">
        {labels.signIn}
      </Link>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const parentId = parent ? (parent.parentId ?? parent.id) : null;
      onDone(await request<Thread>(base, { method: "POST", body: JSON.stringify({ body: text.trim(), parentId }) }));
      setText("");
    } catch (err) {
      setError(errorText(labels, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <textarea
        value={text}
        maxLength={1000}
        rows={2}
        autoFocus={parent !== null}
        onChange={(e) => setText(e.target.value)}
        placeholder={parent ? labels.writeReply.replace("{name}", parent.displayName) : labels.write}
        className="w-full border-[1.5px] border-black bg-white px-3 py-2 text-[15px]"
      />
      {error && <p className="text-sm font-semibold">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy || !text.trim()} className="min-h-10 bg-black px-4 text-sm font-bold text-white disabled:opacity-50">
          {busy ? labels.sending : labels.send}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="min-h-10 px-3 text-sm font-semibold underline">
            {labels.cancel}
          </button>
        )}
      </div>
    </form>
  );
}
