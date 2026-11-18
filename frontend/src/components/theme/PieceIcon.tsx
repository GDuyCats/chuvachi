"use client";

import { useEffect, useRef } from "react";
import type { PieceKind } from "@/lib/site-theme";
import { drawPiece } from "./effect-pieces";

// A still picture of one falling piece, for the admin list of pieces.
export function PieceIcon({ kind, size = 28 }: { kind: PieceKind; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size * ratio;
    canvas.height = size * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.translate(size / 2, size / 2);
    drawPiece(ctx, kind, size * 0.72, { pick: 0.3, angle: 0.15, time: 0, phase: 0 });
  }, [kind, size]);

  return <canvas ref={canvasRef} aria-hidden="true" style={{ width: size, height: size }} className="shrink-0" />;
}
