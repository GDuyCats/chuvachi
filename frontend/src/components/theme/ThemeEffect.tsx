"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import type { Locale } from "@/i18n/config";
import type { ThemeColors, ThemeEffectView } from "@/lib/site-theme";

type Particle = {
  x: number;
  y: number;
  size: number;
  fall: number; // px per frame (at 60 frames a second)
  sway: number; // side-to-side distance
  phase: number;
  spin: number;
  angle: number;
  color: string;
};

type Props = {
  effect: ThemeEffectView;
  lang: Locale;
  colors: ThemeColors;
  contained?: boolean; // inside its parent box (admin preview) instead of over the whole window
};

const rand = (min: number, max: number) => min + Math.random() * (max - min);

// Flower with five round petals (apricot and peach blossoms).
function drawBlossom(ctx: CanvasRenderingContext2D, size: number, petal: string, middle: string) {
  ctx.fillStyle = petal;
  for (let i = 0; i < 5; i++) {
    const a = (i * 2 * Math.PI) / 5;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * size * 0.26, Math.sin(a) * size * 0.26, size * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = middle;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.1, 0, Math.PI * 2);
  ctx.fill();
}

function drawHeart(ctx: CanvasRenderingContext2D, size: number) {
  const s = size / 2;
  ctx.beginPath();
  ctx.moveTo(0, s * 0.7);
  ctx.bezierCurveTo(-s * 1.2, -s * 0.1, -s * 0.6, -s * 1.1, 0, -s * 0.45);
  ctx.bezierCurveTo(s * 0.6, -s * 1.1, s * 1.2, -s * 0.1, 0, s * 0.7);
  ctx.fill();
}

function drawStar(ctx: CanvasRenderingContext2D, size: number) {
  const outer = size / 2;
  const inner = outer * 0.45;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
}

// Snow, blossoms, hearts, stars, confetti or the admin's own picture falling gently over the page.
// Never catches clicks, stops for visitors who ask for less motion, and uses fewer pieces on phones.
export function ThemeEffect({ effect, lang, colors, contained = false }: Props) {
  const pathname = usePathname();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onHome = pathname === `/${lang}` || pathname === `/${lang}/`;
  const show = contained || effect.allPages || onHome;
  const { kind, imageUrl, amount, speed, size } = effect;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!show || !canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let image: HTMLImageElement | null = null;
    if (kind === "image" && imageUrl) {
      image = new Image();
      image.src = imageUrl;
    }

    const confettiColors = [colors.btn, colors.accent, colors.bar, "#c9a227", "#e0436b", "#2f80ed", "#27ae60"].filter(
      (color): color is string => Boolean(color),
    );
    let width = 0;
    let height = 0;
    let particles: Particle[] = [];

    const makeParticle = (anywhere: boolean): Particle => {
      const pieceSize = (6 + (size / 100) * 20) * rand(0.6, 1.2);
      return {
        x: rand(0, width),
        y: anywhere ? rand(-height, height) : rand(-60, -pieceSize),
        size: pieceSize,
        fall: (0.3 + (speed / 100) * 1.8) * rand(0.6, 1.2),
        sway: rand(0.2, 1.2),
        phase: rand(0, Math.PI * 2),
        spin: rand(-0.04, 0.04),
        angle: rand(0, Math.PI * 2),
        color: confettiColors[Math.floor(Math.random() * confettiColors.length)] ?? "#c9a227",
      };
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

    const draw = (p: Particle, time: number) => {
      ctx.save();
      ctx.translate(p.x, p.y);
      switch (kind) {
        case "snow":
          ctx.fillStyle = "#ffffff";
          ctx.strokeStyle = "rgba(110, 130, 150, 0.45)"; // a soft edge so flakes show on white pages too
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          break;
        case "apricot":
          ctx.rotate(p.angle);
          drawBlossom(ctx, p.size, "#f2c230", "#b7700a");
          break;
        case "peach":
          ctx.rotate(p.angle);
          drawBlossom(ctx, p.size, "#f4a6c0", "#c2185b");
          break;
        case "petals":
          ctx.rotate(p.angle);
          ctx.fillStyle = "rgba(240, 160, 185, 0.9)";
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size * 0.45, p.size * 0.22, 0, 0, Math.PI * 2);
          ctx.fill();
          break;
        case "hearts":
          ctx.rotate(Math.sin(p.angle) * 0.4);
          ctx.fillStyle = "#e0436b";
          drawHeart(ctx, p.size);
          break;
        case "stars":
          ctx.globalAlpha = 0.45 + 0.55 * Math.abs(Math.sin(time / 600 + p.phase)); // twinkle
          ctx.rotate(p.angle);
          ctx.fillStyle = "#f2c94c";
          drawStar(ctx, p.size);
          break;
        case "confetti":
          ctx.rotate(p.angle);
          ctx.scale(1, Math.cos(p.angle * 2)); // flips as it turns
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size * 0.3, -p.size * 0.15, p.size * 0.6, p.size * 0.3);
          break;
        case "image":
          if (image?.complete && image.naturalWidth > 0) {
            ctx.rotate(Math.sin(p.angle) * 0.5);
            const ratio = image.naturalHeight / image.naturalWidth;
            const w = p.size * 1.4;
            ctx.drawImage(image, -w / 2, (-w * ratio) / 2, w, w * ratio);
          }
          break;
      }
      ctx.restore();
    };

    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const step = Math.min(50, now - last) / (1000 / 60); // same speed on 60 Hz and 120 Hz screens
      last = now;
      ctx.clearRect(0, 0, width, height);
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.y += p.fall * step;
        p.x += Math.sin(now / 1500 + p.phase) * p.sway * step;
        p.angle += p.spin * step;
        if (p.y > height + p.size || p.x < -60 || p.x > width + 60) particles[i] = makeParticle(false);
        else draw(p, now);
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
  }, [show, contained, kind, imageUrl, amount, speed, size, colors.btn, colors.accent, colors.bar]);

  if (!show) return null;
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none inset-0 h-full w-full ${contained ? "absolute z-10" : "fixed z-40"}`}
    />
  );
}
