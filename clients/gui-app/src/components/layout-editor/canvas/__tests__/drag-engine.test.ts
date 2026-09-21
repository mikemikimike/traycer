import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  armLayoutDrag,
  cancelLayoutDrag,
  layoutDragActive,
} from "@/components/layout-editor/canvas/drag-engine";

/**
 * The DOM driver, against three stacked rows with measured boxes.
 *
 * jsdom lays nothing out, so each row is handed the rect it would have had:
 * 20px tall, 4px apart, tops 0 / 24 / 48. Everything the engine decides is
 * arithmetic on those numbers, so the rects being stubbed costs the test
 * nothing - what it exercises is the wiring the pure model cannot: the
 * listeners, the frame loop, the transforms and the single commit.
 */

const ROW_HEIGHT = 20;
const ROW_GAP = 4;

interface Fixture {
  readonly container: HTMLElement;
  readonly rows: ReadonlyArray<HTMLElement>;
}

function mountRows(count: number): Fixture {
  const container = document.createElement("div");
  document.body.append(container);
  const rows = Array.from({ length: count }, (_unused, index) => {
    const row = document.createElement("div");
    row.dataset.row = String(index);
    const top = index * (ROW_HEIGHT + ROW_GAP);
    row.getBoundingClientRect = () => ({
      left: 0,
      top,
      right: 200,
      bottom: top + ROW_HEIGHT,
      width: 200,
      height: ROW_HEIGHT,
      x: 0,
      y: top,
      toJSON: () => ({}),
    });
    row.setPointerCapture = () => undefined;
    row.releasePointerCapture = () => undefined;
    row.hasPointerCapture = () => true;
    container.append(row);
    return row;
  });
  return { container, rows };
}

/** Arms a drag on one row from a real `pointerdown`, the way a surface does. */
function press(
  fixture: Fixture,
  index: number,
  onDrop: (f: number, t: number) => void,
): void {
  const row = fixture.rows[index];
  const arm = (event: Event): void => {
    if (!(event instanceof PointerEvent)) return;
    armLayoutDrag({
      event,
      onFrame: null,
      resolve: () => ({ items: fixture.rows, index, clamp: null }),
      onDrop,
    });
  };
  row.addEventListener("pointerdown", arm);
  row.dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true,
      pointerId: 1,
      button: 0,
      clientX: 0,
      clientY: 0,
    }),
  );
  row.removeEventListener("pointerdown", arm);
}

function movePointerTo(clientY: number): void {
  window.dispatchEvent(
    new PointerEvent("pointermove", { bubbles: true, pointerId: 1, clientY }),
  );
}

function releasePointer(): void {
  window.dispatchEvent(
    new PointerEvent("pointerup", { bubbles: true, pointerId: 1 }),
  );
}

async function frames(count: number): Promise<void> {
  for (let frame = 0; frame < count; frame += 1)
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
}

function translationOf(node: HTMLElement): number {
  const match = /translateY\((-?[\d.]+)px\)/.exec(node.style.transform);
  return match === null ? 0 : Number(match[1]);
}

beforeEach(() => {
  document.documentElement.setAttribute("data-reduce-panel-motion", "");
});

afterEach(() => {
  cancelLayoutDrag();
  document.documentElement.removeAttribute("data-reduce-panel-motion");
  document.body.replaceChildren();
});

describe("the drag engine", () => {
  it("leaves a press that never travelled alone", async () => {
    const fixture = mountRows(3);
    const onDrop = vi.fn();

    press(fixture, 0, onDrop);
    movePointerTo(4);
    await frames(2);

    expect(layoutDragActive()).toBe(true);
    expect(fixture.rows[0].hasAttribute("data-layout-dragging")).toBe(false);

    releasePointer();

    expect(layoutDragActive()).toBe(false);
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("reflows the siblings live and writes nothing until the release", async () => {
    const fixture = mountRows(3);
    const onDrop = vi.fn();

    press(fixture, 0, onDrop);
    movePointerTo(10);
    await frames(2);

    expect(fixture.rows[0].getAttribute("data-layout-dragging")).toBe("1");

    // Far enough for the first row's centre to pass the second row's.
    movePointerTo(40);
    await frames(2);

    // The row that has been passed has stepped up by the dragged row's own
    // footprint; the third has not moved, and nothing has been committed.
    expect(translationOf(fixture.rows[1])).toBe(-(ROW_HEIGHT + ROW_GAP));
    expect(translationOf(fixture.rows[2])).toBe(0);
    expect(onDrop).not.toHaveBeenCalled();

    releasePointer();

    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onDrop).toHaveBeenCalledWith(0, 1);
  });

  it("hands the element back exactly as it found it", async () => {
    const fixture = mountRows(3);

    press(fixture, 0, vi.fn());
    movePointerTo(10);
    await frames(2);
    movePointerTo(40);
    await frames(2);
    releasePointer();

    for (const row of fixture.rows) {
      expect(row.style.transform).toBe("");
      expect(row.style.willChange).toBe("");
    }
    expect(fixture.rows[0].hasAttribute("data-layout-dragging")).toBe(false);
    expect(layoutDragActive()).toBe(false);
  });

  it("commits nothing when the member is let go where it started", async () => {
    const fixture = mountRows(3);
    const onDrop = vi.fn();

    press(fixture, 0, onDrop);
    movePointerTo(10);
    await frames(2);
    movePointerTo(20);
    await frames(2);
    releasePointer();

    expect(onDrop).not.toHaveBeenCalled();
  });

  it("puts the member back when the system takes the pointer away", async () => {
    const fixture = mountRows(3);
    const onDrop = vi.fn();

    press(fixture, 0, onDrop);
    movePointerTo(10);
    await frames(2);
    movePointerTo(40);
    await frames(2);

    window.dispatchEvent(
      new PointerEvent("pointercancel", { bubbles: true, pointerId: 1 }),
    );

    expect(layoutDragActive()).toBe(false);
    expect(onDrop).not.toHaveBeenCalled();
    for (const row of fixture.rows) expect(row.style.transform).toBe("");
  });

  it("stops on a cancel, writes nothing, and leaves no transform behind", async () => {
    const fixture = mountRows(3);
    const onDrop = vi.fn();

    press(fixture, 0, onDrop);
    movePointerTo(10);
    await frames(2);
    movePointerTo(40);
    await frames(2);

    cancelLayoutDrag();

    expect(layoutDragActive()).toBe(false);
    expect(onDrop).not.toHaveBeenCalled();
    for (const row of fixture.rows) expect(row.style.transform).toBe("");

    // The listeners went with it: a pointer that keeps moving moves nothing.
    movePointerTo(80);
    await frames(2);
    for (const row of fixture.rows) expect(row.style.transform).toBe("");
  });

  it("rides the release spring home before it commits, under full motion", async () => {
    document.documentElement.removeAttribute("data-reduce-panel-motion");
    const fixture = mountRows(3);
    const onDrop = vi.fn();

    press(fixture, 0, onDrop);
    movePointerTo(10);
    await frames(2);
    movePointerTo(40);
    await frames(2);
    releasePointer();

    // The pointer has gone, the element has not arrived: the drop is the end
    // of the travel, not the end of the gesture.
    expect(onDrop).not.toHaveBeenCalled();
    expect(layoutDragActive()).toBe(true);

    await frames(90);

    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onDrop).toHaveBeenCalledWith(0, 1);
    expect(layoutDragActive()).toBe(false);
  });

  it("holds a pinned member inside its cluster and springs it back", async () => {
    const fixture = mountRows(3);
    const clamp = document.createElement("div");
    clamp.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 200,
      bottom: 88,
      width: 200,
      height: 88,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const onDrop = vi.fn();
    const row = fixture.rows[2];
    const arm = (event: Event): void => {
      if (!(event instanceof PointerEvent)) return;
      armLayoutDrag({
        event,
        onFrame: null,
        resolve: () => ({ items: fixture.rows, index: 2, clamp }),
        onDrop,
      });
    };
    row.addEventListener("pointerdown", arm);
    row.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerId: 1,
        button: 0,
        clientX: 0,
        clientY: 0,
      }),
    );

    movePointerTo(10);
    await frames(2);
    // 100px below the grab point, with 20px of room left in the cluster: the
    // last row's bottom is at 68 and the cluster's is at 88.
    movePointerTo(110);
    await frames(2);

    // A quarter of the 80px overshoot survives: 20 + 20 = 40, not 100.
    expect(translationOf(fixture.rows[2])).toBeCloseTo(40, 5);

    releasePointer();
  });
});
