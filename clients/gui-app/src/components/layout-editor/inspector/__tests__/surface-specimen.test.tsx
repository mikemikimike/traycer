import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SurfaceSpecimen } from "@/components/layout-editor/inspector/surface-specimen";
import { DEFAULT_ARRANGEMENT } from "@/lib/layout/layout-arrangement";
import { PRESET_VALUES } from "@/lib/layout/layout-presets";
import type { LayoutValues } from "@/lib/layout/layout-values";

/** The shipped values, with one dock member folded down to a pill. */
const MIXED_DOCK: LayoutValues = {
  ...PRESET_VALUES.default,
  background: { shown: "shown", size: "chip" },
};

afterEach(cleanup);

describe("the Composer specimen (L-95, L-97)", () => {
  it("draws its full-size rows as ONE joined frame (R1-01)", () => {
    render(
      <SurfaceSpecimen
        surface="composer"
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
      <SurfaceSpecimen
        surface="composer"
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
