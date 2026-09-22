import type { EpicActivityStatus } from "@/hooks/epic/use-epic-activity-status";
import type { NotificationIndicatorState } from "@/stores/notifications/notification-indicator-state";

/** The collapsed rail's single status badge, strongest first (S-17). */
export type RailBadgeKind = "waiting" | "failed" | "unread-done" | "running";

const RAIL_BADGE_RANK: Readonly<Record<RailBadgeKind, number>> = {
  waiting: 0,
  failed: 1,
  "unread-done": 2,
  running: 3,
};

/**
 * The one badge a collapsed tile shows. Waiting ranks first here, unlike the
 * shared glyph's order, because the rail has room for a single mark and a
 * blocked agent is the one the user can unblock. A pending fork is the host's
 * own business and gives no badge.
 */
export function railBadgeOf(
  indicator: NotificationIndicatorState,
  activity: EpicActivityStatus,
): RailBadgeKind | null {
  if (indicator.pendingInterview || indicator.pendingApproval) return "waiting";
  if (indicator.unreadFailure) return "failed";
  if (indicator.unreadDone) return "unread-done";
  if (activity !== "idle") return "running";
  return null;
}

/** The strongest badge among several, as a collapsed group shows it. */
export function worstRailBadge(
  badges: ReadonlyArray<RailBadgeKind | null>,
): RailBadgeKind | null {
  let worst: RailBadgeKind | null = null;
  for (const badge of badges) {
    if (badge === null) continue;
    if (worst === null || RAIL_BADGE_RANK[badge] < RAIL_BADGE_RANK[worst]) {
      worst = badge;
    }
  }
  return worst;
}
