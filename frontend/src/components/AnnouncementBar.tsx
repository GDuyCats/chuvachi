"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Locale } from "@/i18n/config";
import type { HomeContent } from "@/lib/api";
import { themeHref } from "@/lib/site-theme";
import { useSiteTheme } from "./theme/ThemeProvider";

type Props = {
  lang: Locale;
  content: HomeContent["announcement"];
  linkLabel: string;
};

const ROTATE_MS = 4500;

// Thin black bar above every page. Texts come from the admin "Homepage" page.
// The middle text may have several lines: each line is one message, shown in turn.
// While a seasonal look with its own message is on, that message (and its link) shows instead.
export function AnnouncementBar({ lang, content, linkLabel }: Props) {
  const theme = useSiteTheme();
  const seasonal = Boolean(theme?.message);
  const messages = ((seasonal ? theme?.message : content?.center) ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (messages.length < 2 || paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % messages.length), ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [messages.length, paused]);

  if (!content?.left && messages.length === 0 && !content?.right) {
    return null;
  }
  const href = seasonal
    ? themeHref(theme?.linkUrl ?? null, lang)
    : content?.productSlug
      ? `/${lang}/menu/${content.productSlug}`
      : `/${lang}/menu`;
  const external = Boolean(href?.startsWith("http"));

  return (
    <div
      className="flex items-center justify-between gap-3 bg-bar px-4 py-2.5 text-[13px] text-bar-ink md:px-6"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <span className="hidden font-semibold uppercase tracking-wide md:inline">{content?.left}</span>
      {messages.length > 0 && (
        <p className="mx-auto flex flex-wrap items-center justify-center gap-x-3 text-center font-semibold md:mx-0">
          {/* The key restarts the fade-in each time the message changes. */}
          <span key={index} className="animate-pop-in">
            {messages[index % messages.length]}
          </span>
          {href && (
            <Link href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})} className="whitespace-nowrap underline">
              {linkLabel}
            </Link>
          )}
        </p>
      )}
      <span className="hidden font-semibold uppercase tracking-wide md:inline">{content?.right}</span>
    </div>
  );
}
