import Link from "next/link";
import type { ReactNode } from "react";

// Shows the text of a news post. Admins write it in a small Markdown-like format:
//   ## Heading             -> heading
//   **bold**  *italic*     -> bold / italic
//   - item  /  1. item     -> lists
//   [text](https://...)    -> link (http/https or a page of this site starting with /)
//   ![caption](image url)  -> photo on its own line
//   > text                 -> highlighted quote
// Everything is turned into React elements (never raw HTML), so nothing in a post can run code.

function safeHref(url: string): string | null {
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
  } catch {
    return null;
  }
}

// Bold, italic and links inside one line or paragraph.
function inline(text: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let n = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const key = `${keyPrefix}-${n++}`;
    if (match[1] !== undefined) {
      parts.push(<strong key={key}>{match[1]}</strong>);
    } else if (match[2] !== undefined) {
      parts.push(<em key={key}>{match[2]}</em>);
    } else {
      const href = safeHref(match[4]);
      if (!href) {
        parts.push(match[3]);
      } else if (href.startsWith("/")) {
        parts.push(
          <Link key={key} href={href} className="font-semibold underline">
            {match[3]}
          </Link>,
        );
      } else {
        parts.push(
          <a key={key} href={href} target="_blank" rel="noopener noreferrer nofollow" className="font-semibold underline">
            {match[3]}
          </a>,
        );
      }
    }
    last = pattern.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

// Splits on blank lines; a paragraph's single line breaks are kept.
export function PostBody({ text }: { text: string }) {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return (
    <div className="flex flex-col gap-4 text-[16px] leading-relaxed">
      {blocks.map((raw, i) => {
        const block = raw.trim();
        if (!block) return null;
        const key = `b${i}`;
        const lines = block.split("\n");

        const image = block.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
        if (image) {
          const src = safeHref(image[2]);
          if (!src) return null;
          return (
            <figure key={key} className="flex flex-col gap-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element -- post photo, already resized on upload */}
              <img src={src} alt={image[1]} loading="lazy" className="w-full" />
              {image[1] && <figcaption className="text-sm text-muted">{image[1]}</figcaption>}
            </figure>
          );
        }
        if (/^#{1,3}\s/.test(block) && lines.length === 1) {
          return (
            <h3 key={key} className="pt-2 text-xl font-bold uppercase tracking-wide">
              {inline(block.replace(/^#{1,3}\s+/, ""), key)}
            </h3>
          );
        }
        if (lines.every((line) => /^\s*[-*]\s+/.test(line))) {
          return (
            <ul key={key} className="flex list-disc flex-col gap-1.5 pl-6">
              {lines.map((line, j) => (
                <li key={j}>{inline(line.replace(/^\s*[-*]\s+/, ""), `${key}-${j}`)}</li>
              ))}
            </ul>
          );
        }
        if (lines.every((line) => /^\s*\d+\.\s+/.test(line))) {
          return (
            <ol key={key} className="flex list-decimal flex-col gap-1.5 pl-6">
              {lines.map((line, j) => (
                <li key={j}>{inline(line.replace(/^\s*\d+\.\s+/, ""), `${key}-${j}`)}</li>
              ))}
            </ol>
          );
        }
        if (lines.every((line) => line.startsWith(">"))) {
          return (
            <blockquote key={key} className="border-l-[3px] border-black pl-4 italic">
              {inline(lines.map((line) => line.replace(/^>\s?/, "")).join(" "), key)}
            </blockquote>
          );
        }
        return (
          <p key={key}>
            {lines.map((line, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {inline(line, `${key}-${j}`)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
