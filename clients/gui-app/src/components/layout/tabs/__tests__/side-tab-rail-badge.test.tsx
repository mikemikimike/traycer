import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SideTabRailBadge } from "../side-strip/side-tab-rail-badge";
import {
  railBadgeOf,
  worstRailBadge,
  type RailBadgeKind,
} from "../side-strip/rail-badge-kind";
import { SIDE_TAB_BADGE_CLASS } from "../side-strip/side-strip-tokens";
import type { EpicActivityStatus } from "@/hooks/epic/use-epic-activity-status";
import {
  EMPTY_NOTIFICATION_INDICATOR_STATE,
  type NotificationIndicatorState,
} from "@/stores/notifications/notification-indicator-state";

afterEach(() => cleanup());

type Flag = "interview" | "approval" | "failure" | "done";

function indicator(flags: ReadonlyArray<Flag>): NotificationIndicatorState {
  return {
    ...EMPTY_NOTIFICATION_INDICATOR_STATE,
    pendingInterview: flags.includes("interview"),
    pendingApproval: flags.includes("approval"),
    unreadFailure: flags.includes("failure"),
    unreadNonTerminalFailure: flags.includes("failure"),
    unreadDone: flags.includes("done"),
  };
}

const ALL_FLAGS: ReadonlyArray<Flag> = [
  "interview",
  "approval",
  "failure",
  "done",
];
const ACTIVITIES: ReadonlyArray<EpicActivityStatus> = [
  "idle",
  "turn",
  "background",
];

function subsets(): ReadonlyArray<ReadonlyArray<Flag>> {
  const out: Flag[][] = [];
  for (let mask = 0; mask < 1 << ALL_FLAGS.length; mask++) {
    out.push(ALL_FLAGS.filter((_flag, index) => (mask & (1 << index)) !== 0));
  }
  return out;
}

/** Lower is stronger, written out independently of the implementation. */
const STRENGTH: Readonly<Record<RailBadgeKind | "none", number>> = {
  waiting: 0,
  failed: 1,
  "unread-done": 2,
  running: 3,
  none: 4,
};

type PrecedenceCase = readonly [
  ReadonlyArray<Flag>,
  EpicActivityStatus,
  RailBadgeKind | null,
];

const PRECEDENCE: ReadonlyArray<PrecedenceCase> = [
  [[], "idle", null],
  [[], "turn", "running"],
  [[], "background", "running"],
  [["done"], "idle", "unread-done"],
  [["done"], "turn", "unread-done"],
  [["failure"], "idle", "failed"],
  [["failure", "done"], "background", "failed"],
  [["interview"], "idle", "waiting"],
  [["approval"], "idle", "waiting"],
  [["approval", "failure"], "turn", "waiting"],
  [["interview", "failure", "done"], "background", "waiting"],
  [["interview", "approval"], "idle", "waiting"],
];

describe("railBadgeOf", () => {
  it.each(PRECEDENCE)(
    "%j with activity %s gives %s",
    (flags, activity, badge) => {
      expect(railBadgeOf(indicator(flags), activity)).toBe(badge);
    },
  );

  it("never gets weaker when a flag or activity is added", () => {
    for (const flags of subsets()) {
      for (const activity of ACTIVITIES) {
        const base = railBadgeOf(indicator(flags), activity) ?? "none";
        for (const extra of ALL_FLAGS) {
          const more =
            railBadgeOf(indicator([...flags, extra]), activity) ?? "none";
          expect(STRENGTH[more]).toBeLessThanOrEqual(STRENGTH[base]);
        }
        const busier = railBadgeOf(indicator(flags), "turn") ?? "none";
        expect(STRENGTH[busier]).toBeLessThanOrEqual(STRENGTH[base]);
      }
    }
  });

  it("gives no waiting badge for a pending fork alone", () => {
    const forkOnly: NotificationIndicatorState = {
      ...EMPTY_NOTIFICATION_INDICATOR_STATE,
      pendingFork: true,
    };
    expect(railBadgeOf(forkOnly, "idle")).toBeNull();
    expect(railBadgeOf(forkOnly, "turn")).toBe("running");
  });
});

describe("worstRailBadge", () => {
  it("returns null for no children or only quiet children", () => {
    expect(worstRailBadge([])).toBeNull();
    expect(worstRailBadge([null, null])).toBeNull();
  });

  it("picks the strongest badge across mixed children", () => {
    expect(worstRailBadge([null, "running", "unread-done"])).toBe(
      "unread-done",
    );
    expect(worstRailBadge(["unread-done", "failed", null, "running"])).toBe(
      "failed",
    );
    expect(
      worstRailBadge(["running", "failed", "waiting", "unread-done"]),
    ).toBe("waiting");
    expect(worstRailBadge(["running", null])).toBe("running");
  });
});

describe("SideTabRailBadge", () => {
  it.each([
    ["waiting", "text-warning-foreground"],
    ["failed", "text-destructive"],
    ["unread-done", "text-success-foreground"],
  ] as const)("paints %s as a dot in the registry tone", (kind, toneClass) => {
    render(<SideTabRailBadge kind={kind} testId="badge" />);
    const badge = screen.getByTestId("badge");
    expect(badge.dataset.kind).toBe(kind);
    for (const token of SIDE_TAB_BADGE_CLASS.split(" ")) {
      expect(badge.classList.contains(token)).toBe(true);
    }
    expect(badge.classList.contains("bg-current")).toBe(true);
    expect(badge.classList.contains(toneClass)).toBe(true);
    expect(badge.getAttribute("aria-label")).not.toBe("");
  });

  it("paints running as the muted spinner inside the ringed badge", () => {
    render(<SideTabRailBadge kind="running" testId="badge" />);
    const badge = screen.getByTestId("badge");
    expect(badge.dataset.kind).toBe("running");
    expect(badge.classList.contains("ring-canvas")).toBe(true);
    const spinner = badge.firstElementChild;
    expect(spinner).not.toBeNull();
    expect(spinner?.classList.contains("text-muted-foreground")).toBe(true);
  });
});
