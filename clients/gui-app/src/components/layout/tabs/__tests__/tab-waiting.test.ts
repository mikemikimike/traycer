import { describe, expect, it } from "vitest";
import { tabWaitingReason, withWaitingIndicator } from "../tab-waiting";
import type { EpicWaitingReason } from "@/hooks/epic/use-epic-activity-status";
import {
  EMPTY_NOTIFICATION_INDICATOR_STATE,
  type NotificationIndicatorState,
} from "@/stores/notifications/notification-indicator-state";

function indicator(
  pendingInterview: boolean,
  pendingApproval: boolean,
): NotificationIndicatorState {
  return {
    ...EMPTY_NOTIFICATION_INDICATOR_STATE,
    pendingInterview,
    pendingApproval,
  };
}

interface Case {
  readonly pendingInterview: boolean;
  readonly pendingApproval: boolean;
  readonly session: EpicWaitingReason | null;
  readonly reason: EpicWaitingReason | null;
}

const CASES: readonly Case[] = [
  {
    pendingInterview: false,
    pendingApproval: false,
    session: null,
    reason: null,
  },
  {
    pendingInterview: false,
    pendingApproval: false,
    session: "approval",
    reason: "approval",
  },
  {
    pendingInterview: false,
    pendingApproval: false,
    session: "reply",
    reason: "reply",
  },
  {
    pendingInterview: false,
    pendingApproval: true,
    session: null,
    reason: "approval",
  },
  {
    pendingInterview: false,
    pendingApproval: true,
    session: "approval",
    reason: "approval",
  },
  {
    pendingInterview: false,
    pendingApproval: true,
    session: "reply",
    reason: "reply",
  },
  {
    pendingInterview: true,
    pendingApproval: false,
    session: null,
    reason: "reply",
  },
  {
    pendingInterview: true,
    pendingApproval: false,
    session: "approval",
    reason: "reply",
  },
  {
    pendingInterview: true,
    pendingApproval: false,
    session: "reply",
    reason: "reply",
  },
  {
    pendingInterview: true,
    pendingApproval: true,
    session: null,
    reason: "reply",
  },
  {
    pendingInterview: true,
    pendingApproval: true,
    session: "approval",
    reason: "reply",
  },
  {
    pendingInterview: true,
    pendingApproval: true,
    session: "reply",
    reason: "reply",
  },
];

describe("tabWaitingReason", () => {
  it.each(CASES)(
    "interview=$pendingInterview approval=$pendingApproval session=$session reads $reason",
    ({ pendingInterview, pendingApproval, session, reason }) => {
      expect(
        tabWaitingReason(indicator(pendingInterview, pendingApproval), session),
      ).toBe(reason);
    },
  );
});

describe("withWaitingIndicator", () => {
  it.each(CASES)(
    "interview=$pendingInterview approval=$pendingApproval session=$session ORs the session reason in",
    ({ pendingInterview, pendingApproval, session }) => {
      const input = indicator(pendingInterview, pendingApproval);
      const merged = withWaitingIndicator(input, session);
      expect(merged.pendingInterview).toBe(
        pendingInterview || session === "reply",
      );
      expect(merged.pendingApproval).toBe(
        pendingApproval || session === "approval",
      );
      // Every other field rides through untouched.
      expect({
        ...merged,
        pendingInterview: input.pendingInterview,
        pendingApproval: input.pendingApproval,
      }).toEqual(input);
      const changed =
        (session === "reply" && !pendingInterview) ||
        (session === "approval" && !pendingApproval);
      if (changed) {
        expect(merged).not.toBe(input);
      } else {
        expect(merged).toBe(input);
      }
    },
  );

  it("does not mutate the input when it adds a bit", () => {
    const input = indicator(false, false);
    withWaitingIndicator(input, "approval");
    expect(input.pendingApproval).toBe(false);
  });
});
