import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LayoutFormHostContext } from "@/components/layout-editor/inspector/layout-form-host";
import { FineTuneDisclosure } from "@/components/layout-editor/inspector/rows/fine-tune-row";
import { LAYOUT_REGIONS } from "@/components/layout-editor/regions/layout-regions";
import { effectiveLayoutValues } from "@/lib/layout/layout-presets";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import {
  DEFAULT_LAYOUT_SNAPSHOT,
  useLayoutStore,
} from "@/stores/layout/layout-store";

/**
 * Item 2 - flat fine-tune on the page (G6): the collapsed "Fine-tune (n)"
 * trigger only exists in the dock. On the page - `LayoutFormHostContext`
 * `"page"` - these rows already sit behind the region row's OWN disclosure
 * (`surface-section.tsx`'s `RegionRowDetail`), so a second collapsible inside
 * it hid a single row behind two clicks. Resource monitor is the region under
 * test because its fine-tune section has two rows (`agentRows`, `metrics`),
 * which is also what item 3's per-row greying needs.
 */

const FINE_TUNE_ROW = LAYOUT_REGIONS.resourceMonitor.rows.find(
  (row) => row.kind === "fine-tune",
);

const FINE_TUNE_ROWS =
  FINE_TUNE_ROW?.kind === "fine-tune" ? FINE_TUNE_ROW.rows : [];

if (FINE_TUNE_ROWS.length === 0) {
  throw new Error("resourceMonitor has no fine-tune row");
}

function regionValues() {
  const state = useLayoutStore.getState();
  return effectiveLayoutValues(state.basePreset, state.overrides)
    .resourceMonitor;
}

function disclosure(host: "page" | "inspector"): ReactNode {
  return (
    <LayoutFormHostContext value={host}>
      <FineTuneDisclosure
        rows={FINE_TUNE_ROWS}
        regionId="resourceMonitor"
        regionValues={regionValues()}
        filter=""
        regionHidden={false}
      />
    </LayoutFormHostContext>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  useLayoutStore.setState({
    ...DEFAULT_LAYOUT_SNAPSHOT,
    layoutCarryDone: true,
  });
  useLayoutEditorStore.getState().endSession();
});

afterEach(() => {
  cleanup();
  useLayoutEditorStore.getState().endSession();
});

describe("the page host draws fine-tune flat (G6)", () => {
  it("has no collapsed 'Fine-tune (n)' trigger, and shows every row right away", () => {
    render(disclosure("page"));

    expect(screen.queryByText(/^Fine-tune \(/)).toBeNull();
    expect(screen.queryByRole("button", { name: /^Fine-tune/ })).toBeNull();

    // Both rows are visible with no click at all - not behind a second
    // disclosure inside the page row's own one.
    expect(screen.getByText("Readings on agent rows")).not.toBeNull();
    expect(screen.getByText("Metrics")).not.toBeNull();
  });
});

describe("the dock host keeps the collapsed trigger", () => {
  it("draws 'Fine-tune (n)' as a real collapsible, closed until opened", () => {
    render(disclosure("inspector"));

    const trigger = screen.getByRole("button", {
      name: `Fine-tune (${String(FINE_TUNE_ROWS.length)})`,
    });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Metrics")).toBeNull();
  });
});
