import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useSettingsStore } from "@/stores/settings/settings-store";
import { TaskTabLayoutRow } from "@/components/settings/panels/layout/tabs-layout-group";

beforeEach(() => {
  useSettingsStore.setState({ taskTabLayout: "scroll" });
});

afterEach(() => {
  cleanup();
  useSettingsStore.setState({ taskTabLayout: "scroll" });
});

describe("<TaskTabLayoutRow />", () => {
  it("carries the anchor settings search scrolls to, with the row's own copy", () => {
    const { container } = render(<TaskTabLayoutRow />);
    const row = container.querySelector(
      "[data-settings-anchor='layout-task-tab-layout']",
    );
    expect(row).not.toBeNull();
    expect(row?.textContent).toContain("Task tab layout");
  });

  it("presses Scroll by default", () => {
    render(<TaskTabLayoutRow />);
    const group = screen.getByRole("group", { name: "Task tab layout" });
    expect(
      screen
        .getByRole("button", { name: "Scroll" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen
        .getByRole("button", { name: "Shrink to fit" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    expect(group).toBeTruthy();
  });

  it("writes Shrink to fit into the store and moves the pressed state", () => {
    render(<TaskTabLayoutRow />);
    fireEvent.click(screen.getByRole("button", { name: "Shrink to fit" }));
    expect(useSettingsStore.getState().taskTabLayout).toBe("shrink");
    expect(
      screen
        .getByRole("button", { name: "Shrink to fit" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("reflects a store value set elsewhere and can switch back", () => {
    useSettingsStore.setState({ taskTabLayout: "shrink" });
    render(<TaskTabLayoutRow />);
    fireEvent.click(screen.getByRole("button", { name: "Scroll" }));
    expect(useSettingsStore.getState().taskTabLayout).toBe("scroll");
  });
});
