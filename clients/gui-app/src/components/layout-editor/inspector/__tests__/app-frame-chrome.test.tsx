import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  AppFrameComposerStack,
  AppFrameStatusBarRow,
  AppFrameTopBar,
} from "@/components/layout-editor/inspector/app-frame-chrome";
import {
  DEFAULT_ARRANGEMENT,
  type LayoutArrangement,
} from "@/lib/layout/layout-arrangement";
import { PRESET_VALUES } from "@/lib/layout/layout-presets";
import type { LayoutValues } from "@/lib/layout/layout-values";

/** The shipped values, with one dock member folded down to a pill. */
const MIXED_DOCK: LayoutValues = {
  ...PRESET_VALUES.default,
  background: { shown: "shown", size: "chip" },
};

afterEach(cleanup);

/**
 * The app's frame around the regions, which BOTH pictures of the app compose:
 * the preset miniature (a whole scaled window) and the Settings page's two
 * bands (one surface at 1:1).
 *
 * These cases used to live in `surface-specimen.test.tsx`. That component is
 * deleted - three of its five branches went with the plinths (L-120) - but
 * what it was really pinning is the chrome, which is shared, so the claims
 * moved here rather than being dropped.
 */
describe("the composer stack (L-97, L-99)", () => {
  it("draws its full-size rows as ONE joined frame (R1-01)", () => {
    render(
      <AppFrameComposerStack
        values={MIXED_DOCK}
        arrangement={DEFAULT_ARRANGEMENT}
      />,
    );

    const dock = screen.getByTestId("app-frame-dock");
    const frames = dock.querySelectorAll('[data-layout-depiction="dock"]');
    expect(frames).toHaveLength(1);
    // Every full-size member is inside that one frame - they used to be a
    // bordered rounded-top box each, inside a further one. Counted off the
    // arrangement rather than written out, so a dock member joining or
    // leaving (L-142 added two) moves this claim with it.
    const fullSizeMembers = DEFAULT_ARRANGEMENT.dock.filter(
      (regionId) => MIXED_DOCK[regionId].size === "full",
    );
    expect(fullSizeMembers.length).toBeGreaterThan(1);
    expect(frames[0]?.childElementCount).toBe(fullSizeMembers.length);
  });

  it("keeps the compact pills above the frame, at the composer's left edge", () => {
    render(
      <AppFrameComposerStack
        values={MIXED_DOCK}
        arrangement={DEFAULT_ARRANGEMENT}
      />,
    );

    const dock = screen.getByTestId("app-frame-dock");
    expect(dock.firstElementChild).toBe(
      screen.getByTestId("app-frame-dock-chips"),
    );
    // The frame is the last thing before the composer box, because the tuck
    // under it is what makes the two one surface (L-99).
    expect(dock.lastElementChild?.getAttribute("data-layout-depiction")).toBe(
      "dock",
    );
    expect(dock.nextElementSibling?.getAttribute("data-testid")).toBe(
      "app-frame-composer",
    );
  });
});

/**
 * R2-02: the strip's assembly - which reading leads and where the spacer goes
 * - was written twice, so a change to what the placement fields mean had to be
 * made in two files or the preset card and the Settings band disagreed about
 * the app. L-156 made that placement four fields, two per reading, and both
 * bars now draw their clusters through the same one copy.
 */
describe("the two bars' clusters (R2-02, L-156)", () => {
  /**
   * The row's own shape: which slots hold which picture, and where the spacer
   * that separates the two ends sits. The resource readout is the one that
   * prints `cpu`; read off the DOM rather than off a class, and it is the one
   * thing this component decides.
   */
  function shapeOf(): ReadonlyArray<string> {
    return [...screen.getByTestId("bar").children].map((child) => {
      if (!child.hasAttribute("data-layout-depiction")) return "spacer";
      return child.textContent.includes("cpu") ? "resource" : "usage";
    });
  }

  function renderRow(arrangement: LayoutArrangement): void {
    render(
      <div data-testid="bar">
        <AppFrameStatusBarRow
          values={PRESET_VALUES.default}
          arrangement={arrangement}
        />
      </div>,
    );
  }

  it("puts each reading at the end of the strip it names", () => {
    renderRow(DEFAULT_ARRANGEMENT);
    expect(shapeOf()).toEqual(["usage", "spacer", "resource"]);
    cleanup();

    renderRow({
      ...DEFAULT_ARRANGEMENT,
      usageSide: "right",
      resourceSide: "left",
    });
    expect(shapeOf()).toEqual(["resource", "spacer", "usage"]);
  });

  it("leads with the usage limits where the two share one end", () => {
    renderRow({ ...DEFAULT_ARRANGEMENT, resourceSide: "left" });
    expect(shapeOf()).toEqual(["usage", "resource", "spacer"]);
  });

  it("draws the reading that named the top bar up there instead", () => {
    const arrangement: LayoutArrangement = {
      ...DEFAULT_ARRANGEMENT,
      resourceHost: "header",
    };
    renderRow(arrangement);
    // The strip keeps the usage cluster, which did not move.
    expect(shapeOf()).toEqual(["usage", "spacer"]);
    cleanup();

    render(
      <div data-testid="bar">
        <AppFrameTopBar
          values={PRESET_VALUES.default}
          arrangement={arrangement}
        />
      </div>,
    );
    expect(shapeOf().filter((slot) => slot !== "spacer")).toContain("resource");
  });

  it("draws nothing for a region the surface does not show", () => {
    render(
      <div data-testid="bar">
        <AppFrameStatusBarRow
          values={{
            ...PRESET_VALUES.default,
            resourceMonitor: {
              ...PRESET_VALUES.default.resourceMonitor,
              shown: "hidden",
            },
          }}
          arrangement={DEFAULT_ARRANGEMENT}
        />
      </div>,
    );

    expect(shapeOf()).toEqual(["usage", "spacer"]);
  });
});
