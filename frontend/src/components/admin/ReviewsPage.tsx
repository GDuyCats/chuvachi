"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { adminApi, AdminApiError, type AdminReview, type AdminReviewList, type ReviewFilter } from "@/lib/admin-api";
import { useAdminI18n } from "./AdminI18n";
import { AdminRowsSkeleton } from "./AdminSkeletons";
import { useToast } from "./Toast";

const FILTERS: ReviewFilter[] = ["all", "reported", "low", "photos", "hidden"];

// A customer photo with a "Remove photo" button under it. Tapping the photo opens it full size.
function AdminPhoto({ url, removeLabel, onRemove }: { url: string; removeLabel: string; onRemove: () => void }) {
  return (
    <div className="flex w-24 flex-col gap-1">
      <a href={url} target="_blank" rel="noopener" className="block h-24 w-24 border border-[#e0e0e0]">
        {/* eslint-disable-next-line @next/next/no-img-element -- customer photo */}
        <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
      </a>
      <button type="button" onClick={onRemove} className="text-left text-xs font-semibold underline">
        {removeLabel}
      </button>
    </div>
  );
}

function stars(rating: number): string {
  return "★".repeat(rating) + "☆".repeat(5 - rating);
}

// Moderating reviews (admins and staff): read them, answer as the shop, hide spam or rude content.
export function ReviewsPage() {
  const router = useRouter();
  const toast = useToast();
  const { t, lang } = useAdminI18n();
  const r = t.reviews;
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [data, setData] = useState<AdminReviewList | null>(null);
  const [failed, setFailed] = useState(false);

  const handleError = useCallback(
    (error: unknown) => {
      if (error instanceof AdminApiError && error.status === 401) {
        router.replace("/admin/login");
        return;
      }
      toast.error(r.error);
    },
    [router, toast, r.error],
  );

  const load = useCallback(async () => {
    try {
      setData(await adminApi.listReviews(filter));
      setFailed(false);
    } catch (error) {
      if (error instanceof AdminApiError && error.status === 401) {
        router.replace("/admin/login");
        return;
      }
      setFailed(true);
    }
  }, [filter, router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>, done: string) {
    try {
      await action();
      toast.success(done);
      await load();
    } catch (error) {
      handleError(error);
    }
  }

  const productName = (product: { nameVi: string; nameEn: string }) => (lang === "vi" ? product.nameVi : product.nameEn);

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl uppercase md:text-[40px]">{r.title}</h1>
        <p className="text-sm text-muted">{r.hint}</p>
      </div>

      <div role="group" className="no-scrollbar flex gap-2 overflow-x-auto">
        {FILTERS.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={filter === option}
            onClick={() => setFilter(option)}
            className={`min-h-10 shrink-0 border-[1.5px] border-black px-3.5 text-sm font-bold ${filter === option ? "bg-black text-white" : "bg-white"}`}
          >
            {r.filters[option]}
          </button>
        ))}
      </div>

      {failed && <p className="border-[1.5px] border-black bg-white p-4 font-semibold">{r.loadError}</p>}
      {!data && !failed && <AdminRowsSkeleton label={r.loading} />}

      {data && data.reportedComments.length > 0 && (
        <section className="flex flex-col gap-3 border-[1.5px] border-black bg-white p-5">
          <h2 className="text-lg font-bold">{r.reportedComments}</h2>
          {data.reportedComments.map((comment) => (
            <div key={comment.id} className="flex flex-col gap-1.5 border-b border-[#eeeeee] pb-3 last:border-b-0">
              <span className="text-xs text-muted">
                {productName(comment.product)} · {comment.displayName} · {r.reports.replace("{count}", String(comment.reportCount))}
              </span>
              {comment.body && <p className="text-[15px]">{comment.body}</p>}
              {comment.photoUrl && (
                <AdminPhoto
                  url={comment.photoUrl}
                  removeLabel={r.removePhoto}
                  onRemove={() => {
                    if (window.confirm(r.removePhotoConfirm)) void run(() => adminApi.removeCommentPhoto(comment.id), r.photoRemoved);
                  }}
                />
              )}
              <div className="flex gap-2">
                <button type="button" onClick={() => run(() => adminApi.hideReviewComment(comment.id, true), r.hiddenDone)} className="min-h-9 bg-black px-3 text-xs font-bold text-white">
                  {r.hide}
                </button>
                <button type="button" onClick={() => run(() => adminApi.hideReviewComment(comment.id, false), r.keptDone)} className="min-h-9 border-[1.5px] border-black px-3 text-xs font-bold">
                  {r.keep}
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {data && data.reviews.length === 0 && (
        <p className="border border-dashed border-[#a8a8a8] bg-white p-6 text-center text-muted">{r.empty}</p>
      )}

      {data && (
        <ul className="flex flex-col gap-3">
          {data.reviews.map((review) => (
            <ReviewRow key={review.id} review={review} productName={productName(review.product)} run={run} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ReviewRow({
  review,
  productName,
  run,
}: {
  review: AdminReview;
  productName: string;
  run: (action: () => Promise<unknown>, done: string) => Promise<void>;
}) {
  const { t, lang } = useAdminI18n();
  const r = t.reviews;
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState("");

  async function reply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!text.trim()) return;
    await run(() => adminApi.replyToReview(review.id, text.trim(), null), r.replied);
    setText("");
    setReplying(false);
  }

  const date = new Date(review.createdAt).toLocaleDateString(lang === "vi" ? "vi-VN" : "en-GB");

  return (
    <li className={`flex flex-col gap-3 border bg-white p-4 ${review.hidden ? "border-dashed border-[#a8a8a8] opacity-70" : "border-[#e0e0e0]"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-bold">
          {productName} <span className="font-normal tracking-wider">{stars(review.rating)}</span>
        </span>
        <span className="text-xs text-muted">
          {review.displayName} · {r.order.replace("{code}", review.orderCode)} · {date}
        </span>
      </div>
      {review.flavor && <span className="text-xs text-muted">{review.flavor}</span>}
      {review.body ? <p className="whitespace-pre-line text-[15px]">{review.body}</p> : <p className="text-sm italic text-muted">{r.noText}</p>}
      {review.photos.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {review.photos.map((url) => (
            <AdminPhoto
              key={url}
              url={url}
              removeLabel={r.removePhoto}
              onRemove={() => {
                if (window.confirm(r.removePhotoConfirm)) void run(() => adminApi.removeReviewPhoto(review.id, url), r.photoRemoved);
              }}
            />
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="border border-[#a8a8a8] px-2 py-1">{r.votes.replace("{up}", String(review.upvotes)).replace("{down}", String(review.downvotes))}</span>
        {review.reportCount > 0 && <span className="border border-black px-2 py-1 font-bold">{r.reports.replace("{count}", String(review.reportCount))}</span>}
        {review.hidden && <span className="bg-black px-2 py-1 font-bold text-white">{r.hiddenBadge}</span>}
      </div>

      {review.comments.length > 0 && (
        <ul className="flex flex-col gap-2 bg-[#f7f7f7] p-3">
          {review.comments.map((comment) => (
            <li key={comment.id} className={`flex flex-col gap-1 ${comment.parentId ? "ml-4 border-l-[1.5px] border-black pl-3" : ""}`}>
              <span className="text-xs">
                <strong>{comment.displayName}</strong>
                {comment.hidden ? ` · ${r.hiddenBadge}` : ""}
                {comment.reportCount > 0 ? ` · ${r.reports.replace("{count}", String(comment.reportCount))}` : ""}
              </span>
              <p className={`text-sm ${comment.hidden || comment.deleted ? "text-muted line-through" : ""}`}>
                {comment.deleted ? r.deletedComment : comment.body}
              </p>
              {comment.photoUrl && !comment.deleted && (
                <AdminPhoto
                  url={comment.photoUrl}
                  removeLabel={r.removePhoto}
                  onRemove={() => {
                    if (window.confirm(r.removePhotoConfirm)) void run(() => adminApi.removeCommentPhoto(comment.id), r.photoRemoved);
                  }}
                />
              )}
              {!comment.deleted && !comment.isShop && (
                <button
                  type="button"
                  onClick={() => run(() => adminApi.hideReviewComment(comment.id, !comment.hidden), comment.hidden ? r.keptDone : r.hiddenDone)}
                  className="self-start text-xs font-semibold underline"
                >
                  {comment.hidden ? r.show : r.hide}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {replying ? (
        <form onSubmit={reply} className="flex flex-col gap-2">
          <textarea
            value={text}
            maxLength={1000}
            rows={3}
            autoFocus
            onChange={(e) => setText(e.target.value)}
            placeholder={r.replyPlaceholder}
            className="border-[1.5px] border-black px-3 py-2 text-[15px]"
          />
          <div className="flex gap-2">
            <button type="submit" disabled={!text.trim()} className="min-h-10 bg-black px-4 text-sm font-bold text-white disabled:opacity-50">
              {r.sendReply}
            </button>
            <button type="button" onClick={() => setReplying(false)} className="min-h-10 px-3 text-sm font-semibold underline">
              {r.cancel}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setReplying(true)} className="min-h-10 border-[1.5px] border-black px-3 text-sm font-bold">
            {r.reply}
          </button>
          <button
            type="button"
            onClick={() => run(() => adminApi.hideReview(review.id, !review.hidden), review.hidden ? r.keptDone : r.hiddenDone)}
            className="min-h-10 border-[1.5px] border-black px-3 text-sm font-bold"
          >
            {review.hidden ? r.show : r.hide}
          </button>
          {review.reportCount > 0 && !review.hidden && (
            <button type="button" onClick={() => run(() => adminApi.hideReview(review.id, false), r.keptDone)} className="min-h-10 px-3 text-sm font-semibold underline">
              {r.keep}
            </button>
          )}
          <a href={`/${lang}/menu/${review.product.slug}#reviews`} target="_blank" rel="noopener" className="flex min-h-10 items-center px-2 text-sm font-semibold underline">
            {r.viewOnShop}
          </a>
        </div>
      )}
    </li>
  );
}
