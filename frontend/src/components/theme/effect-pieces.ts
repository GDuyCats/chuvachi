// Drawings of the seasonal falling pieces on a canvas, centered on (0, 0) and about `size` px wide.
// Shared by the shop pages' effect and the small icons in the admin.

import type { PieceKind } from "@/lib/site-theme";

const CANDY_COLORS = ["#e06d06", "#7b3fa0", "#43a047", "#e0436b", "#f2c230"];
const ORNAMENT_COLORS = ["#c0392b", "#d4a017", "#2e7d32", "#2f6fb0"];
const GIFT_COLORS = ["#c8102e", "#2e7d32", "#2f6fb0", "#7b3fa0"];
const BALLOON_COLORS = ["#e0436b", "#f2c230", "#2f80ed", "#43a047", "#9b51e0"];
const CONFETTI_FALLBACK = ["#c9a227", "#e0436b", "#2f80ed", "#27ae60"];

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

// Jack-o'-lantern: round orange body, green stem, dark face.
function drawPumpkin(ctx: CanvasRenderingContext2D, size: number) {
  const s = size / 2;
  ctx.fillStyle = "#e8741c";
  ctx.strokeStyle = "#a9500d";
  ctx.lineWidth = Math.max(1, s * 0.08);
  for (const dx of [-0.38, 0.38, 0]) {
    ctx.beginPath();
    ctx.ellipse(dx * s, s * 0.08, s * 0.55, s * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = "#4a6b2a";
  ctx.fillRect(-s * 0.09, -s * 0.85, s * 0.18, s * 0.3);
  ctx.fillStyle = "#2b1b33";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * s * 0.38, -s * 0.12);
    ctx.lineTo(side * s * 0.16, -s * 0.12);
    ctx.lineTo(side * s * 0.27, -s * 0.32);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(-s * 0.4, s * 0.2);
  ctx.quadraticCurveTo(0, s * 0.55, s * 0.4, s * 0.2);
  ctx.quadraticCurveTo(0, s * 0.38, -s * 0.4, s * 0.2);
  ctx.fill();
}

function drawSkull(ctx: CanvasRenderingContext2D, size: number) {
  const s = size / 2;
  ctx.fillStyle = "#f1ede4";
  ctx.strokeStyle = "#6b6b6b"; // outline so it shows on white pages too
  ctx.lineWidth = Math.max(1, s * 0.07);
  ctx.beginPath();
  ctx.arc(0, -s * 0.12, s * 0.62, Math.PI * 0.8, Math.PI * 2.2);
  ctx.lineTo(s * 0.32, s * 0.68);
  ctx.lineTo(-s * 0.32, s * 0.68);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#2a2a2a";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(side * s * 0.25, -s * 0.08, s * 0.16, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(0, s * 0.12);
  ctx.lineTo(-s * 0.08, s * 0.28);
  ctx.lineTo(s * 0.08, s * 0.28);
  ctx.closePath();
  ctx.fill();
}

// Wrapped sweet: round middle with a twist of wrapper on each side.
function drawCandy(ctx: CanvasRenderingContext2D, size: number, color: string) {
  const s = size / 2;
  ctx.fillStyle = color;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * s * 0.3, 0);
    ctx.lineTo(side * s * 0.85, -s * 0.32);
    ctx.lineTo(side * s * 0.85, s * 0.32);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
  ctx.lineWidth = Math.max(1, s * 0.1);
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.24, Math.PI * 1.1, Math.PI * 1.7);
  ctx.stroke();
}

// Bat seen from the front; "flap" (0-1) folds the wings.
function drawBat(ctx: CanvasRenderingContext2D, size: number, flap: number) {
  const s = size / 2;
  ctx.fillStyle = "#1c1420";
  ctx.save();
  ctx.scale(1, 0.55 + 0.45 * flap);
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.2);
  ctx.quadraticCurveTo(s * 0.5, -s * 0.7, s, -s * 0.3);
  ctx.quadraticCurveTo(s * 0.75, -s * 0.1, s * 0.8, s * 0.2);
  ctx.quadraticCurveTo(s * 0.55, 0, s * 0.45, s * 0.25);
  ctx.quadraticCurveTo(s * 0.25, s * 0.05, 0, s * 0.35);
  ctx.quadraticCurveTo(-s * 0.25, s * 0.05, -s * 0.45, s * 0.25);
  ctx.quadraticCurveTo(-s * 0.55, 0, -s * 0.8, s * 0.2);
  ctx.quadraticCurveTo(-s * 0.75, -s * 0.1, -s, -s * 0.3);
  ctx.quadraticCurveTo(-s * 0.5, -s * 0.7, 0, -s * 0.2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 170, 90, 0.55)"; // thin orange rim so bats also show on dark parts
  ctx.lineWidth = Math.max(1, s * 0.05);
  ctx.stroke();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(0, -s * 0.05, s * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffb347";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(side * s * 0.08, -s * 0.08, Math.max(0.8, s * 0.04), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawGhost(ctx: CanvasRenderingContext2D, size: number) {
  const s = size / 2;
  ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
  ctx.strokeStyle = "rgba(110, 110, 130, 0.6)";
  ctx.lineWidth = Math.max(1, s * 0.06);
  ctx.beginPath();
  ctx.arc(0, -s * 0.2, s * 0.55, Math.PI, 0);
  ctx.lineTo(s * 0.55, s * 0.7);
  for (let i = 0; i < 4; i++) {
    const x = s * 0.55 - ((i + 1) * s * 1.1) / 4;
    ctx.quadraticCurveTo(x + s * 0.14, i % 2 === 0 ? s * 0.5 : s * 0.85, x, s * 0.7);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#2a2a2a";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * s * 0.2, -s * 0.2, s * 0.09, s * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
  }
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

function drawOrnament(ctx: CanvasRenderingContext2D, size: number, color: string) {
  const s = size / 2;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, s * 0.12, s * 0.62, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#c9a227";
  ctx.fillRect(-s * 0.18, -s * 0.66, s * 0.36, s * 0.22);
  ctx.strokeStyle = "#c9a227";
  ctx.lineWidth = Math.max(1, s * 0.07);
  ctx.beginPath();
  ctx.arc(0, -s * 0.78, s * 0.12, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
  ctx.beginPath();
  ctx.ellipse(-s * 0.22, -s * 0.08, s * 0.12, s * 0.2, -0.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawCandyCane(ctx: CanvasRenderingContext2D, size: number) {
  const s = size / 2;
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(s * 0.05, s * 0.85);
    ctx.lineTo(s * 0.05, -s * 0.35);
    ctx.arc(-s * 0.25, -s * 0.35, s * 0.3, 0, Math.PI, true);
  };
  ctx.lineCap = "round";
  ctx.lineWidth = s * 0.3;
  ctx.strokeStyle = "#ffffff";
  path();
  ctx.stroke();
  ctx.strokeStyle = "#c62828";
  ctx.setLineDash([s * 0.18, s * 0.18]);
  path();
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawGift(ctx: CanvasRenderingContext2D, size: number, color: string) {
  const s = size / 2;
  ctx.fillStyle = color;
  ctx.fillRect(-s * 0.6, -s * 0.3, s * 1.2, s * 0.95);
  ctx.fillRect(-s * 0.7, -s * 0.5, s * 1.4, s * 0.28);
  ctx.fillStyle = "#f2c94c";
  ctx.fillRect(-s * 0.1, -s * 0.5, s * 0.2, s * 1.15);
  ctx.strokeStyle = "#f2c94c";
  ctx.lineWidth = Math.max(1, s * 0.12);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * s * 0.22, -s * 0.66, s * 0.22, s * 0.13, side * 0.5, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// Red envelope of lucky money.
function drawEnvelope(ctx: CanvasRenderingContext2D, size: number) {
  const s = size / 2;
  ctx.fillStyle = "#c8102e";
  ctx.fillRect(-s * 0.48, -s * 0.72, s * 0.96, s * 1.44);
  ctx.fillStyle = "#a50d26";
  ctx.beginPath();
  ctx.moveTo(-s * 0.48, -s * 0.72);
  ctx.lineTo(0, -s * 0.3);
  ctx.lineTo(s * 0.48, -s * 0.72);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#f2c230";
  ctx.beginPath();
  ctx.arc(0, -s * 0.25, s * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-s * 0.3, s * 0.3, s * 0.6, s * 0.08);
}

// Old gold coin with a square hole.
function drawCoin(ctx: CanvasRenderingContext2D, size: number) {
  const s = size / 2;
  ctx.fillStyle = "#e0b030";
  ctx.strokeStyle = "#a77b0a";
  ctx.lineWidth = Math.max(1, s * 0.08);
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.62, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.45, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.strokeRect(-s * 0.15, -s * 0.15, s * 0.3, s * 0.3);
  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.fillRect(-s * 0.13, -s * 0.13, s * 0.26, s * 0.26);
}

function drawRose(ctx: CanvasRenderingContext2D, size: number) {
  const s = size / 2;
  ctx.fillStyle = "#3f7d3a";
  ctx.beginPath();
  ctx.ellipse(s * 0.45, s * 0.45, s * 0.3, s * 0.14, 0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#c8102e";
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#8e0b20";
  ctx.lineWidth = Math.max(1, s * 0.08);
  ctx.beginPath();
  for (let t = 0; t < Math.PI * 5; t += 0.2) {
    const r = (s * 0.45 * t) / (Math.PI * 5);
    const x = Math.cos(t) * r;
    const y = Math.sin(t) * r;
    if (t === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

// Paper lantern with a warm glow.
function drawLantern(ctx: CanvasRenderingContext2D, size: number) {
  const s = size / 2;
  ctx.save();
  ctx.shadowColor = "rgba(255, 190, 80, 0.8)";
  ctx.shadowBlur = s * 0.6;
  ctx.fillStyle = "#d32f2f";
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.6, s * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "rgba(120, 20, 20, 0.6)";
  ctx.lineWidth = Math.max(1, s * 0.05);
  // Ribs of the paper.
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.28, s * 0.5, 0, 0, Math.PI * 2);
  ctx.moveTo(0, -s * 0.5);
  ctx.lineTo(0, s * 0.5);
  ctx.stroke();
  ctx.fillStyle = "#d4a017";
  ctx.fillRect(-s * 0.3, -s * 0.62, s * 0.6, s * 0.14);
  ctx.fillRect(-s * 0.3, s * 0.48, s * 0.6, s * 0.14);
  ctx.strokeStyle = "#d4a017";
  ctx.beginPath();
  ctx.moveTo(0, s * 0.62);
  ctx.lineTo(0, s * 0.95);
  ctx.stroke();
}

function drawMooncake(ctx: CanvasRenderingContext2D, size: number) {
  const s = size / 2;
  ctx.fillStyle = "#c98a3d";
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI * 2) / 12;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * s * 0.52, Math.sin(a) * s * 0.52, s * 0.16, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.56, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#8a5520";
  ctx.lineWidth = Math.max(1, s * 0.07);
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.36, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-s * 0.2, 0);
  ctx.lineTo(s * 0.2, 0);
  ctx.moveTo(0, -s * 0.2);
  ctx.lineTo(0, s * 0.2);
  ctx.stroke();
}

function drawBalloon(ctx: CanvasRenderingContext2D, size: number, color: string) {
  const s = size / 2;
  ctx.strokeStyle = "rgba(90, 90, 90, 0.7)";
  ctx.lineWidth = Math.max(1, s * 0.04);
  ctx.beginPath();
  ctx.moveTo(0, s * 0.62);
  ctx.quadraticCurveTo(s * 0.15, s * 0.9, -s * 0.05, s * 1.2);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.48, s * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-s * 0.08, s * 0.66);
  ctx.lineTo(s * 0.08, s * 0.66);
  ctx.lineTo(0, s * 0.56);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.beginPath();
  ctx.ellipse(-s * 0.18, -s * 0.22, s * 0.08, s * 0.16, -0.4, 0, Math.PI * 2);
  ctx.fill();
}

export type PieceLook = {
  pick: number; // 0-1, steady per piece: picks its color from the piece's palette
  angle: number; // turning, in radians
  time: number; // ms, for flapping and twinkling
  phase: number;
  colors?: string[]; // the look's own colors, used for confetti
};

const pickFrom = (list: string[], pick: number) => list[Math.floor(pick * list.length) % list.length];

// Draws one piece centered on (0, 0). The caller has already translated the canvas.
export function drawPiece(ctx: CanvasRenderingContext2D, kind: PieceKind, size: number, look: PieceLook): void {
  const { pick, angle, time, phase } = look;
  switch (kind) {
    case "snow":
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "rgba(110, 130, 150, 0.45)"; // a soft edge so flakes show on white pages too
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, size / 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    case "ornaments":
      ctx.rotate(Math.sin(angle) * 0.3);
      drawOrnament(ctx, size, pickFrom(ORNAMENT_COLORS, pick));
      break;
    case "candycanes":
      ctx.rotate(angle);
      drawCandyCane(ctx, size);
      break;
    case "stars":
      ctx.rotate(angle);
      ctx.fillStyle = "#f2c94c";
      drawStar(ctx, size);
      break;
    case "apricot":
      ctx.rotate(angle);
      drawBlossom(ctx, size, "#f2c230", "#b7700a");
      break;
    case "peach":
      ctx.rotate(angle);
      drawBlossom(ctx, size, "#f4a6c0", "#c2185b");
      break;
    case "envelopes":
      ctx.rotate(Math.sin(angle) * 0.5);
      drawEnvelope(ctx, size);
      break;
    case "coins":
      ctx.scale(Math.cos(angle * 2), 1); // spins as it falls
      drawCoin(ctx, size);
      break;
    case "hearts":
      ctx.rotate(Math.sin(angle) * 0.4);
      ctx.fillStyle = "#e0436b";
      drawHeart(ctx, size);
      break;
    case "roses":
      ctx.rotate(angle);
      drawRose(ctx, size);
      break;
    case "petals":
      ctx.rotate(angle);
      ctx.fillStyle = "rgba(240, 160, 185, 0.9)";
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 0.45, size * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "gifts":
      ctx.rotate(Math.sin(angle) * 0.4);
      drawGift(ctx, size, pickFrom(GIFT_COLORS, pick));
      break;
    case "pumpkins":
      ctx.rotate(Math.sin(angle) * 0.35);
      drawPumpkin(ctx, size);
      break;
    case "candy":
      ctx.rotate(angle);
      drawCandy(ctx, size, pickFrom(CANDY_COLORS, pick));
      break;
    case "skulls":
      ctx.rotate(Math.sin(angle) * 0.4);
      drawSkull(ctx, size);
      break;
    case "bats":
      drawBat(ctx, size * 1.3, Math.abs(Math.sin(time / 180 + phase)));
      break;
    case "ghosts":
      ctx.rotate(Math.sin(angle) * 0.25);
      drawGhost(ctx, size * 1.2);
      break;
    case "lanterns":
      ctx.rotate(Math.sin(angle) * 0.15);
      drawLantern(ctx, size * 1.2);
      break;
    case "mooncakes":
      ctx.rotate(angle);
      drawMooncake(ctx, size);
      break;
    case "confetti": {
      const palette = look.colors && look.colors.length > 0 ? [...look.colors, ...CONFETTI_FALLBACK] : CONFETTI_FALLBACK;
      ctx.rotate(angle);
      ctx.scale(1, Math.cos(angle * 2)); // flips as it turns
      ctx.fillStyle = pickFrom(palette, pick);
      ctx.fillRect(-size * 0.3, -size * 0.15, size * 0.6, size * 0.3);
      break;
    }
    case "balloons":
      ctx.rotate(Math.sin(angle) * 0.15);
      drawBalloon(ctx, size * 1.2, pickFrom(BALLOON_COLORS, pick));
      break;
  }
}
