import { describe, expect, it } from "vitest";
import type {
  ChatQueuedItem,
  ChatQueueState,
} from "@traycer/protocol/host/agent/gui/subscribe";
import {
  queueArrivalPulseToken,
  queuedPromptMessageIds,
  queueWithoutPersistedPrompts,
} from "@/components/chat/chat-queue-utils";

/**
 * The Message queue pill's ring fires on any CHANGE of this token, so what the
 * token must do is change on an arrival and on nothing else (L-148).
 *
 * Every case below is a sequence the app produces: a turn ending and the queue
 * dispatching its head, a user cancelling a row, a user dragging a row to the
 * end, and a message landing. The token is read as a value rather than through
 * the chip, because the chip's own suite already pins "a changed token rings".
 */

/**
 * A queued row, in the union's content-free arm: what this function reads is
 * a row's id and when it was queued, and the delivery arm carries both with no
 * message payload to fabricate around them.
 */
function queued(id: string, createdAt: number): ChatQueuedItem {
  return {
    kind: "managed-command",
    queueItemId: id,
    commandId: `${id}-command`,
    description: id,
    monitoring: null,
    hostId: null,
    delivery: "next_turn",
    targetTurnId: null,
    status: "pending",
    createdAt,
    updatedAt: createdAt,
  };
}

describe("queueArrivalPulseToken", () => {
  it("is null for an empty queue", () => {
    expect(queueArrivalPulseToken([])).toBeNull();
  });

  it("changes when a message is appended", () => {
    const first = [queued("a", 1)];
    const second = [...first, queued("b", 2)];

    expect(queueArrivalPulseToken(first)).not.toBe(
      queueArrivalPulseToken(second),
    );
    expect(queueArrivalPulseToken(second)).toBe("b");
  });

  // The defect this function exists for: five queued messages dispatching as
  // the turn ends walked the count 5, 4, 3, 2, 1, and every one of those
  // decrements was a new token and another ring beside the input.
  it("holds still as the queue drains from the head", () => {
    const full = [queued("a", 1), queued("b", 2), queued("c", 3)];
    const token = queueArrivalPulseToken(full);

    expect(queueArrivalPulseToken(full.slice(1))).toBe(token);
    expect(queueArrivalPulseToken(full.slice(2))).toBe(token);
  });

  it("holds still when a row is cancelled from the middle", () => {
    const full = [queued("a", 1), queued("b", 2), queued("c", 3)];

    expect(
      queueArrivalPulseToken(full.filter((item) => item.queueItemId !== "b")),
    ).toBe(queueArrivalPulseToken(full));
  });

  // Keyed on the newest row rather than on the array's tail, because the queue
  // is reorderable: dragging an older message to the bottom is not an arrival.
  it("holds still when the user reorders a row to the end", () => {
    const full = [queued("a", 1), queued("b", 2), queued("c", 3)];
    const reordered = [full[1], full[2], full[0]];

    expect(queueArrivalPulseToken(reordered)).toBe(
      queueArrivalPulseToken(full),
    );
  });

  // The case a count can never see: one row cancelled and one queued between
  // two commits leaves the count exactly where it was, and the second one is
  // still news.
  it("changes on an add and remove that leaves the count alone", () => {
    const before = [queued("a", 1), queued("b", 2)];
    const after = [queued("b", 2), queued("c", 3)];

    expect(queueArrivalPulseToken(after)).not.toBe(
      queueArrivalPulseToken(before),
    );
  });
});

const SETTINGS = {
  harnessId: "grok" as const,
  model: "grok-4.7",
  permissionMode: "supervised" as const,
  reasoningEffort: null,
  serviceTier: null,
  agentMode: "epic" as const,
  profileId: null,
};

const CONTENT = {
  type: "doc" as const,
  content: [
    {
      type: "paragraph" as const,
      content: [{ type: "text" as const, text: "Fix the copy button" }],
    },
  ],
};

function promptItem(messageId: string): ChatQueuedItem {
  return {
    kind: "prompt",
    queueItemId: `queue-${messageId}`,
    messageId,
    message: {
      kind: "user",
      content: CONTENT,
      browserAnnotations: [],
    },
    sender: { type: "user", userId: "owner-1" },
    settings: SETTINGS,
    accountContext: { type: "PERSONAL" },
    delivery: "next_turn",
    status: "pending",
    targetTurnId: null,
    steerRequest: null,
    fallbackReason: null,
    createdAt: 1,
    updatedAt: 1,
  };
}

function commandItem(): ChatQueuedItem {
  return {
    kind: "managed-command",
    queueItemId: "queue-command",
    commandId: "command-1",
    hostId: null,
    description: "bun test",
    monitoring: true,
    delivery: "next_turn",
    targetTurnId: null,
    status: "pending",
    createdAt: 1,
    updatedAt: 1,
  };
}

function queue(items: ReadonlyArray<ChatQueuedItem>): ChatQueueState {
  return { status: "running", items: [...items] };
}

describe("queuedPromptMessageIds", () => {
  it("names prompt rows and skips managed-command rows", () => {
    const ids = queuedPromptMessageIds([
      promptItem("message-initial"),
      commandItem(),
    ]);

    expect([...ids]).toEqual(["message-initial"]);
  });
});

describe("queueWithoutPersistedPrompts", () => {
  it("keeps a queued prompt that is not in the transcript yet", () => {
    const input = queue([promptItem("message-initial")]);

    const visible = queueWithoutPersistedPrompts(input, []);

    expect(visible).toBe(input);
  });

  it("drops a queued prompt once the transcript has that user message", () => {
    const followUp = promptItem("message-follow-up");
    const input = queue([promptItem("message-initial"), followUp]);

    const visible = queueWithoutPersistedPrompts(input, [
      { role: "user", messageId: "message-initial" },
    ]);

    expect(visible.items).toEqual([followUp]);
    expect(visible.status).toBe("running");
  });

  it("keeps a queued prompt that only matches an assistant row", () => {
    const input = queue([promptItem("message-waiting")]);

    const visible = queueWithoutPersistedPrompts(input, [
      { role: "assistant", messageId: "message-waiting" },
    ]);

    expect(visible).toBe(input);
  });

  it("leaves managed-command rows in place", () => {
    const command = commandItem();
    const input = queue([promptItem("message-sent"), command]);

    const visible = queueWithoutPersistedPrompts(input, [
      { role: "user", messageId: "message-sent" },
    ]);

    expect(visible.items).toEqual([command]);
  });

  it("keeps a paused prompt whose message is already in the transcript", () => {
    const failedStart = {
      ...promptItem("message-persisted"),
      status: "paused" as const,
    };
    const input: ChatQueueState = {
      status: "paused",
      items: [failedStart],
    };

    const visible = queueWithoutPersistedPrompts(input, [
      { role: "user", messageId: "message-persisted" },
    ]);

    expect(visible).toBe(input);
  });

  it("keeps a paused prompt beside a running queue and still hides the handoff", () => {
    const held = { ...promptItem("message-held"), status: "paused" as const };
    const handoff = promptItem("message-accepted");
    const input = queue([held, handoff]);

    const visible = queueWithoutPersistedPrompts(input, [
      { role: "user", messageId: "message-held" },
      { role: "user", messageId: "message-accepted" },
    ]);

    expect(visible.items).toEqual([held]);
    expect(visible.status).toBe("running");
  });
});
