"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import { scrollToSection } from "@/lib/hash-nav";

type NavLink = { href: string; label: string };

// The main menu. Links to a section of the page already open just scroll there.
export function HeaderNav({ label, links }: { label: string; links: NavLink[] }) {
  function onClick(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    if (scrollToSection(href)) event.preventDefault();
  }

  return (
    <nav
      aria-label={label}
      className="no-scrollbar order-3 flex w-full gap-6 overflow-x-auto whitespace-nowrap text-[15px] font-semibold md:order-none md:w-auto md:gap-9"
    >
      {links.map((link) => (
        <Link key={link.label} href={link.href} onClick={(event) => onClick(event, link.href)} className="py-2 hover:text-muted">
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
