import type {
  ChatQueuedItem,
  ChatQueuedManagedCommandItem,
  ChatQueuedPromptItem,
} from "@traycer/protocol/host/agent/gui/subscribe";

export type ReceivedAgentQueueItem = ChatQueuedPromptItem & {
  readonly sender: Extract<ChatQueuedPromptItem["sender"], { type: "agent" }>;
};

/**
 * A2A (agent-to-agent) responses ride the same chat queue plumbing as user
 * messages but are system-owned. They surface in the queue UI so the user can
 * see pending responses received from other agents and reorder them, but they
 * render read-only - reorder only, never edit / delete / hand-steer. This
 * guard is the single origin marker the queue UI gates per-row behavior on
 * (`"agent"` for A2A delivery, `"user"` for user-typed sends).
 *
 * Scoped to prompt items on purpose. Managed-command items are system-owned
 * too, but their policy keys on their own `kind` (see
 * `isManagedCommandQueueItem`), so relaxing an A2A gate later can never leak
 * onto them.
 */
export function isReceivedAgentResponse(
  item: ChatQueuedItem,
): item is ReceivedAgentQueueItem {
  return item.kind === "prompt" && item.sender.type === "agent";
}

/**
 * A pending delivery of a shell's output (a watcher's log digest, a
 * backgrounded shell's completion digest). Content-free: the chip renders from
 * `description`, and the host renders the digest itself from the command's log
 * at dispatch. The user may reorder or cancel it; it is never editable or
 * hand-steerable.
 */
export function isManagedCommandQueueItem(
  item: ChatQueuedItem,
): item is ChatQueuedManagedCommandItem {
  return item.kind === "managed-command";
}

/**
 * What the Message queue pill is standing in for right now, as one comparable
 * token: the id of the most recently QUEUED row, or `null` for an empty queue.
 *
 * The pill rings whenever this value changes, so the value has to change on an
 * arrival and on nothing else. The count cannot do that job: it moves in both
 * directions, so a queue of five draining as the turn ends walks 5, 4, 3, 2, 1
 * and throws four more rings beside the input, one for each message the user
 * is no longer waiting on - and cancelling a row does the same. That is the
 * per-item tick L-148 bans and the failure the Changed files pill next door
 * already records.
 *
 * Keyed on the newest row by `createdAt` rather than on the tail of the array,
 * because the queue is reorderable: the last element changes when the user
 * drags a row to the end, which is not an arrival. Strict maximum with
 * first-wins on a tie, the same shape `failedManagedCommandPulseToken` uses
 * for the Background pill, so a dispatch off the head leaves the token alone
 * and an append is the only thing that replaces it.
 */
export function queueArrivalPulseToken(
  items: ReadonlyArray<ChatQueuedItem>,
): string | null {
  let newest: ChatQueuedItem | null = null;
  for (const item of items) {
    if (newest === null || item.createdAt > newest.createdAt) {
      newest = item;
    }
  }
  return newest === null ? null : newest.queueItemId;
}
