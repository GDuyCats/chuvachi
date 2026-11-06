"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
};

// Slides its content up gently the first time it scrolls into view.
// Content that is already on screen when the page opens is left alone (no flash),
// and without JavaScript everything simply stays visible.
export function Reveal({ children, className = "" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"static" | "hidden" | "shown">("static");

  useEffect(() => {
    const element = ref.current;
    if (!element || !("IntersectionObserver" in window)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Already visible: nothing to animate.
    if (element.getBoundingClientRect().top < window.innerHeight * 0.9) return;

    setState("hidden");
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setState("shown");
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} data-reveal={state === "static" ? undefined : state} className={className}>
      {children}
    </div>
  );
}
