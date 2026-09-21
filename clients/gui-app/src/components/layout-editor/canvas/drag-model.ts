/**
 * The pure model of a reorder drag (L-24, L-29, section 6).
 *
 * Where the members of a list sit, which slot the dragged one currently
 * claims, where it comes to rest when it is let go, how far past a clamp it may
 * be pulled, and how fast the pointer was going. All of it is arithmetic on
 * numbers the DOM handed over, so the thing a user actually feels is testable
 * on real values; `drag-engine.ts` is the thin driver that measures, paints and
 * commits.
 *
 * A member index is always one the list has: `armLayoutDrag` refuses a target
 * whose index is outside its own items before a drag ever starts, and every
 * other index here comes back out of {@link targetSlotOf}, which only ever
 * returns one it walked to.
 */

export type DragAxis = "x" | "y";

/**
 * Only what a drag reads off a measured box. A `DOMRect` satisfies it, and so
 * does a literal in a test, which is the point.
 */
export interface DragRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** One member's extent along the drag axis. */
export interface DragSlot {
  readonly start: number;
  readonly size: number;
}

/** How far a press travels before it is unmistakably a drag (section 6). */
export const DRAG_ACTIVATION_DISTANCE = 6;

/** How much of a pull past a clamp survives (section 6). */
const RUBBER_BAND = 0.25;

/** How long a pointer sample stays interesting, in milliseconds. */
const VELOCITY_WINDOW_MS = 100;

/** Manhattan, so a diagonal sweep arms as readily as an axis-aligned one. */
export function dragStarted(dx: number, dy: number): boolean {
  return Math.abs(dx) + Math.abs(dy) >= DRAG_ACTIVATION_DISTANCE;
}

/**
 * Which way the list runs, measured rather than declared.
 *
 * The same three dock rows stack vertically at full size and sit side by side
 * in the compact strip as chips, so a declared axis would be wrong in one of
 * the two states of the one group.
 */
export function dragAxisOf(rects: ReadonlyArray<DragRect>): DragAxis {
  if (rects.length < 2) return "y";
  const first = rects[0];
  const second = rects[1];
  const dx = Math.abs(
    second.left + second.width / 2 - (first.left + first.width / 2),
  );
  const dy = Math.abs(
    second.top + second.height / 2 - (first.top + first.height / 2),
  );
  return dx > dy ? "x" : "y";
}

export function dragSlotsOf(
  rects: ReadonlyArray<DragRect>,
  axis: DragAxis,
): ReadonlyArray<DragSlot> {
  return rects.map((rect) =>
    axis === "y"
      ? { start: rect.top, size: rect.height }
      : { start: rect.left, size: rect.width },
  );
}

/**
 * How far a sibling steps aside: the dragged member's own footprint, gap
 * included, because that is exactly the room its departure frees. Uniform
 * across the siblings for that reason - it is one member's size being taken
 * away and given back, not a swap of two.
 */
export function dragShiftOf(
  slots: ReadonlyArray<DragSlot>,
  index: number,
): number {
  return slots[index].size + gapOf(slots);
}

/**
 * The slot the dragged member currently claims: the furthest neighbour its own
 * centre has passed.
 *
 * Centres rather than edges, so a member wider than its neighbour does not
 * claim a slot it is merely overlapping, and the claim is symmetric in both
 * directions however unequal the sizes are.
 */
export function targetSlotOf(
  slots: ReadonlyArray<DragSlot>,
  index: number,
  offset: number,
): number {
  const dragged = slots[index];
  const centre = dragged.start + offset + dragged.size / 2;
  let target = index;
  for (const [member, slot] of slots.entries()) {
    if (member === index) continue;
    const neighbour = slot.start + slot.size / 2;
    if (member < index && centre < neighbour) target = Math.min(target, member);
    if (member > index && centre > neighbour) target = Math.max(target, member);
  }
  return target;
}

/** Where one sibling wants to be while the dragged member claims `target`. */
export function siblingOffsetOf(
  index: number,
  target: number,
  member: number,
  shift: number,
): number {
  if (member === index) return 0;
  if (target > index && member > index && member <= target) return -shift;
  if (target < index && member >= target && member < index) return shift;
  return 0;
}

/**
 * Where the dragged member comes to rest: flush against the edge of the slot it
 * claimed, measured off the real boxes rather than off `shift`, which is what
 * makes a release land exactly on a neighbour of a different size.
 */
export function restingOffsetOf(
  slots: ReadonlyArray<DragSlot>,
  index: number,
  target: number,
): number {
  const from = slots[index];
  const to = slots[target];
  if (target > index) return to.start + to.size - from.size - from.start;
  if (target < index) return to.start - from.start;
  return 0;
}

/** A pull past a clamp that gives a quarter of the way and springs back. */
export function rubberBanded(offset: number, min: number, max: number): number {
  if (offset < min) return min + (offset - min) * RUBBER_BAND;
  if (offset > max) return max + (offset - max) * RUBBER_BAND;
  return offset;
}

/**
 * How far the dragged member may travel before the clamp starts resisting: the
 * offsets at which its own leading and trailing edges reach the container's.
 */
export function clampBoundsOf(
  slot: DragSlot,
  containerStart: number,
  containerEnd: number,
): { readonly min: number; readonly max: number } {
  return {
    min: containerStart - slot.start,
    max: containerEnd - (slot.start + slot.size),
  };
}

interface PointerSample {
  readonly position: number;
  readonly atMs: number;
}

/**
 * The pointer's recent speed along the drag axis, in pixels per second, for the
 * release spring's hand-off (L-29).
 *
 * A short window rather than the last pair of samples: one 2px frame at the end
 * of a fast sweep would otherwise hand the spring a standstill, and the release
 * would read as a stop rather than as the throw it was.
 */
export class PointerVelocity {
  private readonly samples: PointerSample[] = [];

  sample(position: number, atMs: number): void {
    this.samples.push({ position, atMs });
    while (
      this.samples.length > 2 &&
      atMs - this.samples[0].atMs > VELOCITY_WINDOW_MS
    )
      this.samples.shift();
  }

  perSecond(): number {
    if (this.samples.length < 2) return 0;
    const oldest = this.samples[0];
    const newest = this.samples[this.samples.length - 1];
    const elapsed = newest.atMs - oldest.atMs;
    if (elapsed <= 0) return 0;
    return ((newest.position - oldest.position) / elapsed) * 1000;
  }
}

/**
 * The gap between members, measured once off the first pair: every list a drag
 * reorders is a flex row or column with one `gap`.
 */
function gapOf(slots: ReadonlyArray<DragSlot>): number {
  if (slots.length < 2) return 0;
  return Math.max(0, slots[1].start - (slots[0].start + slots[0].size));
}
