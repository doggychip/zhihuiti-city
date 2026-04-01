/** Canvas renderer — pixel art Sprout Lands style with economy buildings. */

import type { CityAgent } from "./agent";
import type { StatsData } from "./api";
import type { SpriteAssets } from "./sprites";
import { TILE } from "./sprites";
import type { WorldMap, Decoration } from "./worldgen";
import { TileType } from "./worldgen";
import type { CityEconomy, PlacedBuilding } from "./economy";
import { BUILDING_EMOJI } from "./economy";

let assets: SpriteAssets | null = null;
let world: WorldMap | null = null;
let economy: CityEconomy | null = null;

/** Pre-rendered background canvas for static tiles (grass, paths, worldgen decorations). */
let bgCanvas: HTMLCanvasElement | null = null;

let waterFrame = 0;
let waterTimer = 0;

export function setAssets(a: SpriteAssets) { assets = a; }
export function setWorld(w: WorldMap) { world = w; invalidateBg(); }
export function setEconomy(e: CityEconomy) { economy = e; }

function invalidateBg() { bgCanvas = null; }

// ── Grass tile source rects ──
const GRASS_TILES = [
  { sx: 16, sy: 16, sw: 16, sh: 16 },
  { sx:  0, sy: 80, sw: 16, sh: 16 },
  { sx: 16, sy: 80, sw: 16, sh: 16 },
  { sx: 32, sy: 80, sw: 16, sh: 16 },
  { sx: 16, sy: 96, sw: 16, sh: 16 },
];
const GRASS_FLOWER = { sx: 48, sy: 80, sw: 16, sh: 16 };
const GRASS_DARK   = { sx: 64, sy: 80, sw: 16, sh: 16 };
const PATH_TILE = { sx: 0, sy: 16, sw: 16, sh: 16 };

// ── Decoration source rects ──
const DECO: Record<string, { img: keyof SpriteAssets; sx: number; sy: number; sw: number; sh: number }> = {
  tree_green:  { img: "biomeThings", sx: 0,  sy: 0,  sw: 32, sh: 32 },
  tree_pink:   { img: "biomeThings", sx: 32, sy: 0,  sw: 32, sh: 32 },
  bush:        { img: "biomeThings", sx: 64, sy: 48, sw: 16, sh: 16 },
  rock:        { img: "biomeThings", sx: 48, sy: 32, sw: 16, sh: 16 },
  flower:      { img: "biomeThings", sx: 96, sy: 48, sw: 16, sh: 16 },
  mushroom:    { img: "biomeThings", sx: 0,  sy: 48, sw: 16, sh: 16 },
  pumpkin:     { img: "biomeThings", sx: 48, sy: 48, sw: 16, sh: 16 },
  fence_h:     { img: "fences",      sx: 0,  sy: 0,  sw: 16, sh: 16 },
  fence_v:     { img: "fences",      sx: 0,  sy: 16, sw: 16, sh: 16 },
  plant:       { img: "plants",      sx: 48, sy: 0,  sw: 16, sh: 16 },
  chest:       { img: "furniture",   sx: 64, sy: 64, sw: 16, sh: 16 },
};

const HOUSE_WALL_W = 80;
const HOUSE_WALL_H = 48;

// ── Background (cached, static worldgen only) ──

function buildBackground(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const cx = c.getContext("2d")!;
  cx.imageSmoothingEnabled = false;

  if (!assets || !world) return c;

  const { cols, rows, tiles, decorations } = world;

  for (let r = 0; r < rows; r++) {
    for (let c2 = 0; c2 < cols; c2++) {
      const px = c2 * TILE;
      const py = r * TILE;
      const tile = tiles[r][c2];

      if (tile === TileType.WATER) {
        continue;
      } else if (tile === TileType.PATH) {
        const gt = GRASS_TILES[0];
        cx.drawImage(assets.grass, gt.sx, gt.sy, gt.sw, gt.sh, px, py, TILE, TILE);
        cx.drawImage(assets.paths, PATH_TILE.sx, PATH_TILE.sy, PATH_TILE.sw, PATH_TILE.sh, px, py, TILE, TILE);
      } else if (tile === TileType.GRASS_VAR1) {
        cx.drawImage(assets.grass, GRASS_FLOWER.sx, GRASS_FLOWER.sy, GRASS_FLOWER.sw, GRASS_FLOWER.sh, px, py, TILE, TILE);
      } else if (tile === TileType.GRASS_VAR2) {
        cx.drawImage(assets.grass, GRASS_DARK.sx, GRASS_DARK.sy, GRASS_DARK.sw, GRASS_DARK.sh, px, py, TILE, TILE);
      } else {
        const idx = ((r * 7 + c2 * 13) & 0x7fffffff) % GRASS_TILES.length;
        const gt = GRASS_TILES[idx];
        cx.drawImage(assets.grass, gt.sx, gt.sy, gt.sw, gt.sh, px, py, TILE, TILE);
      }
    }
  }

  for (const d of decorations) {
    drawDecoration(cx, d);
  }

  return c;
}

function drawWater(ctx: CanvasRenderingContext2D) {
  if (!assets || !world) return;
  const { cols, rows, tiles } = world;
  const sx = waterFrame * 16;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (tiles[r][c] === TileType.WATER) {
        ctx.drawImage(assets.water, sx, 0, 16, 16, c * TILE, r * TILE, TILE, TILE);
      }
    }
  }
}

function drawDecoration(cx: CanvasRenderingContext2D, d: Decoration) {
  if (!assets) return;
  const px = d.tx * TILE;
  const py = d.ty * TILE;

  if (d.type === "house") {
    cx.drawImage(assets.walls, 0, 0, HOUSE_WALL_W, HOUSE_WALL_H, px, py + 16, HOUSE_WALL_W, HOUSE_WALL_H);
    cx.drawImage(assets.roofs, 0, 0, 96, 48, px - 8, py - 24, 96, 48);
    cx.drawImage(assets.doors, 0, 0, 16, 32, px + 32, py + 32, 16, 32);
    return;
  }

  const def = DECO[d.type];
  if (!def) return;
  const img = assets[def.img];
  cx.drawImage(img, def.sx, def.sy, def.sw, def.sh, px, py, def.sw, def.sh);
}

// ── Economy buildings (drawn per-frame since they change) ──

function drawEconomyBuildings(ctx: CanvasRenderingContext2D) {
  if (!economy) return;

  for (const b of economy.buildings) {
    const px = b.tx * TILE;
    const py = b.ty * TILE;

    // Build animation: scale up from 0
    const age = (performance.now() - b.buildTime) / 1000;
    const scale = age < 0.5 ? age / 0.5 : 1;

    ctx.save();
    if (scale < 1) {
      ctx.translate(px + 16, py + 16);
      ctx.scale(scale, scale);
      ctx.translate(-(px + 16), -(py + 16));
    }

    // Draw building as emoji on a colored tile
    const colors: Record<string, string> = {
      house: "rgba(180, 140, 100, 0.7)",
      market: "rgba(220, 180, 60, 0.7)",
      farm: "rgba(120, 180, 60, 0.7)",
      tower: "rgba(100, 140, 220, 0.7)",
      park: "rgba(80, 200, 120, 0.7)",
    };

    // Background tile
    ctx.fillStyle = colors[b.type] ?? "rgba(150,150,150,0.7)";
    ctx.fillRect(px, py, 32, 32);
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = 1;
    ctx.strokeRect(px, py, 32, 32);

    // Emoji
    ctx.font = "20px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(BUILDING_EMOJI[b.type], px + 16, py + 16);

    ctx.restore();

    // Sparkle effect during build
    if (age < 0.8) {
      const sparkleAlpha = 1 - age / 0.8;
      ctx.save();
      ctx.globalAlpha = sparkleAlpha;
      ctx.font = "12px sans-serif";
      ctx.fillText("✨", px + 28, py - 4 - age * 20);
      ctx.fillText("✨", px + 4, py + 8 - age * 15);
      ctx.restore();
    }
  }
}

// ── Agent drawing ──

const DRAW_SCALE = 2;

function drawAgent(ctx: CanvasRenderingContext2D, a: CityAgent) {
  if (!a.tintedSheet) return;

  const src = a.getSrcRect();
  const dw = src.sw * DRAW_SCALE;
  const dh = src.sh * DRAW_SCALE;
  const dx = Math.round(a.x - dw / 2);
  const dy = Math.round(a.y - dh / 2);

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath();
  ctx.ellipse(a.x, a.y + dh / 2 - 4, dw * 0.3, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Dormant or dead: greyed out
  if (a.dormant) {
    ctx.globalAlpha = 0.3;
    ctx.filter = "grayscale(100%)";
  } else if (!a.alive) {
    ctx.globalAlpha = 0.4;
  }

  ctx.drawImage(
    a.tintedSheet,
    src.sx, src.sy, src.sw, src.sh,
    dx, dy, dw, dh,
  );

  ctx.filter = "none";
  ctx.globalAlpha = 1;

  // Build animation: hammer effect
  if (a.buildAnim > 0) {
    ctx.save();
    ctx.font = "18px sans-serif";
    ctx.textAlign = "center";
    const offset = a.buildAnim * 15;
    ctx.globalAlpha = a.buildAnim;
    ctx.fillText("🔨", a.x + 20, a.y - dh / 2 - offset);
    ctx.restore();
  }

  // Dormant: zzz
  if (a.dormant) {
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    const zzPhase = (performance.now() / 600) % 3;
    ctx.globalAlpha = 0.7;
    ctx.fillText("💤", a.x + 18, a.y - dh / 2 + 5 - Math.sin(zzPhase) * 6);
    ctx.globalAlpha = 1;

    // Dormant timer
    ctx.font = "bold 9px 'SF Mono', monospace";
    ctx.fillStyle = "#c44";
    ctx.fillText(`${Math.ceil(a.dormantTimer)}s`, a.x, a.y + dh / 2 + 22);
    return; // skip role/budget labels
  }

  // Role label
  ctx.font = "bold 10px 'SF Mono', monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = a.color;
  ctx.fillText(a.role, a.x, a.y + dh / 2 + 10);

  // Budget bar
  const barW = 36;
  const barH = 4;
  const barX = a.x - barW / 2;
  const barY = a.y + dh / 2 + 14;
  const fill = Math.min(1, a.budget / 60); // full at 60

  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = a.budget > 20 ? "#4caf50" : a.budget > 5 ? "#ff9800" : "#f44336";
  ctx.fillRect(barX, barY, barW * fill, barH);

  // Budget number
  ctx.font = "8px 'SF Mono', monospace";
  ctx.fillStyle = "#fff";
  ctx.fillText(`$${Math.round(a.budget)}`, a.x, barY + barH + 8);

  // Emoji badge
  ctx.font = "14px sans-serif";
  ctx.fillText(a.emoji, a.x + dw / 2 - 4, a.y - dh / 2 + 12);
}

// ── Thought bubbles ──

function drawThought(ctx: CanvasRenderingContext2D, a: CityAgent) {
  if (!a.thought || a.thought.alpha <= 0) return;

  const maxWidth = 210;
  const padding = 8;
  const lineHeight = 14;
  const spriteH = 48 * DRAW_SCALE;
  const baseY = a.y - spriteH / 2 - 12;

  ctx.save();
  ctx.globalAlpha = a.thought.alpha;
  ctx.font = "11px 'SF Mono', 'Fira Code', monospace";
  ctx.textAlign = "left";

  const words = a.thought.text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (ctx.measureText(test).width > maxWidth - padding * 2) {
      if (cur) lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);

  const boxW = maxWidth;
  const boxH = lines.length * lineHeight + padding * 2;
  const boxX = Math.round(a.x - boxW / 2);
  const boxY = Math.round(baseY - boxH);

  ctx.fillStyle = "rgba(255, 248, 230, 0.92)";
  ctx.strokeStyle = "rgba(139, 119, 80, 0.6)";
  ctx.lineWidth = 1.5;
  roundRect(ctx, boxX, boxY, boxW, boxH, 6);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 248, 230, 0.92)";
  ctx.beginPath();
  ctx.moveTo(a.x - 5, boxY + boxH);
  ctx.lineTo(a.x, boxY + boxH + 7);
  ctx.lineTo(a.x + 5, boxY + boxH);
  ctx.fill();

  ctx.fillStyle = "#3b2f1e";
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], boxX + padding, boxY + padding + 11 + i * lineHeight);
  }

  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── Main render ──

export function render(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  agents: CityAgent[],
  dt: number,
) {
  ctx.imageSmoothingEnabled = false;

  waterTimer += dt;
  if (waterTimer > 0.5) {
    waterTimer -= 0.5;
    waterFrame = (waterFrame + 1) % 4;
  }

  ctx.fillStyle = "#5a8f29";
  ctx.fillRect(0, 0, w, h);

  drawWater(ctx);

  if (!bgCanvas && assets && world) {
    bgCanvas = buildBackground(w, h);
  }
  if (bgCanvas) {
    ctx.drawImage(bgCanvas, 0, 0);
  }

  // Economy buildings (on top of background, below agents)
  drawEconomyBuildings(ctx);

  // Sort agents by Y for depth ordering
  const sorted = [...agents].sort((a, b) => a.y - b.y);

  for (const a of sorted) drawAgent(ctx, a);
  for (const a of sorted) drawThought(ctx, a);
}

/** Update the HUD with stats + scoreboard. */
export function updateHUD(stats: StatsData | null, econ: CityEconomy | null) {
  const hud = document.getElementById("hud");
  if (!hud) return;

  let html = `<div class="title">ZHIHUITI CITY</div>`;

  if (stats) {
    html += `
      <span class="label">agents </span><span class="val">${stats.agents.alive}/${stats.agents.total}</span><br>
      <span class="label">tasks  </span><span class="val">${stats.tasks.completed}/${stats.tasks.total}</span><br>
      <span class="label">tx     </span><span class="val">${stats.transactions}</span><br>
    `;
  }

  if (econ) {
    html += `<span class="label">buildings </span><span class="val">${econ.buildings.length}</span><br>`;

    const lb = econ.getLeaderboard();
    if (lb.length > 0) {
      html += `<div class="title" style="margin-top:8px;font-size:11px">TOP BUILDERS</div>`;
      for (let i = 0; i < lb.length; i++) {
        const { id, stats: s } = lb[i];
        const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : " ";
        html += `<span class="label">${medal} ${id.slice(0, 6)}</span> `
              + `<span class="val">${s.buildingsBuilt}🏗 $${s.totalEarned}`
              + (s.timesDormant > 0 ? ` 💤${s.timesDormant}` : "")
              + `</span><br>`;
      }
    }
  }

  hud.innerHTML = html;
}
