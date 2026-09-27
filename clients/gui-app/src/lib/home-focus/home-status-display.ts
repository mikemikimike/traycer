/**
 * How each Home status reads on screen - its label, the summary line's
 * phrasing and its status colour role - shared by the table and the board.
 */
import type { HomeStatus } from "@traycer/protocol/notifications/home-status-room";

export interface HomeStatusDisplay {
  readonly label: string;
  /** The summary line's phrasing of a count, which agrees with it. */
  readonly summary: (count: number) => string;
  readonly badge: "warning" | "info" | "success";
  readonly dotClass: string;
  readonly textClass: string;
}

// Status roles, not the wireframe's hues: a row waiting on the user is the
// `warning` role (a pending approval is its own example), work under way is
// `info`, and finished work is `success`. Nothing on the board has failed, so
// `destructive` has no row to describe.
export const HOME_STATUS_DISPLAY: Record<HomeStatus, HomeStatusDisplay> = {
  "needs-you": {
    label: "Needs you",
    summary: (count) => (count === 1 ? "needs you" : "need you"),
    badge: "warning",
    dotClass: "bg-warning",
    textClass: "text-warning-foreground",
  },
  "in-progress": {
    label: "In progress",
    summary: () => "in progress",
    badge: "info",
    dotClass: "bg-info",
    textClass: "text-info-foreground",
  },
  done: {
    label: "Done",
    summary: () => "done",
    badge: "success",
    dotClass: "bg-success",
    textClass: "text-success-foreground",
  },
};

export const HOME_STATUS_ORDER: ReadonlyArray<HomeStatus> = [
  "needs-you",
  "in-progress",
  "done",
];
