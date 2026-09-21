import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  AppFrameComposerStack,
  AppFrameStatusBarRow,
} from "@/components/layout-editor/inspector/app-frame-chrome";
import { DEFAULT_ARRANGEMENT } from "@/lib/layout/layout-arrangement";
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
    // Changed files and Active agents are inside that one frame - they used to
    // be two bordered rounded-top boxes inside a third.
    expect(frames[0]?.childElementCount).toBe(2);
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
 * R2-02: the strip's assembly - which region leads, where the spacer goes,
 * that `resourceSide` decides it - was written twice, so a change to what
 * `resourceSide` means had to be made in two files or the preset card and the
 * Settings band disagreed about the app.
 */
describe("the status bar row (R2-02)", () => {
  /**
   * The row's own shape: which slots hold a picture and where the spacer that
   * separates the two ends of the strip sits. Read off the DOM rather than off
   * a class, and it is the one thing this component decides.
   */
  function shapeOf(): ReadonlyArray<string> {
    return [...screen.getByTestId("bar").children].map((child) =>
      child.hasAttribute("data-layout-depiction") ? "region" : "spacer",
    );
  }

  it("puts the resource readout on the side the arrangement names", () => {
    const { rerender } = render(
      <div data-testid="bar">
        <AppFrameStatusBarRow
          values={PRESET_VALUES.default}
          arrangement={{ ...DEFAULT_ARRANGEMENT, resourceSide: "right" }}
        />
      </div>,
    );
    expect(shapeOf()).toEqual(["region", "spacer", "region"]);

    rerender(
      <div data-testid="bar">
        <AppFrameStatusBarRow
          values={PRESET_VALUES.default}
          arrangement={{ ...DEFAULT_ARRANGEMENT, resourceSide: "left" }}
        />
      </div>,
    );
    expect(shapeOf()).toEqual(["region", "region", "spacer"]);
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

    expect(shapeOf()).toEqual(["region", "spacer"]);
  });
});
