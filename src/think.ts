/**
 * AI thought generator — goal-aware thoughts reflecting agent economy state.
 * Tries Claude API first, falls back to local goal-specific thoughts.
 */

import type { CityAgent } from "./agent";
import { preferredBuilding, BUILDING_COST, BUILDING_EMOJI } from "./economy";

const BASE = import.meta.env.VITE_API_URL ?? "https://agentscity.zeabur.app";

// Goal-aware local thoughts (Chinese/English mix)
function pickLocalThought(agent: CityAgent): string {
  const pref = preferredBuilding(agent.role);
  const cost = BUILDING_COST[pref];
  const emoji = BUILDING_EMOJI[pref];

  if (agent.dormant) {
    return pickRandom([
      "预算耗尽...需要休息一下 💤",
      "Circuit breaker tripped. Recovering...",
      "没钱了，等等再说 😴",
      "Energy depleted. Hibernating for 30s.",
      "破产了...重新积累资源中",
    ]);
  }

  if (agent.goal.type === "build") {
    return pickRandom([
      `想在这里建个${emoji} — 需要 ${cost} 预算`,
      `Found a good spot! Building ${pref} here.`,
      `这块地不错，准备动工 ${emoji}`,
      `Heading to build site. Budget: ${Math.round(agent.budget)}`,
      `终于攒够了，开始建设 ${emoji}!`,
    ]);
  }

  if (agent.goal.type === "earn") {
    return pickRandom([
      `去建筑旁边赚点钱... 当前预算: ${Math.round(agent.budget)}`,
      `Need ${cost} to build. Currently at ${Math.round(agent.budget)}.`,
      `预算不够，先去赚钱 💰`,
      `Working near buildings to earn budget...`,
      `还差 ${Math.max(0, cost - Math.round(agent.budget))} 才能建 ${emoji}`,
    ]);
  }

  // Wander / default — role-specific flavor
  const roleThoughts: Record<string, string[]> = {
    researcher: [
      "Scanning for a good research tower location 🔬",
      "在寻找适合建塔的地方...",
      "Need a tower to boost research output.",
      "这个区域的数据密度不够高...",
      "Analyzing terrain for optimal tower placement.",
    ],
    analyst: [
      "Running correlation on building placement patterns 📊",
      "分析哪些地块升值空间最大...",
      "Tower proximity would boost my scoring.",
      "观察其他 agent 的建设策略...",
      "The data suggests building near the center.",
    ],
    trader: [
      "Looking for high-traffic areas for my market 💹",
      "市场要建在人流量大的地方...",
      "Supply and demand — need a good location.",
      "这里的交易量够大吗？",
      "Scouting market locations near the crossroads.",
    ],
    coder: [
      "Need a house to work from. Preferably quiet. 💻",
      "找个安静的地方写代码...",
      "Home office setup requires budget 20.",
      "重构完这个模块就去建房子...",
      "Debugging my path-finding algorithm...",
    ],
    strategist: [
      "A park would help everyone's morale ♟️",
      "公园对整体效率有提升...",
      "Planning the optimal park placement.",
      "从全局角度看，这里需要绿地",
      "Park cost is only 15 — good ROI.",
    ],
    coordinator: [
      "Organizing the building queue... 🔗",
      "协调各 agent 的建设计划...",
      "House near the center for coordination.",
      "确保没有资源冲突...",
      "Balancing the build schedule across roles.",
    ],
    auditor: [
      "Inspecting nearby buildings for code compliance 🔍",
      "审计建筑质量中...",
      "Tower would help oversight range.",
      "检查预算使用是否合规...",
      "Need a tower for better surveillance.",
    ],
    causal_reasoner: [
      "If I build a park here, downstream effects are... 🧠",
      "因果推理：公园→士气→产出↑",
      "Modeling the counterfactual: park vs tower.",
      "这个位置的因果链最优",
      "Tracing causal impact of building placement.",
    ],
  };

  const pool = roleThoughts[agent.role] ?? [
    "Wandering around, looking for opportunities...",
    "四处走走，看看哪里适合建设...",
    `Budget: ${Math.round(agent.budget)} — saving up.`,
  ];
  return pickRandom(pool);
}

function pickRandom(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function fetchAIThought(agent: CityAgent): Promise<string> {
  try {
    const r = await fetch(`${BASE}/api/think`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent_id: agent.id,
        role: agent.role,
        score: agent.score,
        alive: agent.alive,
        budget: agent.budget,
        goal: agent.goal.type,
        dormant: agent.dormant,
      }),
      signal: AbortSignal.timeout(4000),
    });
    if (r.ok) {
      const d = await r.json();
      return d.thought ?? pickLocalThought(agent);
    }
  } catch {
    // fallback
  }
  return pickLocalThought(agent);
}

export function startThoughtLoop(
  agents: () => CityAgent[],
  intervalMs = 4000,
) {
  async function tick() {
    const all = agents();
    if (all.length === 0) return;

    // Pick from alive agents (including dormant — they have thoughts too)
    const pool = all.filter((a) => a.alive);
    if (pool.length === 0) return;

    const agent = pool[Math.floor(Math.random() * pool.length)];
    const thought = await fetchAIThought(agent);
    agent.showThought(thought);
  }

  setTimeout(tick, 1000);
  setInterval(tick, intervalMs);
}
