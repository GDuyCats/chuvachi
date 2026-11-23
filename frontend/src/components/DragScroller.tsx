"use client";

import { useEffect, useRef, type HTMLAttributes, type RefObject } from "react";

// A row that scrolls sideways. Phones already swipe it; this adds dragging with the mouse on
// computers: press anywhere in the row and drag, let go and it glides a little, then settles
// on the nearest card. A drag never counts as a click on the card under the pointer.
export function DragScroller({ children, className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  useDragScroll(ref);
  return (
    <div ref={ref} className={className} {...rest}>
      {children}
    </div>
  );
}

const START_PX = 5; // movement before a press becomes a drag (a smaller move is still a click)

export function useDragScroll(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const row = ref.current;
    if (!row) return;
    const element: HTMLElement = row;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let press: { x: number; scroll: number; lastX: number; lastTime: number; speed: number; dragging: boolean } | null = null;
    let glide = 0;
    let settleTimer = 0;
    const canScroll = () => element.scrollWidth > element.clientWidth + 1;
    // The "hand" pointer shows only when there is more to see.
    const showHand = () => {
      if (!press?.dragging) element.style.cursor = canScroll() && window.matchMedia("(pointer: fine)").matches ? "grab" : "";
    };
    const resize = new ResizeObserver(showHand);
    resize.observe(element);

    function stopGlide() {
      if (glide) window.cancelAnimationFrame(glide);
      glide = 0;
      window.clearTimeout(settleTimer);
    }

    // Scrolls to the card nearest to where the row stopped, then lets the CSS snapping take over again.
    function settle() {
      const start = element.getBoundingClientRect().left + parseFloat(getComputedStyle(element).paddingLeft || "0");
      let target = element.scrollLeft;
      let best = Infinity;
      for (const child of Array.from(element.children)) {
        const offset = element.scrollLeft + (child.getBoundingClientRect().left - start);
        const distance = Math.abs(offset - element.scrollLeft);
        if (distance < best) {
          best = distance;
          target = offset;
        }
      }
      target = Math.min(Math.max(0, target), element.scrollWidth - element.clientWidth);
      element.scrollTo({ left: target, behavior: reducedMotion ? "auto" : "smooth" });
      settleTimer = window.setTimeout(() => {
        element.style.scrollSnapType = "";
        element.style.scrollBehavior = "";
      }, reducedMotion ? 0 : 450);
    }

    function onPointerDown(event: PointerEvent) {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      if (!canScroll()) return; // nothing to scroll
      stopGlide();
      press = { x: event.clientX, scroll: element.scrollLeft, lastX: event.clientX, lastTime: event.timeStamp, speed: 0, dragging: false };
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);
    }

    function onPointerMove(event: PointerEvent) {
      if (!press) return;
      const dx = event.clientX - press.x;
      if (!press.dragging) {
        if (Math.abs(dx) < START_PX) return;
        press.dragging = true;
        element.style.scrollSnapType = "none"; // snapping would fight the drag
        element.style.scrollBehavior = "auto";
        element.style.cursor = "grabbing";
        document.body.style.userSelect = "none";
      }
      element.scrollLeft = press.scroll - dx;
      const time = event.timeStamp - press.lastTime;
      if (time > 0) press.speed = 0.8 * ((event.clientX - press.lastX) / time) + 0.2 * press.speed; // px per ms
      press.lastX = event.clientX;
      press.lastTime = event.timeStamp;
    }

    function onPointerUp() {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      const done = press;
      press = null;
      if (!done?.dragging) return;
      document.body.style.userSelect = "";
      showHand();
      // The click that follows the drag must not open the card under the pointer.
      const swallow = (click: MouseEvent) => {
        click.preventDefault();
        click.stopPropagation();
      };
      element.addEventListener("click", swallow, { capture: true, once: true });
      window.setTimeout(() => element.removeEventListener("click", swallow, { capture: true }), 0);

      let speed = reducedMotion ? 0 : done.speed * 16; // px per frame
      const step = () => {
        if (Math.abs(speed) < 0.5) {
          glide = 0;
          settle();
          return;
        }
        element.scrollLeft -= speed;
        speed *= 0.92;
        glide = window.requestAnimationFrame(step);
      };
      step();
    }

    const noNativeDrag = (event: DragEvent) => event.preventDefault(); // photos and links would start a file drag
    element.addEventListener("pointerdown", onPointerDown);
    element.addEventListener("dragstart", noNativeDrag);
    return () => {
      resize.disconnect();
      stopGlide();
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("dragstart", noNativeDrag);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [ref]);
}
