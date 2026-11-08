"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { ApiError } from "@/lib/public-api";
import { MAX_REVIEW_PHOTOS, reviewsApi, type ReviewableOrder } from "@/lib/reviews-api";
import { PhotoGrid, PhotoPicker } from "./Photos";
import { StarInput, Stars } from "./Stars";

type Labels = Dictionary["reviews"];

function errorText(labels: Labels, error: unknown): string {
  const code = error instanceof ApiError ? error.code : "UNKNOWN";
  return labels.errors[code as keyof typeof labels.errors] ?? labels.errors.UNKNOWN;
}

function showDate(date: string): string {
  return date.split("-").reverse().join("/");
}

// The cakes of a delivered order, each with a "Review" form. Used on the Track order page
// (with the order's code and phone) and on the Account page (orders of the signed-in customer).
export function ReviewableOrderBox({
  order,
  phone,
  labels,
  showCode = false,
}: {
  order: ReviewableOrder;
  phone: string | null;
  labels: Labels;
  showCode?: boolean;
}) {
  const [items, setItems] = useState(order.items);

  return (
    <section className="flex flex-col gap-4 border-[1.5px] border-black p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold">
          {showCode ? labels.form.order.replace("{code}", order.code) : labels.form.title}
        </h2>
        {order.canReview ? (
          <p className="text-sm text-muted">
            {labels.form.hint.replace("{deadline}", showDate(order.deadline))}
          </p>
        ) : (
          <p className="text-sm font-semibold">{order.reason === "TOO_LATE" ? labels.form.tooLate : labels.form.notDelivered}</p>
        )}
      </div>
      {order.canReview && (
        <ul className="flex flex-col">
          {items.map((item) => (
            <ReviewItem
              key={item.productSlug}
              code={order.code}
              phone={phone}
              item={item}
              labels={labels}
              onSaved={(review) =>
                setItems((list) => list.map((i) => (i.productSlug === item.productSlug ? { ...i, review } : i)))
              }
            />
          ))}
        </ul>
      )}
    </section>
  );
}

type Item = ReviewableOrder["items"][number];

function ReviewItem({
  code,
  phone,
  item,
  labels,
  onSaved,
}: {
  code: string;
  phone: string | null;
  item: Item;
  labels: Labels;
  onSaved: (review: NonNullable<Item["review"]>) => void;
}) {
  const [editing, setEditing] = useState(item.review === null);
  const [rating, setRating] = useState(item.review?.rating ?? 0);
  const [body, setBody] = useState(item.review?.body ?? "");
  const [photos, setPhotos] = useState<string[]>(item.review?.photos ?? []);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (rating === 0) {
      setMessage(labels.form.pickStars);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const saved = await reviewsApi.save({ code, phone, productSlug: item.productSlug, rating, body: body.trim(), photos });
      onSaved(saved);
      setPhotos(saved.photos);
      setEditing(false);
      setMessage(labels.form.saved);
    } catch (error) {
      setMessage(errorText(labels, error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-col gap-3 border-b border-line py-4 last:border-b-0">
      <div className="flex items-center gap-3">
        {item.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- small cake photo
          <img src={item.imageUrl} alt="" className="h-14 w-14 object-cover" />
        )}
        <div className="flex min-w-0 flex-col">
          <span className="font-bold">{item.name}</span>
          {item.options && <span className="text-sm text-muted">{item.options}</span>}
        </div>
      </div>

      {editing ? (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <span className="text-sm font-semibold">{labels.form.yourRating}</span>
          <StarInput value={rating} onChange={setRating} labels={labels.form.ratingWords} />
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            {labels.form.yourReview}
            <textarea
              value={body}
              maxLength={2000}
              rows={3}
              onChange={(e) => setBody(e.target.value)}
              placeholder={labels.form.placeholder}
              className="border-[1.5px] border-black px-3 py-2 text-[15px] font-normal"
            />
          </label>
          <PhotoPicker
            photos={photos}
            onChange={setPhotos}
            max={MAX_REVIEW_PHOTOS}
            upload={async (file) => (await reviewsApi.uploadReviewPhoto(file, { code, phone, productSlug: item.productSlug })).url}
            labels={labels.photos}
            errorText={(error) => errorText(labels, error)}
            onBusyChange={setUploading}
          />
          <button type="submit" disabled={busy || uploading} className="min-h-11 self-start bg-black px-5 text-sm font-bold text-white disabled:opacity-50">
            {busy ? labels.sending : item.review ? labels.form.update : labels.form.submit}
          </button>
        </form>
      ) : (
        item.review && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-3">
              <Stars value={item.review.rating} label={labels.outOfFive.replace("{count}", String(item.review.rating))} />
              <span className="text-xs font-bold uppercase tracking-wider">{labels.form.reviewed}</span>
              <button type="button" onClick={() => setEditing(true)} className="min-h-9 text-sm font-semibold underline">
                {labels.form.edit}
              </button>
            </div>
            {item.review.body && <p className="text-[15px]">{item.review.body}</p>}
            <PhotoGrid photos={item.review.photos} labels={labels.photos} size="sm" />
          </div>
        )
      )}
      {message && (
        <p role="status" className="text-sm font-semibold">
          {message}
        </p>
      )}
    </li>
  );
}

// Loads the delivered orders of the signed-in customer and shows a review box for each.
export function AccountReviews({ lang, labels }: { lang: Locale; labels: Labels }) {
  const [orders, setOrders] = useState<ReviewableOrder[] | null>(null);

  useEffect(() => {
    reviewsApi
      .forAccount(lang)
      .then(setOrders)
      .catch(() => setOrders([]));
  }, [lang]);

  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-display text-3xl uppercase">{labels.form.accountTitle}</h2>
      {orders === null && <p className="text-muted">{labels.loading}</p>}
      {orders && orders.length === 0 && <p className="text-muted">{labels.form.accountEmpty}</p>}
      {orders?.map((order) => (
        <ReviewableOrderBox key={order.code} order={order} phone={null} labels={labels} showCode />
      ))}
    </section>
  );
}
