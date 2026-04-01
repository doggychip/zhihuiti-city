const BASE = import.meta.env.VITE_API_URL ?? "https://agentscity.zeabur.app";

export interface AgentData {
  id: string;
  role: string;
  budget: number;
  depth: number;
  avg_score: number;
  alive: number;
  created_at: string;
}

export interface StatsData {
  agents: { total: number; alive: number };
  tasks: { total: number; completed: number; failed: number };
  transactions: number;
  roles: { role: string; count: number; alive: number; avg_score: number }[];
}

export async function fetchAgents(): Promise<AgentData[]> {
  const r = await fetch(`${BASE}/api/agents`);
  const d = await r.json();
  return d.agents;
}

export async function fetchStats(): Promise<StatsData> {
  const r = await fetch(`${BASE}/api/stats`);
  return r.json();
}
