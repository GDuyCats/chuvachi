import Link from "next/link";
import type { ReactNode } from "react";

type Props = {
  code: string; // big number shown in the background, e.g. "404"
  title: string;
  body: string;
  links: { href: string; label: string; primary?: boolean }[];
  children?: ReactNode;
};

// Shared look for the "page not found" and "something went wrong" pages.
export function SystemMessage({ code, title, body, links, children }: Props) {
  return (
    <section className="flex min-h-[60vh] flex-col items-start justify-center gap-5 px-4 py-20 md:px-10">
      <span aria-hidden="true" className="font-display text-[120px] leading-none text-[#ececec] md:text-[180px]">
        {code}
      </span>
      <h1 className="font-display text-4xl uppercase md:text-6xl">{title}</h1>
      <p className="max-w-lg text-[17px] text-muted">{body}</p>
      <div className="flex flex-wrap gap-3 pt-2">
        {children}
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`flex min-h-12 items-center px-8 font-bold ${
              link.primary ? "bg-black text-white hover:bg-[#333333]" : "border-[1.5px] border-black"
            }`}
          >
            {link.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
