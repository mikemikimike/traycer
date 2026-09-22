import { describe, expect, it } from "vitest";
import type { ChatQueuedItem } from "@traycer/protocol/host/agent/gui/subscribe";
import { queueArrivalPulseToken } from "@/components/chat/chat-queue-utils";

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
