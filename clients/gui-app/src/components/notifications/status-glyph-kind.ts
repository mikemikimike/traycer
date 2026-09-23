/**
 * The strip's one status vocabulary (D5, D12): the rail badge, the strip rows,
 * the Inbox and the panel's Agents tree all draw a state with this glyph, so
 * no surface invents its own shape or hue for it. Every state has its own
 * shape, never colour alone.
 */
export type StatusGlyphKind =
  | "approval"
  | "reply"
  | "failed"
  | "unread"
  | "running"
  | "background";

export const STATUS_GLYPH_LABEL: Readonly<Record<StatusGlyphKind, string>> = {
  approval: "Needs approval",
  reply: "Needs a reply",
  failed: "Failed",
  unread: "Done, unread",
  running: "Running",
  background: "Background work",
};
