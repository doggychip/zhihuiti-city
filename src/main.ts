import { CityAgent } from "./agent";
import { fetchAgents, fetchStats, type StatsData } from "./api";
import { loadAllSprites, TILE, type SpriteAssets } from "./sprites";
import { generateWorld } from "./worldgen";
import { render, updateHUD, setAssets, setWorld, setEconomy } from "./render";
import { startThoughtLoop } from "./think";
import { CityEconomy, preferredBuilding, BUILDING_COST } from "./economy";

const canvas = document.getElementById("city") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

let W = 0;
let H = 0;
let agents: CityAgent[] = [];
let stats: StatsData | null = null;
let sprites: SpriteAssets | null = null;
const econ = new CityEconomy();
setEconomy(econ);

function resize() {
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * devicePixelRatio;
  canvas.height = H * devicePixelRatio;
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

  const world = generateWorld(W, H);
  setWorld(world);
  econ.setWorld(world);
}

window.addEventListener("resize", resize);
resize();

async function loadAgents() {
  try {
    const data = await fetchAgents();
    agents = data.map((d) => new CityAgent(d, W, H));
    for (const a of agents) {
      a.pickTarget(W, H);
      if (sprites) a.initSprite(sprites);
    }
  } catch (e) {
    console.error("Failed to load agents:", e);
  }
}

async function loadStats() {
  try {
    stats = await fetchStats();
    updateHUD(stats, econ);
  } catch (e) {
    console.error("Failed to load stats:", e);
  }
}

// ── Economy simulation ──

/** Timers for periodic economy actions (in seconds). */
let buildTimer = 3;   // first build attempt after 3s
let earnTimer = 0;

const BUILD_INTERVAL = 4;   // agents try to build every 4s
const EARN_INTERVAL = 2;    // earning tick every 2s

function economyTick(dt: number) {
  // ── Build phase ──
  buildTimer -= dt;
  if (buildTimer <= 0) {
    buildTimer = BUILD_INTERVAL;
    runBuildPhase();
  }

  // ── Earn phase ──
  earnTimer -= dt;
  if (earnTimer <= 0) {
    earnTimer = EARN_INTERVAL;
    econ.earnTick(agents);

    // Circuit breaker check
    for (const a of agents) {
      if (!a.dormant && a.alive && a.budget <= 0) {
        a.goDormant();
        a.showThought("😤 预算归零！进入休眠...");
        const s = econ.agentStats.get(a.id);
        if (s) s.timesDormant++;
        else econ.agentStats.set(a.id, { buildingsBuilt: 0, totalEarned: 0, timesDormant: 1 });
      }
    }

    // Refresh HUD
    updateHUD(stats, econ);
  }
}

function runBuildPhase() {
  const alive = agents.filter(a => a.alive && !a.dormant);

  for (const a of alive) {
    const pref = preferredBuilding(a.role);
    const cost = BUILDING_COST[pref];

    if (a.budget >= cost) {
      // Try to build
      const site = econ.findBuildSite(a);
      if (site) {
        a.goal = { type: "build", tx: site.tx, ty: site.ty };
        a.moveToTile(site.tx, site.ty);
        econ.submitBuildIntent(a, site.tx, site.ty, pref);
      }
    } else {
      // Not enough budget — go earn near a building
      const nearestBuilding = findNearestBuilding(a);
      if (nearestBuilding) {
        a.goal = { type: "earn", tx: nearestBuilding.tx, ty: nearestBuilding.ty };
        a.moveToTile(nearestBuilding.tx, nearestBuilding.ty);
      } else {
        a.goal = { type: "wander" };
        a.pickTarget(W, H);
      }
    }
  }

  // Resolve competitions
  const result = econ.resolveBuildIntents(agents);

  // Winners: trigger build animation
  for (const id of result.built) {
    const a = agents.find(ag => ag.id === id);
    if (a) {
      a.buildAnim = 1;
      a.goal = { type: "wander" };
    }
  }

  // Losers: angry thought + redirect
  for (const id of result.rejected) {
    const a = agents.find(ag => ag.id === id);
    if (a) {
      a.showThought("😤 被抢了！换个地方...");
      a.goal = { type: "wander" };
      a.pickTarget(W, H);
    }
  }
}

function findNearestBuilding(a: CityAgent): { tx: number; ty: number } | null {
  const atx = Math.floor(a.x / TILE);
  const aty = Math.floor(a.y / TILE);

  let best: { tx: number; ty: number } | null = null;
  let bestDist = Infinity;

  // Check both economy buildings and worldgen houses
  for (const b of econ.buildings) {
    const dx = b.tx - atx;
    const dy = b.ty - aty;
    const d = dx * dx + dy * dy;
    if (d < bestDist) { bestDist = d; best = { tx: b.tx, ty: b.ty }; }
  }

  // Also worldgen decorations that are houses
  if (econ.buildings.length === 0) {
    // Early game: wander toward center
    return { tx: Math.floor(W / TILE / 2), ty: Math.floor(H / TILE / 2) };
  }

  return best;
}

// ── Game loop ──

let lastTime = performance.now();

function frame(now: number) {
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  // Update agents
  for (const a of agents) {
    const arrived = a.update(dt);
    if (arrived && !a.dormant) {
      // If they arrived at a build/earn target, let economy handle it next tick.
      // Otherwise wander again.
      if (a.goal.type === "wander") {
        a.pickTarget(W, H);
      }
    }
  }

  // Economy simulation
  economyTick(dt);

  render(ctx, W, H, agents, dt);
  requestAnimationFrame(frame);
}

// ── Bootstrap ──

async function init() {
  try {
    sprites = await loadAllSprites();
    setAssets(sprites);
  } catch (e) {
    console.error("Failed to load sprites:", e);
  }

  await Promise.all([loadAgents(), loadStats()]);

  if (sprites) {
    for (const a of agents) a.initSprite(sprites);
  }

  startThoughtLoop(() => agents, 4000);
  requestAnimationFrame(frame);

  setInterval(loadStats, 30000);
}

init();
