// Review, comment and vote calls from the browser (see backend/src/routes/reviews.ts).

import type { Locale } from "@/i18n/config";
import { request } from "./public-api";
import { shrinkImage } from "./shrink-image";

export type ReviewSummary = { average: number; count: number; distribution: number[] }; // distribution: 1 to 5 stars

export type PublicReview = {
  id: number;
  displayName: string;
  rating: number;
  body: string | null;
  flavor: string | null;
  createdAt: string;
  edited: boolean;
  upvotes: number;
  downvotes: number;
  score: number;
  commentCount: number;
  shopReplied: boolean;
  myVote: number; // 1, 0 or -1
  photos: string[];
};

export type PublicComment = {
  id: number;
  parentId: number | null;
  displayName: string;
  isShop: boolean;
  body: string | null;
  photoUrl: string | null;
  deleted: boolean;
  createdAt: string;
  upvotes: number;
  downvotes: number;
  myVote: number;
  mine: boolean;
};

export type SavedReview = { id: number; rating: number; body: string | null; photos: string[] };

export const MAX_REVIEW_PHOTOS = 4;

export type ReviewableOrder = {
  code: string;
  deliveryDate: string;
  deadline: string;
  canReview: boolean;
  reason: "NOT_DELIVERED" | "TOO_LATE" | null;
  items: {
    productSlug: string;
    name: string;
    options: string | null;
    imageUrl: string | null;
    review: SavedReview | null;
  }[];
};

export const reviewsApi = {
  list: (slug: string, sort: "top" | "new", locale: Locale) =>
    request<{ summary: ReviewSummary; reviews: PublicReview[]; viewer: { canAddPhoto: boolean } }>(
      `/api/products/${encodeURIComponent(slug)}/reviews?sort=${sort}&locale=${locale}`,
      { cache: "no-store" },
    ),
  comments: (reviewId: number) => request<PublicComment[]>(`/api/reviews/${reviewId}/comments`, { cache: "no-store" }),
  addComment: (reviewId: number, body: string, parentId: number | null, photoUrl: string | null) =>
    request<PublicComment[]>(`/api/reviews/${reviewId}/comments`, {
      method: "POST",
      body: JSON.stringify({ body, parentId, photoUrl }),
    }),
  deleteComment: (commentId: number) => request<{ ok: true }>(`/api/reviews/comments/${commentId}`, { method: "DELETE" }),
  voteReview: (reviewId: number, value: -1 | 0 | 1) =>
    request<{ ok: true }>(`/api/reviews/${reviewId}/vote`, { method: "POST", body: JSON.stringify({ value }) }),
  voteComment: (commentId: number, value: -1 | 0 | 1) =>
    request<{ ok: true }>(`/api/reviews/comments/${commentId}/vote`, { method: "POST", body: JSON.stringify({ value }) }),
  reportReview: (reviewId: number) => request<{ ok: true }>(`/api/reviews/${reviewId}/report`, { method: "POST", body: "{}" }),
  reportComment: (commentId: number) =>
    request<{ ok: true }>(`/api/reviews/comments/${commentId}/report`, { method: "POST", body: "{}" }),
  // Cakes of one order that can be reviewed: by code and phone, or just the code for the owner's account.
  eligible: (code: string, phone: string | null, locale: Locale) =>
    request<ReviewableOrder>(`/api/reviews/eligible?locale=${locale}`, {
      method: "POST",
      body: JSON.stringify(phone ? { code, phone } : { code }),
    }),
  forAccount: (locale: Locale) => request<ReviewableOrder[]>(`/api/account/reviewable?locale=${locale}`, { cache: "no-store" }),
  save: (input: { code: string; phone: string | null; productSlug: string; rating: number; body: string; photos: string[] }) =>
    request<SavedReview>("/api/reviews", {
      method: "POST",
      body: JSON.stringify({ ...input, phone: input.phone ?? undefined }),
    }),
  // The buyer deletes their review for good (with its photos and comments).
  remove: (input: { code: string; phone: string | null; productSlug: string }) =>
    request<{ ok: true }>("/api/reviews/delete", {
      method: "POST",
      body: JSON.stringify({ ...input, phone: input.phone ?? undefined }),
    }),
  // A photo for a review (only for someone who may review this cake of this order). Returns its URL.
  uploadReviewPhoto: async (file: File, target: { code: string; phone: string | null; productSlug: string }) => {
    const form = new FormData();
    // Text fields first, so the server reads them before the file.
    form.append("code", target.code);
    if (target.phone) form.append("phone", target.phone);
    form.append("productSlug", target.productSlug);
    form.append("image", await shrinkImage(file));
    return request<{ url: string }>("/api/reviews/photos", { method: "POST", body: form });
  },
  // A photo for a comment (signed-in customers who bought this cake). Returns its URL.
  uploadCommentPhoto: async (reviewId: number, file: File) => {
    const form = new FormData();
    form.append("image", await shrinkImage(file));
    return request<{ url: string }>(`/api/reviews/${reviewId}/comment-photo`, { method: "POST", body: form });
  },
};
