import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RegionSection } from "@/components/layout-editor/inspector/region-section";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import { DEFAULT_LAYOUT_SNAPSHOT, useLayoutStore } from "@/stores/layout/layout-store";

beforeEach(() => {
  window.localStorage.clear();
  useLayoutStore.setState({ ...DEFAULT_LAYOUT_SNAPSHOT, layoutCarryDone: true });
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
      <RegionSection regionId="usageLimits" host="inspector" onOpenProvider={null} />,
    );
    // `@testing-library/jest-dom` is not wired into this repo's vitest setup,
    // so attribute/presence checks are read by hand rather than via
    // `toHaveAttribute`/`toBeInTheDocument`.
    expect(
      screen.getByRole("button", { name: /Fine-tune \(\d+\)/ }).getAttribute("data-state"),
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
      <RegionSection regionId="usageLimits" host="inspector" onOpenProvider={null} />,
    );
    expect(
      screen.getByRole("button", { name: /Fine-tune \(\d+\)/ }).getAttribute("data-state"),
    ).toBe("open");
    expect(screen.queryByText("Percentage")).not.toBeNull();
  });

  it("stays manually closeable after an auto-expand", () => {
    useLayoutEditorStore.setState({ filter: "percentage" });
    render(
      <RegionSection regionId="usageLimits" host="inspector" onOpenProvider={null} />,
    );
    const trigger = screen.getByRole("button", { name: /Fine-tune \(\d+\)/ });
    expect(trigger.getAttribute("data-state")).toBe("open");

    fireEvent.click(trigger);
    expect(trigger.getAttribute("data-state")).toBe("closed");
  });
});
