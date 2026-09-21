import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSelectionRing,
  type SelectionRingController,
} from "@/components/layout-editor/canvas/selection-ring";

let ring: SelectionRingController | null = null;
let measured = 0;

function region(rect: {
  x: number;
  y: number;
  width: number;
  height: number;
}): HTMLElement {
  const node = document.createElement("div");
  node.getBoundingClientRect = (): DOMRect => {
    measured += 1;
    return new DOMRect(rect.x, rect.y, rect.width, rect.height);
  };
  document.body.append(node);
  return node;
}

function ringElement(): HTMLElement {
  const element = document.querySelector("[data-layout-selection-ring]");
  if (!(element instanceof HTMLElement))
    throw new Error("the ring element is not mounted");
  return element;
}

/** The ring's painted box, as numbers: jsdom rewrites "206.00px" to "206px". */
function ringBox(): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const element = ringElement();
  const translate = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(
    element.style.transform,
  );
  if (translate === null) throw new Error("the ring has no transform");
  return {
    x: Number(translate[1]),
    y: Number(translate[2]),
    width: Number.parseFloat(element.style.width),
    height: Number.parseFloat(element.style.height),
  };
}

function frames(count: number): void {
  for (let frame = 0; frame < count; frame += 1) vi.advanceTimersByTime(17);
}

beforeEach(() => {
  measured = 0;
  vi.useFakeTimers();
  ring = createSelectionRing();
});

afterEach(() => {
  ring?.destroy();
  ring = null;
  vi.useRealTimers();
  document.body.replaceChildren();
  document.documentElement.removeAttribute("data-reduce-panel-motion");
});

describe("the one shared ring", () => {
  it("mounts exactly one element and keeps it away until something is selected", () => {
    expect(
      document.querySelectorAll("[data-layout-selection-ring]"),
    ).toHaveLength(1);
    expect(ringElement().hidden).toBe(true);
  });

  it("places itself around the tracked region, padded", () => {
    ring?.track(region({ x: 100, y: 50, width: 200, height: 30 }));
    frames(2);

    expect(ringElement().hidden).toBe(false);
    expect(ringBox()).toEqual({ x: 97, y: 47, width: 206, height: 36 });
    expect(ringElement().getAttribute("data-on")).toBe("1");
  });

  it("parks once it has arrived and wakes when told the canvas moved", () => {
    const node = region({ x: 100, y: 50, width: 200, height: 30 });
    ring?.track(node);
    frames(2);
    const atRest = measured;

    frames(40);
    expect(measured).toBe(atRest);

    ring?.refresh();
    frames(1);
    expect(measured).toBeGreaterThan(atRest);
  });

  it("does not wake for a re-track of the node it is already on (G1-04)", () => {
    // The canvas painter runs on every editor-store notification - a hover, a
    // filter keystroke - and used to re-arm the loop through `track`. That is
    // a layout read per notification for a ring that has already arrived,
    // which is why re-measuring is `refresh`'s own entry point now.
    const node = region({ x: 100, y: 50, width: 200, height: 30 });
    ring?.track(node);
    frames(40);
    const atRest = measured;

    ring?.track(node);
    ring?.track(node);
    frames(4);

    expect(measured).toBe(atRest);
  });

  it("travels to a second region rather than jumping to it", () => {
    ring?.track(region({ x: 100, y: 50, width: 200, height: 30 }));
    frames(2);

    ring?.track(region({ x: 600, y: 400, width: 100, height: 20 }));
    frames(2);
    const travelling = ringBox();
    expect(travelling.x).toBeGreaterThan(97);
    expect(travelling.x).toBeLessThan(597);

    frames(60);
    expect(ringBox().x).toBeCloseTo(597, 1);
    expect(ringBox().y).toBeCloseTo(397, 1);
  });

  it("snaps instead of travelling under reduced motion", () => {
    ring?.track(region({ x: 100, y: 50, width: 200, height: 30 }));
    frames(2);

    document.documentElement.setAttribute("data-reduce-panel-motion", "");
    ring?.track(region({ x: 600, y: 400, width: 100, height: 20 }));
    frames(1);

    expect(ringBox()).toEqual({ x: 597, y: 397, width: 106, height: 26 });
  });

  it("hides and stops measuring on deselect", () => {
    ring?.track(region({ x: 100, y: 50, width: 200, height: 30 }));
    frames(2);

    ring?.track(null);
    const atRest = measured;
    frames(20);

    expect(ringElement().hidden).toBe(true);
    expect(ringElement().hasAttribute("data-on")).toBe(false);
    expect(measured).toBe(atRest);
  });

  it("takes its element with it when destroyed", () => {
    ring?.destroy();
    ring = null;

    expect(
      document.querySelectorAll("[data-layout-selection-ring]"),
    ).toHaveLength(0);
  });
});
