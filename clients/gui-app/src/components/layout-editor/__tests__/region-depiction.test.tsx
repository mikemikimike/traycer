import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DEFAULT_ARRANGEMENT } from "@/lib/layout/layout-arrangement";
import { SHIPPED_DEFAULT_VALUES } from "@/lib/layout/layout-presets";
import {
  depictRegion,
  type HostContextId,
} from "@/components/layout-editor/region-depiction";
import type { LayoutArrangement } from "@/lib/layout/layout-arrangement";
import type { LayoutValues } from "@/lib/layout/layout-values";
import type { RegionId } from "@/lib/layout/region-id";

/**
 * What a picture owes the thing it is a picture of, at the level a unit test
 * can decide: it is drawn in its real host's context, it draws what the values
 * ask for, and it draws at all whether or not the region is shown. Whether it
 * looks the same is the parity regression's question (L-53), in real Chrome.
 */

function frameOf(regionId: RegionId, container: HTMLElement): HTMLElement {
  const frame = container.querySelector("[data-layout-depiction]");
  if (!(frame instanceof HTMLElement)) {
    throw new Error(`no depiction frame for ${regionId}`);
  }
  return frame;
}

function hostOf(regionId: RegionId, container: HTMLElement): string | null {
  return frameOf(regionId, container).getAttribute("data-layout-depiction");
}

/**
 * The host a region is drawn in, read off the picture rather than off the
 * mapping that produced it: the mapping is private to the module, and what
 * callers actually depend on is the frame's own context attribute.
 */
function drawnHostOf(
  regionId: RegionId,
  arrangement: LayoutArrangement,
): string | null {
  const values: LayoutValues[RegionId] = SHIPPED_DEFAULT_VALUES[regionId];
  const { container } = render(
    depictRegion(regionId, values, arrangement, null),
  );
  return hostOf(regionId, container);
}

describe("the host context a depiction is drawn in", () => {
  it("follows the arrangement for the one region that moves surface", () => {
    expect(drawnHostOf("usageLimits", DEFAULT_ARRANGEMENT)).toBe("status-bar");
    expect(
      drawnHostOf("usageLimits", {
        ...DEFAULT_ARRANGEMENT,
        usageHost: "header",
      }),
    ).toBe("top-bar");
  });

  it("puts every other region in its own surface", () => {
    const expected: ReadonlyArray<[RegionId, HostContextId]> = [
      ["homeTab", "top-bar"],
      ["resourceMonitor", "status-bar"],
      ["minimap", "chat"],
      ["contextUsage", "composer-foot"],
      ["background", "dock"],
      ["access", "toolbar"],
      ["railComments", "rail"],
    ];
    for (const [regionId, host] of expected) {
      expect(drawnHostOf(regionId, DEFAULT_ARRANGEMENT), regionId).toBe(host);
    }
  });

  /**
   * The second region that moves surface, and this one moves itself: a dock
   * member set to Chip is a pill in the strip above the composer, not a row in
   * the dock's joined frame (L-97). A picture framed by the region's SURFACE
   * alone drew the real pill inside the frame it had just left.
   */
  it("frames a dock member by the size it is drawn at", () => {
    const full = render(
      depictRegion(
        "changedFiles",
        { shown: "shown", size: "full" },
        DEFAULT_ARRANGEMENT,
        null,
      ),
    );
    expect(hostOf("changedFiles", full.container)).toBe("dock");

    const chip = render(
      depictRegion(
        "changedFiles",
        { shown: "shown", size: "chip" },
        DEFAULT_ARRANGEMENT,
        null,
      ),
    );
    expect(hostOf("changedFiles", chip.container)).toBe("chip-strip");
  });

  it("honours a host the caller named over the one the region lives in", () => {
    const { container } = render(
      depictRegion(
        "runningAgents",
        SHIPPED_DEFAULT_VALUES.runningAgents,
        DEFAULT_ARRANGEMENT,
        "chip-strip",
      ),
    );
    expect(hostOf("runningAgents", container)).toBe("chip-strip");
  });
});

describe("what a depiction draws", () => {
  it("reports only the metrics the values switched on", () => {
    const { container } = render(
      depictRegion(
        "resourceMonitor",
        {
          shown: "shown",
          cpu: true,
          memory: false,
          processes: true,
          ramShare: false,
        },
        DEFAULT_ARRANGEMENT,
        null,
      ),
    );
    const text = frameOf("resourceMonitor", container).textContent;
    expect(text).toContain("cpu");
    expect(text).toContain("procs");
    expect(text).not.toContain("mem");
    expect(text).not.toContain("ram");
  });

  it("draws the context chip's three readings differently", () => {
    const base = SHIPPED_DEFAULT_VALUES.contextUsage;
    const text = render(
      depictRegion(
        "contextUsage",
        { ...base, style: "text" },
        DEFAULT_ARRANGEMENT,
        null,
      ),
    );
    expect(text.container.textContent).toContain("% context left");
    expect(text.container.querySelector("svg")).toBeNull();

    const ring = render(
      depictRegion(
        "contextUsage",
        { ...base, style: "ring" },
        DEFAULT_ARRANGEMENT,
        null,
      ),
    );
    expect(ring.container.querySelector("svg")).not.toBeNull();
    expect(ring.container.textContent).not.toContain("context left");
    const ringReading = ring.container.textContent;

    const ringOnly = render(
      depictRegion(
        "contextUsage",
        { ...base, style: "ring-only" },
        DEFAULT_ARRANGEMENT,
        null,
      ),
    );
    expect(ringOnly.container.querySelector("svg")).not.toBeNull();
    expect(ringOnly.container.textContent).toBe("");
    expect(ringReading).not.toBe("");
  });

  it("collapses the access pill to its icon as a chip", () => {
    const full = render(
      depictRegion(
        "access",
        { shown: "shown", size: "full" },
        DEFAULT_ARRANGEMENT,
        null,
      ),
    );
    expect(full.container.textContent).toContain("Full access");

    const chip = render(
      depictRegion(
        "access",
        { shown: "shown", size: "chip" },
        DEFAULT_ARRANGEMENT,
        null,
      ),
    );
    // The label is still in the tree for the accessible name, but the chip
    // hides it - which is the real component's own behaviour under `compact`.
    const label = chip.container.querySelector("span.hidden");
    expect(label?.textContent).toBe("Full access");
  });

  it("draws a region that is switched off, because the stage dims instead", () => {
    const { container } = render(
      depictRegion(
        "access",
        { shown: "hidden", size: "full" },
        DEFAULT_ARRANGEMENT,
        null,
      ),
    );
    expect(container.textContent).toContain("Full access");
  });

  it("draws one rail icon per panel, from the sidebar's own definition", () => {
    const { container } = render(
      depictRegion(
        "railGitDiff",
        SHIPPED_DEFAULT_VALUES.railGitDiff,
        DEFAULT_ARRANGEMENT,
        null,
      ),
    );
    expect(container.querySelectorAll("svg")).toHaveLength(1);
    expect(hostOf("railGitDiff", container)).toBe("rail");
  });

  it("keeps the usage reading's parts under the values' control", () => {
    const base = SHIPPED_DEFAULT_VALUES.usageLimits;
    const withWord = render(
      depictRegion(
        "usageLimits",
        { ...base, word: true, amount: "remaining" },
        DEFAULT_ARRANGEMENT,
        null,
      ),
    );
    expect(withWord.container.textContent).toContain("remaining");

    const withoutWord = render(
      depictRegion(
        "usageLimits",
        { ...base, word: false, amount: "remaining" },
        DEFAULT_ARRANGEMENT,
        null,
      ),
    );
    expect(withoutWord.container.textContent).not.toContain("remaining");
  });

  it("draws one segment per provider the arrangement still shows", () => {
    const visible = DEFAULT_ARRANGEMENT.usageProviders;
    const hiddenAll = render(
      depictRegion(
        "usageLimits",
        SHIPPED_DEFAULT_VALUES.usageLimits,
        { ...DEFAULT_ARRANGEMENT, hiddenProviders: visible },
        null,
      ),
    );
    expect(hiddenAll.container.querySelectorAll("svg")).toHaveLength(0);

    const oneHidden = render(
      depictRegion(
        "usageLimits",
        SHIPPED_DEFAULT_VALUES.usageLimits,
        { ...DEFAULT_ARRANGEMENT, hiddenProviders: visible.slice(1) },
        null,
      ),
    );
    expect(
      oneHidden.container.querySelectorAll("[data-provider-id]"),
    ).toHaveLength(1);
  });
});

describe("the clip", () => {
  it("leaves an unclipped depiction unmasked", () => {
    const { container } = render(
      depictRegion(
        "attachImage",
        SHIPPED_DEFAULT_VALUES.attachImage,
        DEFAULT_ARRANGEMENT,
        null,
      ),
    );
    expect(frameOf("attachImage", container).dataset.clipped).toBe("false");
    expect(screen.getByLabelText("Attach image")).toBeTruthy();
  });
});
