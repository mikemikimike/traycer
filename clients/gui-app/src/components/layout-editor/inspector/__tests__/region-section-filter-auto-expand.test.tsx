import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RegionSection } from "@/components/layout-editor/inspector/region-section";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import {
  DEFAULT_LAYOUT_SNAPSHOT,
  useLayoutStore,
} from "@/stores/layout/layout-store";

beforeEach(() => {
  window.localStorage.clear();
  useLayoutStore.setState({
    ...DEFAULT_LAYOUT_SNAPSHOT,
    layoutCarryDone: true,
  });
  useLayoutEditorStore.getState().endSession();
  useLayoutEditorStore.setState({
    instances: new Map(),
    dockMode: "right",
    lockedBy: "none",
  });
});

afterEach(() => {
  cleanup();
  useLayoutEditorStore.getState().endSession();
});

describe("Fine-tune auto-expand (L-07, fineTuneMatchesFilter)", () => {
  it("stays collapsed with no filter - Radix does not mount closed content", () => {
    render(
      <RegionSection
        regionId="usageLimits"
        host="inspector"
        onOpenProvider={null}
      />,
    );
    // `@testing-library/jest-dom` is not wired into this repo's vitest setup,
    // so attribute/presence checks are read by hand rather than via
    // `toHaveAttribute`/`toBeInTheDocument`.
    expect(
      screen
        .getByRole("button", { name: /Fine-tune \(\d+\)/ })
        .getAttribute("data-state"),
    ).toBe("closed");
    expect(screen.queryByText("Percentage")).toBeNull();
  });

  it("auto-expands when the filter matches a fine-tune row but not the region itself", () => {
    // "percentage" matches the fine-tune row's own label ("Percentage") but
    // neither "Usage limits" nor any of its keywords (which only carry the
    // substring "percent", not "percentage") - so this exercises the
    // auto-expand path specifically, not the ordinary "the region matched"
    // path a broader query would also satisfy.
    useLayoutEditorStore.setState({ filter: "percentage" });
    render(
      <RegionSection
        regionId="usageLimits"
        host="inspector"
        onOpenProvider={null}
      />,
    );
    expect(
      screen
        .getByRole("button", { name: /Fine-tune \(\d+\)/ })
        .getAttribute("data-state"),
    ).toBe("open");
    expect(screen.queryByText("Percentage")).not.toBeNull();
  });

  it("stays manually closeable, and the close does not silence the NEXT query (G1-20)", () => {
    useLayoutEditorStore.setState({ filter: "percentage" });
    render(
      <RegionSection
        regionId="usageLimits"
        host="inspector"
        onOpenProvider={null}
      />,
    );
    const trigger = screen.getByRole("button", { name: /Fine-tune \(\d+\)/ });
    expect(trigger.getAttribute("data-state")).toBe("open");

    fireEvent.click(trigger);
    expect(trigger.getAttribute("data-state")).toBe("closed");

    // The regression itself: the manual answer is scoped to the filter it was
    // given under. Without that scoping, closing Fine-tune once silenced
    // L-07's auto-expand for the rest of the session, so typing a word that
    // only matches a fine-tune label looked like no match at all - and a test
    // that stops at the close above passes with the scoping deleted.
    act(() => {
      useLayoutEditorStore.setState({ filter: "time until reset" });
    });

    expect(trigger.getAttribute("data-state")).toBe("open");
    expect(screen.queryByText("Percentage")).not.toBeNull();

    // And the answer given under THIS filter is still the user's to give.
    fireEvent.click(trigger);
    expect(trigger.getAttribute("data-state")).toBe("closed");
  });
});
