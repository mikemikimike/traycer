import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsSearch } from "@/components/settings/settings-search-box";
import { useSettingsSearchStore } from "@/stores/settings/settings-search-store";
import { setSystemTabModalApi } from "@/stores/tabs/system-tab-modal-bridge";

const navigateToSettingsSectionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/settings-navigation", () => ({
  navigateToSettingsSection: navigateToSettingsSectionMock,
}));

function Harness(): ReactNode {
  const [query, setQuery] = useState("");
  return <SettingsSearch query={query} onQueryChange={setQuery} />;
}

function combobox(): HTMLInputElement {
  const input = screen.getByRole("combobox", { name: "Search settings" });
  if (!(input instanceof HTMLInputElement)) throw new Error("not an input");
  return input;
}

function type(query: string): void {
  fireEvent.change(combobox(), { target: { value: query } });
}

beforeEach(() => {
  useSettingsSearchStore.setState({ query: "", pendingReveal: null });
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  setSystemTabModalApi(null);
  vi.clearAllMocks();
  Reflect.deleteProperty(Element.prototype, "scrollIntoView");
});

/**
 * The Customize editor and its special launch branch (enterCustomize, the
 * cross-window lease toast) are gone: a launch result now navigates to the
 * Layout section exactly like any other result, and wears a "Layout" badge
 * instead of "Customize".
 */
describe("<SettingsSearch /> launch results", () => {
  it("marks a launch result with the Layout badge", () => {
    render(<Harness />);
    type("microphone");

    const result = screen.getByTestId(
      "settings-search-result-layout:launch:mic",
    );
    expect(result.textContent).toContain("Microphone");
    expect(result.textContent).toContain("Layout");
  });

  it("selecting one navigates to the layout section, like any other result", () => {
    render(<Harness />);
    type("microphone");

    fireEvent.click(
      screen.getByTestId("settings-search-result-layout:launch:mic"),
    );

    expect(navigateToSettingsSectionMock).toHaveBeenCalledWith("layout");
    expect(useSettingsSearchStore.getState().pendingReveal).toMatchObject({
      section: "layout",
      anchor: null,
    });
  });
});
