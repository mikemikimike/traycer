import { useMemo, type ReactNode } from "react";
import {
  agentActivityTiers,
  type AgentActivityTier,
} from "@/lib/agent-activity";
import {
  useRegisteredEpicLiveAgentIds,
  useRegisteredEpicLiveAgents,
} from "@/lib/epic-selectors";
import { useEpicAgentActivity } from "@/stores/agent-activity-store";
import type { SideTabLiveAgents } from "./agent-meter";
import { sideTabAgentCounts } from "./side-tab-live-agents";
import type { RailBadgeKind } from "./rail-badge-kind";
import { StatusGlyph } from "@/components/notifications/status-glyph";
import {
  STATUS_GLYPH_LABEL,
  type StatusGlyphKind,
} from "@/components/notifications/status-glyph-kind";

/** The most agents the card names; the rest are counted. */
const HOVER_CARD_MAX_AGENTS = 6;

function tierOrder(tier: AgentActivityTier): number {
  return tier === "turn" ? 0 : 1;
}

/** The glyph for a task's state line: what needs the user, else what runs. */
function stateGlyphOf(
  badge: RailBadgeKind | null,
  agents: SideTabLiveAgents,
): StatusGlyphKind | null {
  if (badge !== null) return badge;
  if (agents.turn > 0) return "running";
  if (agents.background > 0) return "background";
  return null;
}

/**
 * A strip row's or rail tile's hover card: the title, a state line (the
 * waiting reason first), the live-agent counts and, for an epic this window
 * holds a live session for, the working agents by name. A cold epic shows the
 * counts only, never invented rows. Mounted only while the card is open, so a
 * closed row subscribes to nothing here.
 */
export function SideTabHoverCardBody(props: {
  readonly title: string;
  readonly epicId: string | null;
  readonly badge: RailBadgeKind | null;
  readonly agents: SideTabLiveAgents;
}): ReactNode {
  const glyph = stateGlyphOf(props.badge, props.agents);
  const counts = sideTabAgentCounts(props.agents);
  return (
    <div data-testid="side-tab-hover-card-body" className="flex flex-col gap-2">
      <div className="text-ui-sm font-medium break-words text-foreground">
        {props.title}
      </div>
      <div
        data-testid="side-tab-hover-card-state"
        className="flex items-center gap-1.5 text-muted-foreground"
      >
        {glyph === null ? null : (
          <StatusGlyph kind={glyph} className="size-3.5" label={null} />
        )}
        <span>{glyph === null ? "Idle" : STATUS_GLYPH_LABEL[glyph]}</span>
        {counts === null ? null : (
          <span
            data-testid="side-tab-hover-card-counts"
            className="ms-auto tabular-nums"
          >
            {counts}
          </span>
        )}
      </div>
      {props.epicId === null || counts === null ? null : (
        <WarmAgentList epicId={props.epicId} />
      )}
    </div>
  );
}

/**
 * The working agents by name, only when this window holds a live session for
 * the epic: names come from its projection, which a cold epic does not have.
 */
function WarmAgentList(props: { readonly epicId: string }): ReactNode {
  const liveAgentIds = useRegisteredEpicLiveAgentIds(props.epicId);
  const tiers = agentActivityTiers(useEpicAgentActivity(props.epicId));
  const working = useMemo(
    () =>
      // Turns first, the meter's order.
      [...tiers]
        .map(([agentId, tier]) => ({ agentId, tier }))
        .sort((a, b) => tierOrder(a.tier) - tierOrder(b.tier)),
    [tiers],
  );
  const refs = useMemo(
    () => working.map(({ agentId }) => ({ epicId: props.epicId, agentId })),
    [working, props.epicId],
  );
  const agents = useRegisteredEpicLiveAgents(refs);
  if (liveAgentIds === null) return null;
  const named = working.flatMap((entry, index) => {
    const agent = agents[index] ?? null;
    return agent === null ? [] : [{ ...entry, title: agent.title }];
  });
  if (named.length === 0) return null;
  const shown = named.slice(0, HOVER_CARD_MAX_AGENTS);
  const more = named.length - shown.length;
  return (
    <ul
      data-testid="side-tab-hover-card-agents"
      className="flex flex-col gap-1"
    >
      {shown.map((agent) => (
        <li
          key={agent.agentId}
          data-tier={agent.tier}
          className="flex min-w-0 items-center gap-1.5"
        >
          <StatusGlyph
            kind={agent.tier === "turn" ? "running" : "background"}
            className="size-3.5"
            label={
              STATUS_GLYPH_LABEL[
                agent.tier === "turn" ? "running" : "background"
              ]
            }
          />
          <span className="min-w-0 truncate text-foreground">
            {agent.title ?? "Untitled agent"}
          </span>
        </li>
      ))}
      {more > 0 ? (
        <li className="text-muted-foreground">+{more} more</li>
      ) : null}
    </ul>
  );
}
