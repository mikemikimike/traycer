import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  DEFAULT_LAYOUT_SNAPSHOT,
  useLayoutStore,
} from "@/stores/layout/layout-store";

const viewport = vi.hoisted(() => ({ mobile: false }));
vi.mock("@/hooks/ui/use-mobile-viewport", () => ({
  useIsMobileViewport: () => viewport.mobile,
}));

const navigateToSettingsSectionMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/settings-navigation", () => ({
  navigateToSettingsSection: navigateToSettingsSectionMock,
}));

import {
  STATUS_BAR_MENU_EXEMPT_ATTRIBUTE,
  StatusBarVisibilityMenu,
  type StatusBarMenuProvider,
} from "@/components/layout/status-bar/status-bar-visibility-menu";

function resetStore(): void {
  useLayoutStore.setState({ ...DEFAULT_LAYOUT_SNAPSHOT });
  window.localStorage.clear();
  viewport.mobile = false;
}

const PROVIDERS: ReadonlyArray<StatusBarMenuProvider> = [
  { providerId: "codex", label: "Codex" },
  { providerId: "claude-code", label: "Claude Code" },
];

function renderMenu(providers: ReadonlyArray<StatusBarMenuProvider>) {
  return render(
    <StatusBarVisibilityMenu providers={providers}>
      <div data-testid="status-bar-trigger">status bar</div>
    </StatusBarVisibilityMenu>,
  );
}

function openMenu(): void {
  fireEvent.contextMenu(screen.getByTestId("status-bar-trigger"));
}

beforeEach(resetStore);
afterEach(() => {
  cleanup();
  navigateToSettingsSectionMock.mockClear();
  resetStore();
});

describe("<StatusBarVisibilityMenu />", () => {
  it("reflects store state: every passed provider checked, none hidden by default", () => {
    renderMenu(PROVIDERS);
    openMenu();

    for (const provider of PROVIDERS) {
      expect(
        screen
          .getByRole("menuitemcheckbox", { name: provider.label })
          .getAttribute("aria-checked"),
      ).toBe("true");
    }
    expect(
      screen
        .getByRole("menuitemcheckbox", { name: "Resource monitor" })
        .getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("unchecks a provider already in the hidden deny-list", () => {
    useLayoutStore.getState().setArrangement({
      ...useLayoutStore.getState().arrangement,
      hiddenProviders: ["codex"],
    });
    renderMenu(PROVIDERS);
    openMenu();

    expect(
      screen
        .getByRole("menuitemcheckbox", { name: "Codex" })
        .getAttribute("aria-checked"),
    ).toBe("false");
    expect(
      screen
        .getByRole("menuitemcheckbox", { name: "Claude Code" })
        .getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("unchecks the resource-monitor item when resources are disabled", () => {
    useLayoutStore
      .getState()
      .setRegionValues("resourceMonitor", { shown: "hidden" });
    renderMenu(PROVIDERS);
    openMenu();

    expect(
      screen
        .getByRole("menuitemcheckbox", { name: "Resource monitor" })
        .getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("toggles a provider's membership in the hidden deny-list on click", () => {
    renderMenu(PROVIDERS);
    openMenu();

    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Codex" }));

    expect(useLayoutStore.getState().arrangement.hiddenProviders).toEqual([
      "codex",
    ]);
  });

  it("navigates to the layout settings section from 'Status bar settings…'", () => {
    renderMenu(PROVIDERS);
    openMenu();

    fireEvent.click(
      screen.getByRole("menuitem", { name: "Status bar settings…" }),
    );

    expect(navigateToSettingsSectionMock).toHaveBeenCalledWith("layout");
  });

  it("'Move to header' sets placement to header", () => {
    useLayoutStore.getState().setArrangement({
      ...useLayoutStore.getState().arrangement,
      usageHost: "status-bar",
    });
    renderMenu(PROVIDERS);
    openMenu();

    fireEvent.click(screen.getByRole("menuitem", { name: "Move to header" }));

    expect(useLayoutStore.getState().arrangement.usageHost).toBe("header");
  });

  it("drops 'Move to header' on a narrow viewport, where it would move nothing", () => {
    // Below `md` the shell answers with `mobileFooter` and ignores `placement`
    // altogether, while the mobile header draws its usage controls whatever
    // `placement` says. The item would write a preference the user cannot see
    // the effect of, and leave it waiting for the next desktop window - so it
    // takes the same gate the Layout page puts on the placement row.
    viewport.mobile = true;
    renderMenu(PROVIDERS);
    openMenu();

    expect(
      screen.queryByRole("menuitem", { name: "Move to header" }),
    ).toBeNull();
    // The gate is on that one item, not on the menu.
    expect(
      screen.getByRole("menuitem", { name: "Status bar settings…" }),
    ).not.toBeNull();
  });

  it("does not open the menu for a right-click on an exempt subtree", () => {
    render(
      <StatusBarVisibilityMenu providers={PROVIDERS}>
        <div data-testid="status-bar-trigger">
          <button
            type="button"
            data-testid="exempt-child"
            {...{ [STATUS_BAR_MENU_EXEMPT_ATTRIBUTE]: "" }}
          >
            host switcher
          </button>
        </div>
      </StatusBarVisibilityMenu>,
    );

    fireEvent.contextMenu(screen.getByTestId("exempt-child"));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("still opens the menu for a right-click elsewhere in the trigger", () => {
    render(
      <StatusBarVisibilityMenu providers={PROVIDERS}>
        <div data-testid="status-bar-trigger">
          <button
            type="button"
            data-testid="exempt-child"
            {...{ [STATUS_BAR_MENU_EXEMPT_ATTRIBUTE]: "" }}
          >
            host switcher
          </button>
          <span data-testid="plain-region">plain</span>
        </div>
      </StatusBarVisibilityMenu>,
    );

    fireEvent.contextMenu(screen.getByTestId("plain-region"));
    expect(screen.getByRole("menu")).toBeTruthy();
  });
});
