"use client";

import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
import type { Locale } from "@/i18n/config";
import { PIECE_MOTION, type PieceKind, type PieceMotion, type ThemeColors, type ThemeEffectView } from "@/lib/site-theme";
import { drawPiece } from "./effect-pieces";

type Particle = {
  kind: PieceKind | number; // a drawn piece, or the index of an uploaded picture
  motion: PieceMotion;
  x: number;
  y: number;
  size: number;
  speed: number; // px per frame (at 60 frames a second)
  sway: number; // side-to-side (or up-and-down) distance
  phase: number;
  spin: number;
  angle: number;
  pick: number; // steady 0-1, picks the piece's color
  dir: 1 | -1; // pieces flying across: left to right or back
  age: number; // twinkling pieces: ms since they appeared
  life: number; // twinkling pieces: how long they show, ms
};

type Props = {
  effect: ThemeEffectView;
  lang: Locale;
  colors: ThemeColors;
  contained?: boolean; // inside its parent box (admin preview) instead of over the whole window
};

const rand = (min: number, max: number) => min + Math.random() * (max - min);

// Several pieces (snow, pumpkins, hearts, the admin's own pictures...) mixed together: most fall,
// some float up (ghosts, lanterns, balloons), bats fly across and stars twinkle in place. Pieces
// come in mixed sizes, and bigger ones move a little slower, which gives some depth.
// Never catches clicks, stops for visitors who ask for less motion, and uses fewer pieces on phones.
// It reads the current address (usePathname) to know whether this is the homepage, so it sits
// inside <Suspense>: pages can then still be built ahead of time (without it, "next build" fails
// with CLIENT_HOOK_DYNAMIC whenever a seasonal look with an effect is on).
export function ThemeEffect(props: Props) {
  return (
    <Suspense fallback={null}>
      <FallingPieces {...props} />
    </Suspense>
  );
}

function FallingPieces({ effect, lang, colors, contained = false }: Props) {
  const pathname = usePathname();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onHome = pathname === `/${lang}` || pathname === `/${lang}/`;
  const show = contained || effect.allPages || onHome;
  const { amount, speed, size, sizeMix } = effect;
  // Strings keep the effect from restarting on every render when nothing changed.
  // "?? []" guards against an older cached answer from the API, from before pieces could be mixed.
  const piecesKey = (effect.pieces ?? []).map((piece) => `${piece.kind}:${piece.weight}`).join(",");
  const imagesKey = (effect.images ?? []).join(" ");
  const colorsKey = [colors.btn, colors.accent, colors.bar].filter(Boolean).join(",");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!show || !canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // What can appear, with how often: few / some / many = 1 / 2 / 3; each picture counts as "some".
    const pool: { kind: PieceKind | number; weight: number }[] = [];
    for (const item of piecesKey ? piecesKey.split(",") : []) {
      const [kind, weight] = item.split(":");
      pool.push({ kind: kind as PieceKind, weight: Number(weight) || 2 });
    }
    const pictures = (imagesKey ? imagesKey.split(" ") : []).map((url) => {
      const image = new Image();
      image.src = url;
      return image;
    });
    pictures.forEach((_, index) => pool.push({ kind: index, weight: 2 }));
    if (pool.length === 0) return;
    const totalWeight = pool.reduce((sum, item) => sum + item.weight, 0);
    const lookColors = colorsKey ? colorsKey.split(",") : [];

    let width = 0;
    let height = 0;
    let particles: Particle[] = [];

    const pickKind = (): PieceKind | number => {
      let roll = Math.random() * totalWeight;
      for (const item of pool) {
        roll -= item.weight;
        if (roll <= 0) return item.kind;
      }
      return pool[0].kind;
    };

    const makeParticle = (fresh: boolean): Particle => {
      const kind = pickKind();
      const motion: PieceMotion = typeof kind === "number" ? "fall" : PIECE_MOTION[kind];
      const spread = 0.15 + (sizeMix / 100) * 0.55; // 0 = nearly the same size, 100 = small and big mixed
      const factor = 1 + rand(-1, 1) * spread;
      const pieceSize = (8 + (size / 100) * 22) * factor;
      const p: Particle = {
        kind,
        motion,
        x: rand(0, width),
        y: rand(0, height),
        size: pieceSize,
        speed: (0.3 + (speed / 100) * 1.8) * rand(0.8, 1.15) * (1.2 - 0.25 * factor),
        sway: rand(0.2, 1.2),
        phase: rand(0, Math.PI * 2),
        spin: rand(-0.04, 0.04),
        angle: rand(0, Math.PI * 2),
        pick: Math.random(),
        dir: Math.random() < 0.5 ? 1 : -1,
        age: 0,
        life: rand(2500, 5000),
      };
      // Pieces made at the start are spread over the screen; later ones come in from an edge.
      if (motion === "fall") p.y = fresh ? rand(-height, height) : rand(-60, -pieceSize);
      else if (motion === "rise") p.y = fresh ? rand(0, height * 2) : height + pieceSize + rand(0, 60);
      else if (motion === "across") {
        p.y = rand(0, height * 0.7);
        p.x = fresh ? rand(-width, width) : p.dir > 0 ? -pieceSize * 2 : width + pieceSize * 2;
        if (fresh && p.dir < 0) p.x = width - p.x;
      } else if (fresh) p.age = rand(0, p.life);
      return p;
    };

    const resize = () => {
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const box = contained ? canvas.parentElement : null;
      width = box ? box.clientWidth : window.innerWidth;
      height = box ? box.clientHeight : window.innerHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      const phone = width < 768 && !contained;
      const count = Math.max(4, Math.round((amount / 100) * (phone ? 40 : 90)));
      if (particles.length !== count) particles = Array.from({ length: count }, () => makeParticle(true));
    };
    resize();
    window.addEventListener("resize", resize);
    const observer = contained && canvas.parentElement ? new ResizeObserver(resize) : null;
    if (observer && canvas.parentElement) observer.observe(canvas.parentElement);

    const isGone = (p: Particle): boolean => {
      switch (p.motion) {
        case "fall":
          return p.y > height + p.size * 2 || p.x < -80 || p.x > width + 80;
        case "rise":
          return p.y < -p.size * 2.5 || p.x < -80 || p.x > width + 80;
        case "across":
          return p.dir > 0 ? p.x > width + p.size * 2 : p.x < -p.size * 2;
        case "twinkle":
          return p.age > p.life;
      }
    };

    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const elapsed = Math.min(50, now - last);
      const step = elapsed / (1000 / 60); // same speed on 60 Hz and 120 Hz screens
      last = now;
      ctx.clearRect(0, 0, width, height);
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const wobble = Math.sin(now / 1500 + p.phase) * p.sway * step;
        if (p.motion === "fall") {
          p.y += p.speed * step;
          p.x += wobble;
        } else if (p.motion === "rise") {
          p.y -= p.speed * 0.6 * step;
          p.x += wobble;
        } else if (p.motion === "across") {
          p.x += p.dir * p.speed * 2 * step;
          p.y += Math.sin(now / 400 + p.phase) * 0.6 * step;
        } else {
          p.age += elapsed;
        }
        p.angle += p.spin * step;
        if (isGone(p)) {
          particles[i] = makeParticle(false);
          continue;
        }

        ctx.save();
        ctx.translate(p.x, p.y);
        if (p.motion === "twinkle") ctx.globalAlpha = Math.max(0, Math.sin((Math.PI * p.age) / p.life));
        if (p.motion === "across" && p.dir < 0) ctx.scale(-1, 1);
        if (typeof p.kind === "number") {
          const image = pictures[p.kind];
          if (image?.complete && image.naturalWidth > 0) {
            ctx.rotate(Math.sin(p.angle) * 0.5);
            const ratio = image.naturalHeight / image.naturalWidth;
            const w = p.size * 1.4;
            ctx.drawImage(image, -w / 2, (-w * ratio) / 2, w, w * ratio);
          }
        } else {
          drawPiece(ctx, p.kind, p.size, { pick: p.pick, angle: p.angle, time: now, phase: p.phase, colors: lookColors });
        }
        ctx.restore();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      observer?.disconnect();
      ctx.clearRect(0, 0, width, height);
    };
  }, [show, contained, piecesKey, imagesKey, colorsKey, amount, speed, size, sizeMix]);

  if (!show) return null;
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none inset-0 h-full w-full ${contained ? "absolute z-10" : "fixed z-40"}`}
    />
  );
}
