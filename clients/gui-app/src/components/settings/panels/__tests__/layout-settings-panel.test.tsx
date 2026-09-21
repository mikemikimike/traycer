import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LayoutSettingsPanel } from "@/components/settings/panels/layout-settings-panel";
import { setMobileApp } from "@/lib/mobile-app";
import { LAYOUT_REGION_LIST } from "@/components/layout-editor/regions/region-facts";
import { SURFACE_GROUPS } from "@/components/layout-editor/regions/region-grammar";
import { RAIL_REGION_IDS } from "@/lib/layout/rail";
import { DEFAULT_ARRANGEMENT } from "@/lib/layout/layout-arrangement";
import { navigateToLayoutRegion } from "@/lib/settings-navigation";
import { setSystemTabModalApi } from "@/stores/tabs/system-tab-modal-bridge";
import { effectiveLayoutValues } from "@/lib/layout/layout-presets";
import {
  DEFAULT_LAYOUT_SNAPSHOT,
  useLayoutStore,
} from "@/stores/layout/layout-store";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";

// The provider list is read through the watched host's scope; this page needs
// it mounted, never connected.
vi.mock("@/lib/host", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/host")>()),
  useHostClient: () => null,
}));

// The width gate reads the window, and the door is not what this suite is
// about: every case below wants the page's own rows, not a session.
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useNavigate: () => vi.fn(),
}));

function resetLayout(): void {
  useLayoutStore.setState({ ...DEFAULT_LAYOUT_SNAPSHOT });
  useLayoutEditorStore.getState().setFilter("");
}

beforeEach(() => {
  setMobileApp(false);
  resetLayout();
});
afterEach(() => {
  cleanup();
  setMobileApp(false);
  resetLayout();
  setSystemTabModalApi(null);
});

/** One region's effective value, which is what a row draws and writes. */
function shownValue(regionId: "railAgents" | "railPullRequests"): string {
  const snapshot = useLayoutStore.getState();
  return effectiveLayoutValues(snapshot.basePreset, snapshot.overrides)[
    regionId
  ].shown;
}

/** Every row of every list on the page, by the id it carries. */
function rowIds(): ReadonlyArray<string> {
  return [...document.querySelectorAll("[data-sortable-id]")].map(
    (node) => node.getAttribute("data-sortable-id") ?? "",
  );
}

function row(id: string): HTMLElement {
  const nodes = document.querySelectorAll(`[data-sortable-id="${id}"]`);
  const node = nodes[0];
  if (!(node instanceof HTMLElement)) throw new Error(`no such row: ${id}`);
  return node;
}

function surface(id: string): HTMLElement {
  return screen.getByTestId(`layout-surface-${id}`);
}

/**
 * The full-width host of the one layout form (L-03), after L-92.
 *
 * What is pinned here is the SHAPE the owner asked for: one section per
 * surface, the region as a row, and each shared group control drawn exactly
 * once. The rows' own behaviour is covered where the components live
 * (`components/layout-editor/inspector`); what this page owns is which of them
 * appear and how many times.
 */
describe("Settings - Layout", () => {
  it("renders one card per surface, with every region as a row inside its own", () => {
    render(<LayoutSettingsPanel />);

    for (const group of SURFACE_GROUPS) {
      expect(surface(group.id)).toBeTruthy();
    }
    for (const region of LAYOUT_REGION_LIST) {
      expect(surface(region.surface).textContent).toContain(region.name);
    }
  });

  it("puts the presets block first", () => {
    render(<LayoutSettingsPanel />);

    const presets = screen.getByTestId("layout-presets-group");
    const firstSurface = surface(SURFACE_GROUPS[0].id);
    expect(
      presets.compareDocumentPosition(firstSurface) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  describe("de-duplication (L-92, L-95)", () => {
    it("gives the Sidebar ONE list holding all nine panels plus its dividers", () => {
      render(<LayoutSettingsPanel />);

      const sidebar = surface("sidebar");
      const panelRows = [...sidebar.querySelectorAll("[data-sortable-id]")].map(
        (node) => node.getAttribute("data-sortable-id") ?? "",
      );

      for (const railId of RAIL_REGION_IDS) {
        expect(
          panelRows.filter((id) => id === railId),
          railId,
        ).toHaveLength(1);
      }
      // Dividers are items of the same list (L-25), so the row count is the
      // whole rail - one list, not nine copies of it.
      expect(panelRows).toHaveLength(DEFAULT_ARRANGEMENT.rail.length);
      expect(
        within(sidebar).getAllByRole("button", { name: "Add divider" }),
      ).toHaveLength(1);
    });

    it("draws no region's row twice anywhere on the page", () => {
      render(<LayoutSettingsPanel />);

      const ids = rowIds();
      for (const region of LAYOUT_REGION_LIST) {
        expect(
          ids.filter((id) => id === region.id),
          region.name,
        ).toHaveLength(1);
      }
    });

    it("gives every region exactly one Shown control", () => {
      render(<LayoutSettingsPanel />);

      for (const region of LAYOUT_REGION_LIST) {
        const controls = [
          ...screen.queryAllByRole("switch", { name: `Show ${region.name}` }),
          ...screen.queryAllByRole("radiogroup", {
            name: `${region.name} visibility`,
          }),
        ];
        expect(controls, region.name).toHaveLength(1);
      }
    });

    it("says the reorder instruction and the pinned-right note once each", () => {
      render(<LayoutSettingsPanel />);

      expect(
        screen.getAllByText("Drag to reorder. Dividers are items too."),
      ).toHaveLength(1);
      expect(
        screen.getAllByText("Drag to reorder, here or on the canvas."),
      ).toHaveLength(3);
      expect(
        screen.getAllByText("The model chip stays on the right."),
      ).toHaveLength(1);
    });

    it("hoists the usage host onto the Status bar card, off both its regions", () => {
      render(<LayoutSettingsPanel />);

      const hosts = screen.getAllByRole("radiogroup", { name: "Position" });

      // One on the whole page, and it belongs to the Status bar card rather
      // than to either of the regions it moves (D7).
      expect(hosts).toHaveLength(1);
      expect(
        within(surface("statusBar")).getByText("Where these live"),
      ).toBeTruthy();
      expect(row("usageLimits").contains(hosts[0])).toBe(false);
      expect(row("resourceMonitor").contains(hosts[0])).toBe(false);
    });
  });

  describe("the rail's tri-state (L-93, D5)", () => {
    it("writes auto, shown and hidden from the row's one control", async () => {
      const user = userEvent.setup();
      render(<LayoutSettingsPanel />);
      const agents = within(row("railAgents"));

      await user.click(agents.getByRole("radio", { name: "Shown" }));
      expect(shownValue("railAgents")).toBe("shown");

      await user.click(agents.getByRole("radio", { name: "Hidden" }));
      expect(shownValue("railAgents")).toBe("hidden");

      // Back to `auto` reads as no override at all, because `auto` IS the
      // shipped value - so the effective value is what this asserts on.
      await user.click(agents.getByRole("radio", { name: "Auto" }));
      expect(shownValue("railAgents")).toBe("auto");
    });

    it("keeps a pinned Shown pinned through any other interaction on the page", async () => {
      const user = userEvent.setup();
      render(<LayoutSettingsPanel />);

      await user.click(
        within(row("railPullRequests")).getByRole("radio", { name: "Shown" }),
      );
      expect(shownValue("railPullRequests")).toBe("shown");

      // The eye button on every rail list row is what used to undo this: it
      // wrote through `regionShownOnValue`, so two presses anywhere on the
      // page turned the pin back into `auto` without saying so (D5). There is
      // one control per region now, and nothing else on the page can reach
      // this value.
      expect(
        screen.queryAllByRole("button", { name: /^(Hide|Show) Pull/ }),
      ).toEqual([]);

      await user.click(
        within(row("railAgents")).getByRole("radio", { name: "Hidden" }),
      );
      await user.click(row("railPullRequests"));

      expect(shownValue("railPullRequests")).toBe("shown");
    });
  });

  it("writes the region's own value from its row's switch", async () => {
    const user = userEvent.setup();
    render(<LayoutSettingsPanel />);

    await user.click(screen.getByRole("switch", { name: "Show Minimap" }));

    expect(useLayoutStore.getState().overrides.minimap?.shown).toBe("hidden");
  });

  describe("the safety net (L-20, P-6)", () => {
    it("restores every value and every arrangement field", async () => {
      const user = userEvent.setup();
      act(() => {
        useLayoutStore.getState().setBasePreset("compact");
        useLayoutStore.getState().setRegionValues("minimap", {
          shown: "hidden",
        });
        useLayoutStore.getState().setArrangement({
          ...DEFAULT_ARRANGEMENT,
          usageHost: "header",
          minimapSide: "left",
          mobileFooter: true,
          hiddenProviders: [DEFAULT_ARRANGEMENT.usageProviders[0]],
          providerLimits: {
            [DEFAULT_ARRANGEMENT.usageProviders[0]]: {
              automatic: false,
              limitKeys: ["5h"],
            },
          },
          dock: [...DEFAULT_ARRANGEMENT.dock].reverse(),
        });
      });
      render(<LayoutSettingsPanel />);

      await user.click(
        screen.getByRole("button", { name: "Reset everything" }),
      );
      await user.click(screen.getByTestId("confirm-action"));

      const state = useLayoutStore.getState();
      expect(state.basePreset).toBe("default");
      expect(state.overrides).toEqual({});
      expect(state.arrangement.usageHost).toBe(DEFAULT_ARRANGEMENT.usageHost);
      expect(state.arrangement.minimapSide).toBe(
        DEFAULT_ARRANGEMENT.minimapSide,
      );
      expect(state.arrangement.mobileFooter).toBe(false);
      expect(state.arrangement.hiddenProviders).toEqual([]);
      expect(state.arrangement.providerLimits).toEqual({});
      expect(state.arrangement.dock).toEqual(DEFAULT_ARRANGEMENT.dock);
    });

    it("is not offered on a layout nothing has touched", () => {
      render(<LayoutSettingsPanel />);

      expect(
        screen.queryByRole("button", { name: "Reset everything" }),
      ).toBeNull();
    });

    it("marks a moved region's row and gives it a revert", async () => {
      const user = userEvent.setup();
      act(() => {
        useLayoutStore.getState().setArrangement({
          ...DEFAULT_ARRANGEMENT,
          minimapSide: "left",
        });
      });
      render(<LayoutSettingsPanel />);

      expect(within(row("minimap")).getByTestId("changed-dot")).toBeTruthy();

      await user.click(
        within(row("minimap")).getByRole("button", { name: "Revert Minimap" }),
      );

      expect(useLayoutStore.getState().arrangement.minimapSide).toBe(
        DEFAULT_ARRANGEMENT.minimapSide,
      );
    });
  });

  it("lands a deep link on its region's row with the disclosure open", async () => {
    // The door's width-gate redirect goes through the modal bridge, so a
    // landing needs a published Settings surface to be redirected to.
    setSystemTabModalApi({
      active: null,
      openSettings: vi.fn(),
      openHistory: vi.fn(),
      close: vi.fn(),
      setSection: vi.fn(),
      promoteToTab: vi.fn(),
      isOverlayActive: () => true,
    });
    render(<LayoutSettingsPanel />);
    expect(
      within(row("contextUsage")).queryByRole("radiogroup", {
        name: "Style",
      }),
    ).toBeNull();

    await act(async () => {
      navigateToLayoutRegion("contextUsage");
      await Promise.resolve();
    });

    expect(
      within(row("contextUsage")).getByRole("radiogroup", { name: "Style" }),
    ).toBeTruthy();
  });

  describe("the small-screen status bar row (L-51)", () => {
    it("is absent outside the installed mobile app", () => {
      render(<LayoutSettingsPanel />);

      expect(
        screen.queryByRole("switch", {
          name: "Show the status bar on small screens",
        }),
      ).toBeNull();
    });

    it("writes the arrangement in the mobile app", async () => {
      setMobileApp(true);
      const user = userEvent.setup();
      render(<LayoutSettingsPanel />);

      await user.click(
        screen.getByRole("switch", {
          name: "Show the status bar on small screens",
        }),
      );

      expect(useLayoutStore.getState().arrangement.mobileFooter).toBe(true);
    });
  });
});
