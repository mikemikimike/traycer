import { createElement } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { HostNotificationsCloudFeedRowV11 } from "@traycer/protocol/host/notifications/contracts";
import { NotificationFeedModeContext } from "@/lib/notifications/notification-feed-mode-context";
import type { MergedNotificationRow } from "@/stores/notifications/merged-notifications";
import { useCloudNotificationsStore } from "@/stores/notifications/cloud-notifications-store";
import {
  needsYouReasonOf,
  selectNeedsYouItems,
  useNeedsYouItems,
} from "@/stores/notifications/needs-you-items";

/**
 * `selectNeedsYouItems` / `needsYouReasonOf` (D10): the pure selector behind
 * the Notifications drawer's Needs you group and its count. Rows are built by hand rather
 * than through a live store, since the selector's contract is entirely a
 * function of the merged row - resolution, host kind, and payload.
 */

function buildRow(
  overrides: Partial<MergedNotificationRow>,
): MergedNotificationRow {
  return {
    feedId: "host:approval-1",
    source: "host",
    sourceId: "approval-1",
    createdAt: 1_000,
    readAt: null,
    title: "Deploy checkout fix",
    body: "",
    payload: {
      kind: "approval",
      epicId: "epic-1",
      chatId: "chat-1",
      approvalId: "approval-1",
      sessionId: undefined,
      artifactId: undefined,
    },
    hostKind: "approval.requested",
    appLocalKind: null,
    globalEntry: null,
    severity: "needs_action",
    outcome: null,
    resolvedAt: null,
    sourceRef: "approval-1",
    originHostId: "host-a",
    providerPackAttribution: null,
    category: "task",
    ...overrides,
  };
}

describe("needsYouReasonOf", () => {
  it("reads an unresolved approval as 'approval'", () => {
    expect(needsYouReasonOf(buildRow({}))).toBe("approval");
  });

  it("reads an unresolved interview as 'reply'", () => {
    expect(
      needsYouReasonOf(
        buildRow({
          hostKind: "interview.requested",
          payload: {
            kind: "interview",
            epicId: "epic-1",
            chatId: "chat-1",
            interviewBlockId: undefined,
          },
        }),
      ),
    ).toBe("reply");
  });

  it("excludes a resolved approval - auto-judge (S-41) never files one otherwise", () => {
    expect(needsYouReasonOf(buildRow({ resolvedAt: 2_000 }))).toBeNull();
  });

  it("excludes a resolved interview", () => {
    expect(
      needsYouReasonOf(
        buildRow({ hostKind: "interview.requested", resolvedAt: 2_000 }),
      ),
    ).toBeNull();
  });

  it("includes an already-read but unresolved prompt - read vs unread does not matter", () => {
    expect(needsYouReasonOf(buildRow({ readAt: 1_500 }))).toBe("approval");
  });

  it("excludes browser.human.needed", () => {
    expect(
      needsYouReasonOf(
        buildRow({ hostKind: "browser.human.needed", payload: null }),
      ),
    ).toBeNull();
  });

  it("excludes every other host kind, e.g. a stopped-agent failure", () => {
    expect(
      needsYouReasonOf(
        buildRow({
          hostKind: "agent.stopped",
          severity: "failure",
          payload: null,
        }),
      ),
    ).toBeNull();
  });

  it("excludes non-host rows outright", () => {
    expect(
      needsYouReasonOf(buildRow({ source: "app-local", hostKind: null })),
    ).toBeNull();
  });
});

describe("selectNeedsYouItems", () => {
  it("keeps the merged feed's order (newest first) with no re-sort", () => {
    const rows = [
      buildRow({ feedId: "host:a", sourceId: "a", createdAt: 3_000 }),
      buildRow({
        feedId: "host:b",
        sourceId: "b",
        createdAt: 2_000,
        hostKind: "interview.requested",
        payload: {
          kind: "interview",
          epicId: "epic-1",
          chatId: "chat-1",
          interviewBlockId: undefined,
        },
      }),
      buildRow({ feedId: "host:c", sourceId: "c", createdAt: 1_000 }),
    ];

    const items = selectNeedsYouItems(rows, () => null);

    expect(items.map((item) => item.row.feedId)).toEqual([
      "host:a",
      "host:b",
      "host:c",
    ]);
  });

  it("filters out every row that is not an unresolved approval or interview", () => {
    const rows = [
      buildRow({ feedId: "host:approval", sourceId: "approval" }),
      buildRow({
        feedId: "host:resolved",
        sourceId: "resolved",
        resolvedAt: 500,
      }),
      buildRow({
        feedId: "host:browser",
        sourceId: "browser",
        hostKind: "browser.human.needed",
        payload: null,
      }),
      buildRow({
        feedId: "host:failure",
        sourceId: "failure",
        hostKind: "agent.stopped",
        severity: "failure",
        payload: null,
      }),
    ];

    const items = selectNeedsYouItems(rows, () => null);

    expect(items.map((item) => item.row.feedId)).toEqual(["host:approval"]);
  });

  it("assigns 'Approval requested' / 'Question waiting' asks per reason", () => {
    const approval = selectNeedsYouItems([buildRow({})], () => null);
    expect(approval[0]?.ask).toBe("Approval requested");

    const interview = selectNeedsYouItems(
      [
        buildRow({
          hostKind: "interview.requested",
          payload: {
            kind: "interview",
            epicId: "epic-1",
            chatId: "chat-1",
            interviewBlockId: undefined,
          },
        }),
      ],
      () => null,
    );
    expect(interview[0]?.ask).toBe("Question waiting");
  });

  it("reads taskTitle from the row's title and epicId/chatId from the payload", () => {
    const items = selectNeedsYouItems(
      [buildRow({ title: "Ship the release" })],
      () => null,
    );
    expect(items[0]?.taskTitle).toBe("Ship the release");
    expect(items[0]?.epicId).toBe("epic-1");
    expect(items[0]?.chatId).toBe("chat-1");
  });

  it("falls back to null epicId/chatId when the payload carries none", () => {
    const items = selectNeedsYouItems(
      [
        buildRow({
          payload: {
            kind: "approval",
            epicId: undefined,
            chatId: undefined,
            approvalId: "approval-1",
            sessionId: undefined,
            artifactId: undefined,
          },
        }),
      ],
      () => null,
    );
    expect(items[0]?.epicId).toBeNull();
    expect(items[0]?.chatId).toBeNull();
  });

  it("reads agentTitle from the injected resolver, per row", () => {
    const items = selectNeedsYouItems(
      [buildRow({ feedId: "host:x", sourceId: "x" })],
      (row) => (row.feedId === "host:x" ? "Deploy agent" : null),
    );
    expect(items[0]?.agentTitle).toBe("Deploy agent");
  });
});

/**
 * `useNeedsYouItems` against a real `useCloudNotificationsStore` snapshot
 * (finding 3): the cloud store keys its rows by `cloudNotificationFeedId`,
 * not by the bare `entryId`, so this exercises the actual wiring the pure
 * selector's hand-built rows above cannot catch.
 */
describe("useNeedsYouItems (cloud store wiring)", () => {
  beforeEach(() => {
    useCloudNotificationsStore.getState().reset();
  });

  afterEach(() => {
    useCloudNotificationsStore.getState().reset();
  });

  function cloudApprovalRow(
    entryId: string,
    chatTitle: string,
  ): HostNotificationsCloudFeedRowV11 {
    return {
      entryId,
      originHostId: "host-a",
      coalesceKey: "approval.requested:chat-1",
      entry: {
        id: entryId,
        updatedAt: 1_000,
        readAt: null,
        kind: "approval.requested",
        sourceRef: entryId,
        severity: "needs_action",
        outcome: null,
        resolvedAt: null,
        epicId: "epic-1",
        chatId: "chat-1",
        payload: {
          kind: "approval",
          epicId: "epic-1",
          chatId: "chat-1",
          chatTitle: "Fallback title",
          taskTitle: "Fallback title",
          approvalId: entryId,
        },
      },
      presentation: { epicTitle: "Epic", chatTitle },
    };
  }

  it("reads a cloud item's agentTitle from its chatTitle, keyed by feedId not the bare entryId", () => {
    act(() => {
      useCloudNotificationsStore.getState().applySnapshot({
        rows: [cloudApprovalRow("approval-1", "Deploy checkout fix")],
        summary: { totalCount: 1, unreadCount: 1, attentionCount: 1 },
        version: 1,
      });
    });

    const { result } = renderHook(() => useNeedsYouItems(), {
      wrapper: (props: { readonly children: React.ReactNode }) =>
        createElement(
          NotificationFeedModeContext.Provider,
          { value: "cloud" },
          props.children,
        ),
    });

    expect(result.current).toHaveLength(1);
    expect(result.current[0]?.agentTitle).toBe("Deploy checkout fix");
  });
});
