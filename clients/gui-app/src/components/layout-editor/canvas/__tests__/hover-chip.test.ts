import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createHoverChip,
  type HoverChipController,
} from "@/components/layout-editor/canvas/hover-chip";

let chip: HoverChipController | null = null;

function chipElement(): HTMLElement {
  const element = document.querySelector("[data-layout-hover-chip]");
  if (!(element instanceof HTMLElement))
    throw new Error("the chip element is not mounted");
  return element;
}

function column(): HTMLElement {
  const element = document.createElement("div");
  element.setAttribute("data-layout-editing", "1");
  element.getBoundingClientRect = (): DOMRect => new DOMRect(0, 0, 800, 600);
  document.body.append(element);
  return element;
}

function region(
  host: HTMLElement,
  rect: { x: number; y: number; width: number; height: number },
): HTMLElement {
  const node = document.createElement("div");
  node.getBoundingClientRect = (): DOMRect =>
    new DOMRect(rect.x, rect.y, rect.width, rect.height);
  host.append(node);
  return node;
}

afterEach(() => {
  chip?.destroy();
  chip = null;
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("the anchored path", () => {
  beforeEach(() => {
    vi.stubGlobal("CSS", { supports: () => true });
    chip = createHoverChip();
  });

  it("records that it took the anchored path and writes no coordinates", () => {
    const node = region(column(), { x: 100, y: 200, width: 60, height: 20 });
    chip?.show({ label: "Minimap - Right", node, placement: "above" });

    const element = chipElement();
    expect(element.getAttribute("data-anchored")).toBe("1");
    expect(element.textContent).toBe("Minimap - Right");
    expect(element.getAttribute("data-placement")).toBe("above");
    expect(element.style.top).toBe("");
    expect(element.style.left).toBe("");
    expect(element.hidden).toBe(false);
  });

  it("declares the placement the top bar needs", () => {
    const node = region(column(), { x: 10, y: 0, width: 60, height: 20 });
    chip?.show({ label: "Home tab - Shown", node, placement: "below" });

    expect(chipElement().getAttribute("data-placement")).toBe("below");
  });
});

describe("the measured fallback", () => {
  beforeEach(() => {
    // The test environment has no `CSS` object, which is the fallback's own
    // trigger; stubbed anyway so the two paths are chosen the same way.
    vi.stubGlobal("CSS", { supports: () => false });
    chip = createHoverChip();
  });

  it("sits above the region, centred on it", () => {
    const node = region(column(), { x: 100, y: 200, width: 60, height: 20 });
    chip?.show({ label: "Minimap", node, placement: "above" });

    const element = chipElement();
    expect(element.getAttribute("data-anchored")).toBe("0");
    // jsdom gives the chip no size, so "centred" is the region's own centre.
    expect(element.style.left).toBe("130px");
    expect(element.style.top).toBe("194px");
  });

  it("flips under a region with nothing above it", () => {
    const node = region(column(), { x: 100, y: 0, width: 60, height: 20 });
    chip?.show({ label: "Home tab", node, placement: "above" });

    expect(chipElement().style.top).toBe("26px");
  });

  it("stays inside the app column rather than over the inspector", () => {
    const host = column();
    const node = region(host, { x: 780, y: 200, width: 60, height: 20 });
    chip?.show({ label: "Usage limits", node, placement: "above" });

    expect(chipElement().style.left).toBe("794px");
  });

  it("goes away on hide", () => {
    const node = region(column(), { x: 100, y: 200, width: 60, height: 20 });
    chip?.show({ label: "Minimap", node, placement: "above" });
    chip?.hide();

    expect(chipElement().hidden).toBe(true);
  });
});
