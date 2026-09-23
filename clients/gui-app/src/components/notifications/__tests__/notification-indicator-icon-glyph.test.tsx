import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  NotificationIndicatorIcon,
  type IndicatorRunningKind,
} from "@/components/notifications/notification-indicator-icon";
import { statusGlyphKindOfTone } from "@/components/notifications/notification-indicator-tones";
import {
  APPROVAL_TONE,
  DONE_TONE,
  FAILURE_TONE,
  FORK_TONE,
  INTERVIEW_TONE,
  NOTIFICATION_STATUS_TONES,
  TERMINAL_FAILURE_TONE,
} from "@/components/notifications/notification-indicator-tones";
import type { NotificationIndicatorState } from "@/stores/notifications/notification-indicator-state";

/**
 * `statusPresentation="glyph"` (D12): the sidebar chat tree's presentation,
 * which draws every mapped state through the shared `StatusGlyph` vocabulary
 * instead of a surface-specific lucide tone icon.
 */

const CLEAN_STATE: NotificationIndicatorState = {
  unreadFailure: false,
  pendingFork: false,
  pendingApproval: false,
  pendingInterview: false,
  unreadDone: false,
};

afterEach(cleanup);

describe("statusGlyphKindOfTone", () => {
  it("maps failure, interview, approval and done to their glyph kinds", () => {
    expect(statusGlyphKindOfTone(FAILURE_TONE)).toBe("failed");
    expect(statusGlyphKindOfTone(INTERVIEW_TONE)).toBe("reply");
    expect(statusGlyphKindOfTone(APPROVAL_TONE)).toBe("approval");
    expect(statusGlyphKindOfTone(DONE_TONE)).toBe("unread");
  });

  it("maps a terminal failure (TUI surface) to failed too - same testId", () => {
    expect(statusGlyphKindOfTone(TERMINAL_FAILURE_TONE)).toBe("failed");
  });

  it("has no shape for fork, browser, or a resolved interview/approval - they keep their own icon", () => {
    expect(statusGlyphKindOfTone(FORK_TONE)).toBeNull();
    expect(statusGlyphKindOfTone(NOTIFICATION_STATUS_TONES.browser)).toBeNull();
    expect(
      statusGlyphKindOfTone(NOTIFICATION_STATUS_TONES["interview-resolved"]),
    ).toBeNull();
    expect(
      statusGlyphKindOfTone(NOTIFICATION_STATUS_TONES["approval-resolved"]),
    ).toBeNull();
  });
});

function renderIcon(input: {
  readonly state: NotificationIndicatorState;
  readonly running: IndicatorRunningKind;
  readonly agentSurface?: "gui" | "tui";
}) {
  return render(
    <NotificationIndicatorIcon
      state={input.state}
      running={input.running}
      activityCoverage="indeterminate"
      subjectId="subject-1"
      testIdPrefix="indicator"
      className={undefined}
      style={undefined}
      runningTitle="Task activity in progress"
      defaultIcon={<span data-testid="default-icon" />}
      statusPresentation="glyph"
      agentSurface={input.agentSurface ?? "gui"}
    />,
  );
}

function glyphKind(testId: string): string | null {
  return (
    screen
      .getByTestId(testId)
      .querySelector("[data-status-glyph]")
      ?.getAttribute("data-status-glyph") ?? null
  );
}

describe("<NotificationIndicatorIcon /> statusPresentation=glyph", () => {
  it("draws a pending approval as the approval glyph", () => {
    renderIcon({
      state: { ...CLEAN_STATE, pendingApproval: true },
      running: false,
    });
    expect(glyphKind("indicator-approval-subject-1")).toBe("approval");
  });

  it("draws a pending interview as the reply glyph", () => {
    renderIcon({
      state: { ...CLEAN_STATE, pendingInterview: true },
      running: false,
    });
    expect(glyphKind("indicator-interview-subject-1")).toBe("reply");
  });

  it("draws a non-terminal failure as the failed glyph", () => {
    renderIcon({
      state: { ...CLEAN_STATE, unreadFailure: true },
      running: false,
    });
    expect(glyphKind("indicator-failure-subject-1")).toBe("failed");
  });

  it("draws a terminal failure as the failed glyph too, on a TUI surface", () => {
    renderIcon({
      state: {
        ...CLEAN_STATE,
        unreadFailure: true,
        unreadTerminalFailure: true,
      },
      running: false,
      agentSurface: "tui",
    });
    // Same glyph kind as a non-terminal failure - the glyph set draws it as
    // one shape, unlike the message-mode lucide icon which swaps to a
    // terminal-specific glyph on TUI.
    expect(glyphKind("indicator-failure-subject-1")).toBe("failed");
  });

  it("draws an unread completion as the unread glyph", () => {
    renderIcon({
      state: { ...CLEAN_STATE, unreadDone: true },
      running: false,
    });
    expect(glyphKind("indicator-done-subject-1")).toBe("unread");
  });

  it("draws a running turn as the running glyph", () => {
    renderIcon({ state: CLEAN_STATE, running: "turn" });
    expect(glyphKind("indicator-activity-subject-1")).toBe("running");
  });

  it("draws background-only activity as the background glyph", () => {
    renderIcon({ state: CLEAN_STATE, running: "background" });
    expect(glyphKind("indicator-background-activity-subject-1")).toBe(
      "background",
    );
  });

  it("keeps the fork tone's own lucide icon - the glyph set has no shape for it", () => {
    renderIcon({
      state: { ...CLEAN_STATE, pendingFork: true },
      running: false,
    });
    const fork = screen.getByTestId("indicator-fork-subject-1");
    expect(fork.querySelector("[data-status-glyph]")).toBeNull();
    expect(fork.getAttribute("class")).toContain("lucide-git-fork");
  });

  it("falls back to defaultIcon when idle, unchanged by glyph mode", () => {
    renderIcon({ state: CLEAN_STATE, running: false });
    expect(screen.getByTestId("default-icon")).toBeDefined();
    expect(document.querySelector("[data-status-glyph]")).toBeNull();
  });
});
