import { agentActivityTiers } from "@/lib/agent-activity";
import { useEpicAgentActivity } from "@/stores/agent-activity-store";
import type { SideTabLiveAgents } from "./agent-meter";

export const NO_LIVE_AGENTS: SideTabLiveAgents = { turn: 0, background: 0 };

/** A task's live agents by tier; nothing for a tab that is not a task. */
export function useSideTabLiveAgents(epicId: string | null): SideTabLiveAgents {
  const activity = useEpicAgentActivity(epicId);
  let turn = 0;
  for (const tier of agentActivityTiers(activity).values()) {
    if (tier === "turn") turn += 1;
  }
  return { turn, background: activity.working.size - turn };
}

/** "3 running · 1 background", or `null` with no live agent. */
export function sideTabAgentCounts(agents: SideTabLiveAgents): string | null {
  const parts: string[] = [];
  if (agents.turn > 0) parts.push(`${String(agents.turn)} running`);
  if (agents.background > 0) {
    parts.push(`${String(agents.background)} background`);
  }
  return parts.length === 0 ? null : parts.join(" · ");
}
