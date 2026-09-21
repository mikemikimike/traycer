import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LayoutSettingsPanel } from "@/components/settings/panels/layout-settings-panel";
import { setMobileApp } from "@/lib/mobile-app";
import {
  LAYOUT_REGION_LIST,
  regionFacts,
} from "@/components/layout-editor/regions/region-facts";
import { SURFACE_GROUPS } from "@/components/layout-editor/regions/region-grammar";
import { RAIL_REGION_IDS } from "@/lib/layout/rail";
import { DEFAULT_ARRANGEMENT } from "@/lib/layout/layout-arrangement";
import type { RegionId } from "@/lib/layout/region-id";
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

// A provider row's disclosure draws `ProviderLimitsControl`, which reads the
// windows the strip has already read (L-96, L-106) - through the watched host
// scope, a profile selection and the segment model, none of which this page is
// about. Mocked at the same one boundary `provider-limits-choose.test.tsx`
// mocks, so the page is tested for its COMPOSITION and the control is tested
// where it lives.
vi.mock("@/components/layout-editor/inspector/provider-limit-windows", () => ({
  useProviderLimitWindows: () => ({ windows: [], drawnKeys: [] }),
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
function shownValue(regionId: RegionId): string {
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

function renderPanel(): void {
  render(<LayoutSettingsPanel />);
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
    renderPanel();

    for (const group of SURFACE_GROUPS) {
      expect(surface(group.id)).toBeTruthy();
    }
    for (const region of LAYOUT_REGION_LIST) {
      expect(surface(region.surface).textContent).toContain(region.name);
    }
  });

  it("puts the presets block first", () => {
    renderPanel();

    const presets = screen.getByTestId("layout-presets-group");
    const firstSurface = surface(SURFACE_GROUPS[0].id);
    expect(
      presets.compareDocumentPosition(firstSurface) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  describe("de-duplication (L-92, L-95)", () => {
    it("gives the Sidebar ONE list holding all nine panels plus its dividers", () => {
      renderPanel();

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
        within(sidebar).getAllByRole("button", { name: "Add group break" }),
      ).toHaveLength(1);
    });

    /**
     * The Composer card's dock list, after L-142 put Todo and Message queue
     * in it. The claim is the one the ticket is about: five reorderable rows
     * in the stored dock's order, with no row of a different kind mixed in -
     * the page reads the arrangement, so a member that had to be spelled out
     * per region somewhere would show up here as a missing or a stray row.
     */
    it("gives the Composer's dock list all five members, in the stored order", () => {
      renderPanel();

      const composerRows = [
        ...surface("composer").querySelectorAll("[data-sortable-id]"),
      ].map((node) => node.getAttribute("data-sortable-id") ?? "");
      const dockRows = composerRows.filter((id) =>
        DEFAULT_ARRANGEMENT.dock.some((member) => member === id),
      );

      expect(dockRows).toEqual([...DEFAULT_ARRANGEMENT.dock]);
      expect(dockRows).toHaveLength(5);
      for (const id of DEFAULT_ARRANGEMENT.dock) {
        expect(
          screen.queryAllByRole("radiogroup", {
            name: `${regionFacts(id).name} display`,
          }),
          id,
        ).toHaveLength(1);
      }
    });

    it("draws no region's row twice anywhere on the page", () => {
      renderPanel();

      const ids = rowIds();
      for (const region of LAYOUT_REGION_LIST) {
        expect(
          ids.filter((id) => id === region.id),
          region.name,
        ).toHaveLength(1);
      }
    });

    it("gives every region exactly one state control, in one vocabulary", () => {
      renderPanel();

      for (const region of LAYOUT_REGION_LIST) {
        // One wording for all three option sets (L-121): the page used to
        // carry two visibility vocabularies, a `Switch` and a tri-state, and
        // a dock row carried a size control AND a switch for one value.
        expect(
          screen.queryAllByRole("radiogroup", {
            name: `${region.name} display`,
          }),
          region.name,
        ).toHaveLength(1);
        expect(
          screen.queryAllByRole("switch", { name: `Show ${region.name}` }),
          region.name,
        ).toEqual([]);
      }
    });

    it("says each list's instruction once, with its rule joined to it", () => {
      renderPanel();

      expect(
        screen.getAllByText(
          "Drag to reorder, here or on the canvas. Group breaks are items too.",
        ),
      ).toHaveLength(1);
      expect(
        screen.getAllByText("Drag to reorder, here or on the canvas."),
      ).toHaveLength(2);
      // The pinned-right note belongs to the Toolbar-right LIST, so it is part
      // of that list header's one line rather than a footnote under the card
      // (redesign 4.8). It is said once, and only there.
      const pinned = screen.getAllByText(
        "Drag to reorder, here or on the canvas. The model chip stays on the right.",
      );
      expect(pinned).toHaveLength(1);
      expect(surface("composer").contains(pinned[0])).toBe(true);
    });

    it("hoists the usage host onto the Status bar card, off both its regions", () => {
      renderPanel();

      const hosts = screen.getAllByRole("radiogroup", { name: "Position" });

      // One on the whole page, and it belongs to the Status bar card rather
      // than to either of the regions it moves (D7).
      expect(hosts).toHaveLength(1);
      expect(
        within(surface("statusBar")).getByText("Show these in"),
      ).toBeTruthy();
      expect(row("usageLimits").contains(hosts[0])).toBe(false);
      expect(row("resourceMonitor").contains(hosts[0])).toBe(false);
    });
  });

  describe("the rail's tri-state (L-93, D5)", () => {
    it("writes auto, shown and hidden from the row's one control", async () => {
      const user = userEvent.setup();
      renderPanel();
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
      renderPanel();

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

  it("writes the region's own value from its row's state control", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(
      within(row("minimap")).getByRole("radio", { name: "Hidden" }),
    );

    expect(useLayoutStore.getState().overrides.minimap?.shown).toBe("hidden");
  });

  describe("the pictures (L-120, redesign 3.2)", () => {
    it("draws a band on Composer and Status bar, and nowhere else", () => {
      renderPanel();

      for (const group of SURFACE_GROUPS) {
        const bands = within(surface(group.id)).queryAllByTestId(
          "surface-band",
        );
        const expected =
          group.id === "composer" || group.id === "statusBar" ? 1 : 0;
        expect(bands, group.id).toHaveLength(expected);
      }
    });

    it("opens the Sidebar card with its first row, not with a plinth", () => {
      renderPanel();

      const sidebar = surface("sidebar");
      // The word the deleted plinth printed. Its absence is the complaint
      // L-118 was filed about, and it is not a class-name assertion.
      expect(within(sidebar).queryByText("Specimen")).toBeNull();
      // The first thing that can be operated in the card is the first panel's
      // own grab, so the list that changes the rail is the top of the card.
      const focusable = sidebar.querySelector('[role="button"]');
      const firstRow = sidebar.querySelector("[data-sortable-id]");
      expect(firstRow?.contains(focusable ?? null)).toBe(true);
    });

    it("carries the real rail button on each Sidebar row, and only there", () => {
      renderPanel();

      for (const railId of RAIL_REGION_IDS) {
        expect(
          row(railId).querySelectorAll("[data-row-glyph]"),
          railId,
        ).toHaveLength(1);
      }
      // Every other list keeps the registry's icon: their depictions are
      // either too wide to be a glyph or already inside the surface's band.
      expect(
        surface("composer").querySelectorAll("[data-row-glyph]"),
      ).toHaveLength(0);
    });
  });

  describe("usage providers are a Status bar list (L-123)", () => {
    it("draws a row per provider, opening its Limits pick in place", async () => {
      const user = userEvent.setup();
      renderPanel();

      const statusBar = within(surface("statusBar"));
      for (const providerId of DEFAULT_ARRANGEMENT.usageProviders) {
        expect(row(providerId), providerId).toBeTruthy();
      }

      const first = DEFAULT_ARRANGEMENT.usageProviders[0];
      expect(
        statusBar.queryByRole("radiogroup", { name: "Limits" }),
      ).toBeNull();
      await user.click(row(first));

      // Two levels, not five: the provider's own limits are one disclosure
      // below its row, with no second stage and no second header.
      expect(
        within(row(first)).getByRole("radiogroup", { name: "Limits" }),
      ).toBeTruthy();
    });

    it("is absent while Usage limits is hidden", async () => {
      const user = userEvent.setup();
      renderPanel();

      await user.click(
        within(row("usageLimits")).getByRole("radio", { name: "Hidden" }),
      );

      expect(rowIds()).not.toContain(DEFAULT_ARRANGEMENT.usageProviders[0]);
      expect(screen.queryByText("Providers")).toBeNull();
    });
  });

  describe("choosing a preset keeps the per-region changes (L-133)", () => {
    it("changes the base and leaves the picks alone", () => {
      act(() => {
        useLayoutStore.getState().setRegionValues("mic", { shown: "shown" });
        useLayoutStore.getState().setBasePreset("compact");
      });
      renderPanel();

      // `mic` is hidden under Compact, so the pick is a change and says so.
      expect(screen.getByTestId("preset-status-line").textContent).toBe(
        "Compact + 1 change",
      );

      act(() => {
        useLayoutStore.getState().setBasePreset("detailed");
      });

      // Detailed shows the mic anyway, so the pick is no longer a CHANGE -
      // and it is still the user's pick, so switching back restores it. The
      // count is truthful at every step because it is measured by difference.
      const state = useLayoutStore.getState();
      expect(state.overrides.mic?.shown).toBe("shown");
      expect(screen.getByTestId("preset-status-line").textContent).toBe(
        "Detailed",
      );

      act(() => {
        useLayoutStore.getState().setBasePreset("compact");
      });
      expect(shownValue("mic")).toBe("shown");
    });
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
            [DEFAULT_ARRANGEMENT.usageProviders[0]]: { limitKeys: ["5h"] },
          },
          dock: [...DEFAULT_ARRANGEMENT.dock].reverse(),
        });
      });
      renderPanel();

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

    it("is the last card, toned danger, and inoperable on an untouched layout", () => {
      renderPanel();

      const card = screen.getByTestId("layout-reset-group");
      const lastSurface = surface(SURFACE_GROUPS[SURFACE_GROUPS.length - 1].id);
      expect(
        lastSurface.compareDocumentPosition(card) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      // Showing the floor and saying you are standing on it, rather than a
      // card that vanishes (5.8).
      expect(
        within(card)
          .getByRole("button", { name: "Reset everything" })
          .hasAttribute("disabled"),
      ).toBe(true);
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("marks a moved region's row and gives it a revert", async () => {
      const user = userEvent.setup();
      act(() => {
        useLayoutStore.getState().setArrangement({
          ...DEFAULT_ARRANGEMENT,
          minimapSide: "left",
        });
      });
      renderPanel();

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
    renderPanel();
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
    // The scroll is for the eye; the focus is for the hands (5.9).
    expect(row("contextUsage").querySelector('[role="button"]')).toBe(
      document.activeElement,
    );
  });

  it("clears an active filter so the landing has a row to land on", async () => {
    setSystemTabModalApi({
      active: null,
      openSettings: vi.fn(),
      openHistory: vi.fn(),
      close: vi.fn(),
      setSection: vi.fn(),
      promoteToTab: vi.fn(),
      isOverlayActive: () => true,
    });
    renderPanel();
    act(() => {
      // A word from a previous visit that hides the Chat card whole (L-103),
      // which is what used to drop the request silently.
      useLayoutEditorStore.getState().setFilter("terminals");
    });
    expect(rowIds()).not.toContain("minimap");

    await act(async () => {
      navigateToLayoutRegion("minimap");
      await Promise.resolve();
    });

    expect(useLayoutEditorStore.getState().filter).toBe("");
    expect(row("minimap").querySelector('[role="button"]')).toBe(
      document.activeElement,
    );
  });

  it("moves focus from the filter to the first row on ArrowDown", async () => {
    const user = userEvent.setup();
    renderPanel();

    const field = screen.getByRole("textbox", {
      name: "Filter these settings",
    });
    await user.click(field);
    await user.keyboard("{ArrowDown}");

    const firstRow = document.querySelector("[data-sortable-id]");
    expect(firstRow?.querySelector('[role="button"]')).toBe(
      document.activeElement,
    );
    // `keyboardNav` is a fact about an editor SESSION, and this host has none
    // (R2-04). The page must never write it.
    expect(useLayoutEditorStore.getState().keyboardNav).toBe(false);
  });

  describe("the small-screen status bar row (L-51)", () => {
    it("is absent outside the installed mobile app", () => {
      renderPanel();

      expect(
        screen.queryByRole("switch", {
          name: "Show the status bar on small screens",
        }),
      ).toBeNull();
    });

    it("writes the arrangement in the mobile app", async () => {
      setMobileApp(true);
      const user = userEvent.setup();
      renderPanel();

      await user.click(
        screen.getByRole("switch", {
          name: "Show the status bar on small screens",
        }),
      );

      expect(useLayoutStore.getState().arrangement.mobileFooter).toBe(true);
    });
  });
});
