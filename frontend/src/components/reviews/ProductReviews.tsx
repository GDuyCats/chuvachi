"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { accountApi, ACCOUNT_CHANGED_EVENT } from "@/lib/account-api";
import { ApiError } from "@/lib/public-api";
import { reviewsApi, type PublicComment, type PublicReview, type ReviewSummary } from "@/lib/reviews-api";
import { PhotoGrid, PhotoPicker } from "./Photos";
import { Stars } from "./Stars";
import { VoteButtons } from "./VoteButtons";

type Labels = Dictionary["reviews"];

type Props = {
  lang: Locale;
  slug: string;
  labels: Labels;
};

function formatDate(iso: string, lang: Locale): string {
  return new Intl.DateTimeFormat(lang === "vi" ? "vi-VN" : "en-GB", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(iso));
}

function errorText(labels: Labels, error: unknown): string {
  const code = error instanceof ApiError ? error.code : "UNKNOWN";
  return labels.errors[code as keyof typeof labels.errors] ?? labels.errors.UNKNOWN;
}

// Reviews of one cake: summary, sorting, votes, comments with one level of replies, and reports.
// Only buyers can review (from Track order or Account); signed-in customers can comment and vote.
export function ProductReviews({ lang, slug, labels }: Props) {
  const [sort, setSort] = useState<"top" | "new">("top");
  const [data, setData] = useState<{ summary: ReviewSummary; reviews: PublicReview[]; viewer: { canAddPhoto: boolean } } | null>(
    null,
  );
  const [failed, setFailed] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await reviewsApi.list(slug, sort, lang));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [slug, sort, lang]);

  useEffect(() => {
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

  const signInHref = `/${lang}/login?next=${encodeURIComponent(`/${lang}/menu/${slug}#reviews`)}`;

  function updateReview(id: number, change: Partial<PublicReview>) {
    setData((current) =>
      current ? { ...current, reviews: current.reviews.map((r) => (r.id === id ? { ...r, ...change } : r)) } : current,
    );
  }

  return (
    <section id="reviews" className="flex scroll-mt-6 flex-col gap-6 px-4 pb-16 md:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4 border-t border-ink pt-10">
        <h2 className="font-display text-[32px] uppercase tracking-wide md:text-[40px]">{labels.title}</h2>
        {data && data.reviews.length > 1 && (
          <div role="group" className="flex border-[1.5px] border-black text-sm font-bold">
            {(["top", "new"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={sort === option}
                onClick={() => setSort(option)}
                className={`min-h-10 px-3.5 ${sort === option ? "bg-black text-white" : "bg-white"}`}
              >
                {option === "top" ? labels.sortTop : labels.sortNew}
              </button>
            ))}
          </div>
        )}
      </div>

      {failed && <p className="border-[1.5px] border-black p-4 font-semibold">{labels.loadError}</p>}
      {!data && !failed && <p className="text-muted">{labels.loading}</p>}

      {data && (
        <>
          {data.summary.count > 0 ? (
            <Summary summary={data.summary} labels={labels} />
          ) : (
            <p className="border border-dashed border-[#a8a8a8] p-6 text-center text-muted">{labels.noReviews}</p>
          )}
          <p className="text-sm text-muted">
            {labels.howTo}{" "}
            <Link href={`/${lang}/track`} className="font-semibold text-ink underline">
              {labels.trackLink}
            </Link>
          </p>
          {!signedIn && data.summary.count > 0 && (
            <p className="text-sm">
              <Link href={signInHref} className="font-semibold underline">
                {labels.signInToComment}
              </Link>
            </p>
          )}
          <ul className="flex flex-col">
            {data.reviews.map((review) => (
              <ReviewCard
                key={review.id}
                lang={lang}
                review={review}
                labels={labels}
                signedIn={signedIn}
                canAddPhoto={data.viewer.canAddPhoto}
                signInHref={signInHref}
                onChange={(change) => updateReview(review.id, change)}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function Summary({ summary, labels }: { summary: ReviewSummary; labels: Labels }) {
  const top = Math.max(...summary.distribution, 1);
  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-10">
      <div className="flex flex-col gap-1">
        <span className="font-display text-6xl leading-none">{summary.average.toFixed(1)}</span>
        <Stars value={summary.average} size={20} label={labels.outOfFive.replace("{count}", summary.average.toFixed(1))} />
        <span className="text-sm text-muted">{labels.count.replace("{count}", String(summary.count))}</span>
      </div>
      <ul className="flex w-full max-w-sm flex-col gap-1.5">
        {[5, 4, 3, 2, 1].map((stars) => {
          const count = summary.distribution[stars - 1] ?? 0;
          return (
            <li key={stars} className="grid grid-cols-[52px_1fr_32px] items-center gap-2 text-sm">
              <span>{labels.starsShort.replace("{count}", String(stars))}</span>
              <span className="h-2 bg-[#eeeeee]" aria-hidden="true">
                <span className="block h-full bg-black" style={{ width: `${(count / top) * 100}%` }} />
              </span>
              <span className="text-right text-muted">{count}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type CardProps = {
  lang: Locale;
  review: PublicReview;
  labels: Labels;
  signedIn: boolean;
  canAddPhoto: boolean;
  signInHref: string;
  onChange: (change: Partial<PublicReview>) => void;
};

function ReviewCard({ lang, review, labels, signedIn, canAddPhoto, signInHref, onChange }: CardProps) {
  const [open, setOpen] = useState(false);
  const [reported, setReported] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function voteReview(value: -1 | 0 | 1) {
    if (!signedIn) {
      setMessage(labels.signInToVote);
      return;
    }
    const old = review.myVote;
    // Show the vote straight away; undo if the server refuses.
    const up = review.upvotes + (value === 1 ? 1 : 0) - (old === 1 ? 1 : 0);
    const down = review.downvotes + (value === -1 ? 1 : 0) - (old === -1 ? 1 : 0);
    onChange({ myVote: value, upvotes: up, downvotes: down });
    try {
      await reviewsApi.voteReview(review.id, value);
    } catch (error) {
      onChange({ myVote: old, upvotes: review.upvotes, downvotes: review.downvotes });
      setMessage(errorText(labels, error));
    }
  }

  async function reportReview() {
    if (!signedIn) {
      setMessage(labels.signInToVote);
      return;
    }
    if (!window.confirm(labels.reportConfirm)) return;
    try {
      await reviewsApi.reportReview(review.id);
      setReported(true);
    } catch (error) {
      setMessage(errorText(labels, error));
    }
  }

  return (
    <li className="flex flex-col gap-3 border-b border-line py-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Stars value={review.rating} label={labels.outOfFive.replace("{count}", String(review.rating))} />
        <span className="font-bold">{review.displayName}</span>
        <span className="border border-black px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">{labels.verified}</span>
        <span className="text-sm text-muted">
          {formatDate(review.createdAt, lang)}
          {review.edited ? ` · ${labels.edited}` : ""}
        </span>
      </div>
      {review.flavor && <span className="text-sm text-muted">{labels.bought.replace("{flavor}", review.flavor)}</span>}
      {review.body && <p className="whitespace-pre-line text-[15px] leading-relaxed">{review.body}</p>}
      <PhotoGrid photos={review.photos} labels={labels.photos} />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <VoteButtons up={review.upvotes} down={review.downvotes} myVote={review.myVote} onVote={voteReview} labels={labels} />
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="min-h-9 text-sm font-semibold underline">
          {open ? labels.hideComments : review.commentCount > 0 ? labels.comments.replace("{count}", String(review.commentCount)) : labels.comment}
        </button>
        {review.shopReplied && !open && <span className="text-xs font-bold uppercase tracking-wider">{labels.shopReplied}</span>}
        {reported ? (
          <span className="text-xs text-muted">{labels.reported}</span>
        ) : (
          <button type="button" onClick={reportReview} className="min-h-9 text-xs text-muted underline">
            {labels.report}
          </button>
        )}
      </div>
      {message && (
        <p role="status" className="text-sm font-semibold">
          {message}{" "}
          {!signedIn && (
            <Link href={signInHref} className="underline">
              {labels.signIn}
            </Link>
          )}
        </p>
      )}

      {open && (
        <CommentThread
          lang={lang}
          reviewId={review.id}
          labels={labels}
          signedIn={signedIn}
          canAddPhoto={canAddPhoto}
          signInHref={signInHref}
          onCount={(count) => onChange({ commentCount: count })}
        />
      )}
    </li>
  );
}

type ThreadProps = {
  lang: Locale;
  reviewId: number;
  labels: Labels;
  signedIn: boolean;
  canAddPhoto: boolean;
  signInHref: string;
  onCount: (count: number) => void;
};

function CommentThread({ lang, reviewId, labels, signedIn, canAddPhoto, signInHref, onCount }: ThreadProps) {
  const [comments, setComments] = useState<PublicComment[] | null>(null);
  const [replyTo, setReplyTo] = useState<PublicComment | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const apply = useCallback(
    (list: PublicComment[]) => {
      setComments(list);
      onCount(list.filter((c) => !c.deleted).length);
    },
    [onCount],
  );

  useEffect(() => {
    reviewsApi
      .comments(reviewId)
      .then(setComments)
      .catch(() => setMessage(labels.loadError));
  }, [reviewId, labels.loadError]);

  function patch(id: number, change: Partial<PublicComment>) {
    setComments((list) => list?.map((c) => (c.id === id ? { ...c, ...change } : c)) ?? null);
  }

  async function voteComment(comment: PublicComment, value: -1 | 0 | 1) {
    if (!signedIn) {
      setMessage(labels.signInToVote);
      return;
    }
    const old = comment.myVote;
    patch(comment.id, {
      myVote: value,
      upvotes: comment.upvotes + (value === 1 ? 1 : 0) - (old === 1 ? 1 : 0),
      downvotes: comment.downvotes + (value === -1 ? 1 : 0) - (old === -1 ? 1 : 0),
    });
    try {
      await reviewsApi.voteComment(comment.id, value);
    } catch (error) {
      patch(comment.id, { myVote: old, upvotes: comment.upvotes, downvotes: comment.downvotes });
      setMessage(errorText(labels, error));
    }
  }

  async function remove(comment: PublicComment) {
    if (!window.confirm(labels.deleteConfirm)) return;
    try {
      await reviewsApi.deleteComment(comment.id);
      apply(await reviewsApi.comments(reviewId));
    } catch (error) {
      setMessage(errorText(labels, error));
    }
  }

  async function reportComment(comment: PublicComment) {
    if (!window.confirm(labels.reportConfirm)) return;
    try {
      await reviewsApi.reportComment(comment.id);
      setMessage(labels.reported);
    } catch (error) {
      setMessage(errorText(labels, error));
    }
  }

  if (!comments) return <p className="pl-4 text-sm text-muted">{message ?? labels.loading}</p>;

  const topLevel = comments.filter((c) => c.parentId === null);
  const repliesOf = (id: number) => comments.filter((c) => c.parentId === id);

  const renderComment = (comment: PublicComment, isReply: boolean) => (
    <div key={comment.id} className={`flex flex-col gap-1.5 ${isReply ? "border-l-[1.5px] border-black pl-4" : ""}`}>
      <div className="flex flex-wrap items-center gap-x-2 text-sm">
        <span className="font-bold">{comment.displayName}</span>
        {comment.isShop && (
          <span className="bg-black px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">{labels.shop}</span>
        )}
        <span className="text-muted">{formatDate(comment.createdAt, lang)}</span>
      </div>
      {comment.deleted ? (
        <p className="text-sm italic text-muted">{labels.deleted}</p>
      ) : (
        <>
          {comment.body && <p className="whitespace-pre-line text-[15px]">{comment.body}</p>}
          {comment.photoUrl && <PhotoGrid photos={[comment.photoUrl]} labels={labels.photos} size="sm" />}
          <div className="flex flex-wrap items-center gap-x-3">
            <VoteButtons up={comment.upvotes} down={comment.downvotes} myVote={comment.myVote} onVote={(v) => voteComment(comment, v)} labels={labels} />
            <button type="button" onClick={() => setReplyTo(comment)} className="min-h-9 text-sm font-semibold underline">
              {labels.reply}
            </button>
            {comment.mine ? (
              <button type="button" onClick={() => remove(comment)} className="min-h-9 text-xs text-muted underline">
                {labels.deleteComment}
              </button>
            ) : (
              signedIn && (
                <button type="button" onClick={() => reportComment(comment)} className="min-h-9 text-xs text-muted underline">
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
    <div className="flex flex-col gap-4 bg-surface p-4">
      {topLevel.length === 0 && <p className="text-sm text-muted">{labels.noComments}</p>}
      {topLevel.map((comment) => (
        <div key={comment.id} className="flex flex-col gap-3">
          {renderComment(comment, false)}
          <div className="ml-4 flex flex-col gap-3">
            {repliesOf(comment.id).map((reply) => renderComment(reply, true))}
            {replyTo && (replyTo.id === comment.id || replyTo.parentId === comment.id) && (
              <CommentForm
                reviewId={reviewId}
                parent={replyTo}
                labels={labels}
                signedIn={signedIn}
                canAddPhoto={canAddPhoto}
                signInHref={signInHref}
                onDone={(list) => {
                  apply(list);
                  setReplyTo(null);
                }}
                onCancel={() => setReplyTo(null)}
              />
            )}
          </div>
        </div>
      ))}
      {message && <p className="text-sm font-semibold">{message}</p>}
      <CommentForm
        reviewId={reviewId}
        parent={null}
        labels={labels}
        signedIn={signedIn}
        canAddPhoto={canAddPhoto}
        signInHref={signInHref}
        onDone={apply}
      />
    </div>
  );
}

type FormProps = {
  reviewId: number;
  parent: PublicComment | null;
  labels: Labels;
  signedIn: boolean;
  canAddPhoto: boolean; // only people who bought this cake
  signInHref: string;
  onDone: (comments: PublicComment[]) => void;
  onCancel?: () => void;
};

function CommentForm({ reviewId, parent, labels, signedIn, canAddPhoto, signInHref, onDone, onCancel }: FormProps) {
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!signedIn) {
    return (
      <Link href={signInHref} className="self-start text-sm font-semibold underline">
        {labels.signInToComment}
      </Link>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!text.trim() && photos.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      // Replies to a reply go under the same top comment (two levels only).
      const parentId = parent ? (parent.parentId ?? parent.id) : null;
      onDone(await reviewsApi.addComment(reviewId, text.trim(), parentId, photos[0] ?? null));
      setText("");
      setPhotos([]);
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
        placeholder={parent ? labels.writeReply.replace("{name}", parent.displayName) : labels.writeComment}
        className="w-full border-[1.5px] border-black bg-white px-3 py-2 text-[15px]"
      />
      {canAddPhoto && (
        <PhotoPicker
          photos={photos}
          onChange={setPhotos}
          max={1}
          upload={async (file) => (await reviewsApi.uploadCommentPhoto(reviewId, file)).url}
          labels={labels.photos}
          errorText={(err) => errorText(labels, err)}
          onBusyChange={setUploading}
        />
      )}
      {error && <p className="text-sm font-semibold">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy || uploading || (!text.trim() && photos.length === 0)} className="min-h-10 bg-black px-4 text-sm font-bold text-white disabled:opacity-50">
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
