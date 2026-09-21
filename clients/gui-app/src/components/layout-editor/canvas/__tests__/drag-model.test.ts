import { describe, expect, it } from "vitest";
import {
  clampBoundsOf,
  dragAxisOf,
  dragShiftOf,
  dragSlotsOf,
  dragStarted,
  PointerVelocity,
  restingOffsetOf,
  rubberBanded,
  siblingOffsetOf,
  targetSlotOf,
  type DragRect,
} from "@/components/layout-editor/canvas/drag-model";

/** Three 20px rows, 4px apart: tops 0, 24, 48. */
const ROWS: ReadonlyArray<DragRect> = [
  { left: 0, top: 0, width: 200, height: 20 },
  { left: 0, top: 24, width: 200, height: 20 },
  { left: 0, top: 48, width: 200, height: 20 },
];

/** A small chip beside a wide one, 4px apart: lefts 0 and 14. */
const UNEVEN_ROW: ReadonlyArray<DragRect> = [
  { left: 0, top: 0, width: 10, height: 20 },
  { left: 14, top: 0, width: 40, height: 20 },
];

const rowSlots = dragSlotsOf(ROWS, "y");

describe("arming", () => {
  it("waits for the six pixels that tell a drag from a click", () => {
    expect(dragStarted(3, 2)).toBe(false);
    expect(dragStarted(0, 6)).toBe(true);
    // Manhattan, so a diagonal sweep arms as readily as an axis-aligned one.
    expect(dragStarted(-4, 3)).toBe(true);
  });
});

describe("the axis, measured rather than declared", () => {
  it("reads a stack as vertical and a strip as horizontal", () => {
    expect(dragAxisOf(ROWS)).toBe("y");
    expect(dragAxisOf(UNEVEN_ROW)).toBe("x");
  });

  it("falls back to vertical with nothing to compare", () => {
    expect(dragAxisOf([ROWS[0]])).toBe("y");
  });
});

describe("which slot the dragged member claims", () => {
  it("stays put until its own centre passes a neighbour's", () => {
    // The first row's centre is at 10; the second row's is at 34.
    expect(targetSlotOf(rowSlots, 0, 23)).toBe(0);
    expect(targetSlotOf(rowSlots, 0, 25)).toBe(1);
  });

  it("claims the furthest neighbour it has passed, in both directions", () => {
    expect(targetSlotOf(rowSlots, 0, 60)).toBe(2);
    expect(targetSlotOf(rowSlots, 2, -60)).toBe(0);
    expect(targetSlotOf(rowSlots, 2, -25)).toBe(1);
  });
});

describe("the reflow the siblings run", () => {
  it("moves every member between the two slots, and nobody else", () => {
    const shift = dragShiftOf(rowSlots, 0);

    // The first row claiming the second: only the second steps up.
    expect(siblingOffsetOf(0, 1, 1, shift)).toBe(-24);
    expect(siblingOffsetOf(0, 1, 2, shift)).toBe(0);
    // Claiming the third: both step up.
    expect(siblingOffsetOf(0, 2, 1, shift)).toBe(-24);
    expect(siblingOffsetOf(0, 2, 2, shift)).toBe(-24);
    // The dragged member is driven by the pointer, never by this.
    expect(siblingOffsetOf(0, 2, 0, shift)).toBe(0);
  });

  it("steps aside by the dragged member's own footprint, gap included", () => {
    const slots = dragSlotsOf(UNEVEN_ROW, "x");

    // The narrow chip frees 10px of box plus the 4px gap behind it.
    expect(dragShiftOf(slots, 0)).toBe(14);
    // The wide one frees its own 40.
    expect(dragShiftOf(slots, 1)).toBe(44);
  });
});

describe("where a release lands", () => {
  it("puts the member flush in the slot it claimed", () => {
    expect(restingOffsetOf(rowSlots, 0, 1)).toBe(24);
    expect(restingOffsetOf(rowSlots, 0, 2)).toBe(48);
    expect(restingOffsetOf(rowSlots, 2, 0)).toBe(-48);
    expect(restingOffsetOf(rowSlots, 1, 1)).toBe(0);
  });

  it("lands on a neighbour of a different size by its far edge", () => {
    const slots = dragSlotsOf(UNEVEN_ROW, "x");

    // The 10px chip ends flush against the 40px one's right edge, which is
    // 44 away - not the 14 a uniform step would have given it.
    expect(restingOffsetOf(slots, 0, 1)).toBe(44);
    expect(restingOffsetOf(slots, 1, 0)).toBe(-14);
  });
});

describe("the rubber band on a pinned member", () => {
  it("passes a pull inside the clamp through untouched", () => {
    expect(rubberBanded(12, -10, 30)).toBe(12);
    expect(rubberBanded(-10, -10, 30)).toBe(-10);
  });

  it("gives a quarter of the way past either edge", () => {
    expect(rubberBanded(-50, -10, 30)).toBe(-20);
    expect(rubberBanded(70, -10, 30)).toBe(40);
  });

  it("measures the clamp from the member's own two edges", () => {
    // A 40px member at 100, inside a container spanning 80..300.
    expect(clampBoundsOf({ start: 100, size: 40 }, 80, 300)).toEqual({
      min: -20,
      max: 160,
    });
  });
});

describe("the velocity handed to the release", () => {
  it("is zero before the pointer has moved", () => {
    const velocity = new PointerVelocity();
    velocity.sample(40, 0);

    expect(velocity.perSecond()).toBe(0);
  });

  it("reports pixels per second, signed with the direction", () => {
    const velocity = new PointerVelocity();
    velocity.sample(0, 0);
    velocity.sample(-100, 100);

    expect(velocity.perSecond()).toBe(-1000);
  });

  it("still hands over the speed of a sweep that ended on a slow frame", () => {
    const velocity = new PointerVelocity();
    // 2px per millisecond for 96ms, then one nearly still frame.
    for (let at = 0; at <= 96; at += 16) velocity.sample(at * 2, at);
    velocity.sample(193, 112);

    // The last pair alone would read about 60px/s; the window sees the sweep.
    expect(velocity.perSecond()).toBeGreaterThan(1000);
  });

  it("forgets a sweep the pointer has since sat still through", () => {
    const velocity = new PointerVelocity();
    velocity.sample(0, 0);
    velocity.sample(400, 100);
    velocity.sample(400, 300);
    velocity.sample(400, 500);

    expect(velocity.perSecond()).toBe(0);
  });
});
