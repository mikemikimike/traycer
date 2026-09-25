import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LayoutSettingsPanel } from "@/components/settings/panels/layout-settings-panel";
import { setMobileApp } from "@/lib/mobile-app";
import {
  LAYOUT_REGION_LIST,
  regionFacts,
} from "@/components/layout-editor/regions/region-facts";
import { SURFACE_GROUPS } from "@/components/layout-editor/regions/region-grammar";
import { RAIL_REGION_IDS } from "@/lib/layout/rail";
import {
  DEFAULT_ARRANGEMENT,
  USAGE_PROVIDER_IDS,
} from "@/lib/layout/layout-arrangement";
import type { HideableRegionId } from "@/lib/layout/layout-values";
import { navigateToLayoutRegion } from "@/lib/settings-navigation";
import { setSystemTabModalApi } from "@/stores/tabs/system-tab-modal-bridge";
import { effectiveLayoutValues } from "@/lib/layout/layout-presets";
import {
  DEFAULT_LAYOUT_SNAPSHOT,
  useLayoutStore,
} from "@/stores/layout/layout-store";
import { LAYOUT } from "@/components/settings/panels/layout-settings.definitions";
import { useSettingsSearchStore } from "@/stores/settings/settings-search-store";
import { useSettingsStore } from "@/stores/settings/settings-store";
import { searchSettings } from "@/lib/settings-search/settings-search";

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
vi.mock(
  "@/components/layout-editor/inspector/provider-limit-windows",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/components/layout-editor/inspector/provider-limit-windows")
    >()),
    ProviderLimitWindowsReader: (props: {
      readonly children: (limits: {
        windows: ReadonlyArray<never>;
        drawnKeys: ReadonlyArray<never>;
      }) => ReactNode;
    }) => props.children({ windows: [], drawnKeys: [] }),
    // The page wraps itself in this directly (the shared watched-usage read),
    // which resolves a host scope through a runner-host provider this suite
    // has none of. A pass-through here, and the fixed catalog below, keep the
    // "usage providers are a Status bar list" cases drawing real rows without
    // standing up that scope for real.
    LayoutUsageProvider: (props: { readonly children: ReactNode }) =>
      props.children,
  }),
);

vi.mock(
  "@/components/layout-editor/inspector/use-layout-usage",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/components/layout-editor/inspector/use-layout-usage")
    >()),
    useLayoutUsage: () => ({
      providerIds: USAGE_PROVIDER_IDS,
      cluster: { kind: "no-providers" as const },
      hostName: "the watched host",
    }),
  }),
);

// The width gate reads the window, and the door is not what this suite is
// about: every case below wants the page's own rows, not a session.
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useNavigate: () => vi.fn(),
}));

function resetLayout(): void {
  useLayoutStore.setState({ ...DEFAULT_LAYOUT_SNAPSHOT });
}

beforeEach(() => {
  setMobileApp(false);
  resetLayout();
});
afterEach(() => {
  cleanup();
  setMobileApp(false);
  resetLayout();
  useSettingsStore.getState().setTaskTabLayout("scroll");
  setSystemTabModalApi(null);
  useSettingsSearchStore.setState({
    query: "",
    pendingReveal: null,
    handoffPending: false,
  });
});

/** One region's effective value, which is what a row draws and writes. */
function shownValue(regionId: HideableRegionId): string {
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
 * Whether a `forceMount`ed tab's own `TabsContent` carries `hidden` - every
 * tab stays mounted now (L-166's Presence-timing fix), so absence from the
 * DOM no longer means inactive; the `hidden` attribute Radix toggles on the
 * inactive `role="tabpanel"` does.
 */
function tabPanelHiddenFor(testId: string): boolean {
  const panel = screen.getByTestId(testId).closest('[role="tabpanel"]');
  if (!(panel instanceof HTMLElement)) {
    throw new Error(`no tabpanel ancestor for ${testId}`);
  }
  return panel.hasAttribute("hidden");
}

/** The one `role="tabpanel"` Radix has NOT marked `hidden` right now. */
function activeTabPanel(): HTMLElement {
  const panel = document.querySelector('[role="tabpanel"]:not([hidden])');
  if (!(panel instanceof HTMLElement)) throw new Error("no active tabpanel");
  return panel;
}

function renderPanel(): void {
  render(<LayoutSettingsPanel />);
}

/**
 * Switches the page to one surface's own tab, the way a click on its
 * `TabsTrigger` would. Every tab stays mounted (`forceMount`), so this is
 * about which one is VISIBLE, not which one exists - `surface()` finds a
 * hidden tab's rows too, so a test that means "the active tab's rows" reads
 * this first.
 */
async function goToSurfaceTab(user: UserEvent, id: string): Promise<void> {
  const label = SURFACE_GROUPS.find((group) => group.id === id)?.label ?? id;
  // Anchored prefix, not exact: a changed area's tab carries a sr-only ",
  // changed" suffix in its accessible name (H2).
  await user.click(screen.getByRole("tab", { name: new RegExp(`^${label}`) }));
}

/**
 * The full-width host of the one layout form (L-03), after G6.
 *
 * What is pinned here is the SHAPE the owner asked for: one tab per surface,
 * the region as a row inside it, and each shared group control drawn exactly
 * once. The rows' own behaviour is covered where the components live
 * (`components/layout-editor/inspector`); what this page owns is which of
 * them appear, on which tab, and how many times.
 */
describe("Settings - Layout", () => {
  it("shows every region as a row inside its own surface's tab", async () => {
    const user = userEvent.setup();
    renderPanel();

    for (const group of SURFACE_GROUPS) {
      await goToSurfaceTab(user, group.id);
      expect(surface(group.id)).toBeTruthy();
      for (const region of LAYOUT_REGION_LIST.filter(
        (entry) => entry.surface === group.id,
      )) {
        expect(surface(group.id).textContent).toContain(region.name);
      }
    }
  });

  it("puts the Presets tab first, then every surface in reading order", () => {
    renderPanel();

    const labels = screen.getAllByRole("tab").map((tab) => tab.textContent);
    expect(labels[0]).toBe(LAYOUT.definitions.presets.label);
    expect(labels.slice(1)).toEqual(SURFACE_GROUPS.map((group) => group.label));
  });

  describe("de-duplication (L-92, L-95)", () => {
    it("gives the Sidebar ONE list holding all nine panels plus its dividers", async () => {
      const user = userEvent.setup();
      renderPanel();
      await goToSurfaceTab(user, "sidebar");

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

    /**
     * The Composer card's dock list. The claim is the one the ticket is
     * about: every member in `DEFAULT_ARRANGEMENT.dock`, reorderable, in the
     * stored order, with no row of a different kind mixed in - the page reads
     * the arrangement, so a member that had to be spelled out per region
     * somewhere would show up here as a missing or a stray row.
     */
    it("gives the Composer's dock list every stored member, in the stored order", async () => {
      const user = userEvent.setup();
      renderPanel();
      await goToSurfaceTab(user, "composer");

      const composerRows = [
        ...surface("composer").querySelectorAll("[data-sortable-id]"),
      ].map((node) => node.getAttribute("data-sortable-id") ?? "");
      const dockRows = composerRows.filter((id) =>
        DEFAULT_ARRANGEMENT.dock.some((member) => member === id),
      );

      expect(dockRows).toEqual([...DEFAULT_ARRANGEMENT.dock]);
      expect(dockRows).toHaveLength(DEFAULT_ARRANGEMENT.dock.length);
      for (const id of DEFAULT_ARRANGEMENT.dock) {
        expect(
          screen.queryAllByRole("radiogroup", {
            name: `${regionFacts(id).name} display`,
          }),
          id,
        ).toHaveLength(1);
      }
    });

    it("draws no region's row twice within its own surface's tab", async () => {
      const user = userEvent.setup();
      renderPanel();

      for (const group of SURFACE_GROUPS) {
        await goToSurfaceTab(user, group.id);
        const ids = rowIds();
        for (const region of LAYOUT_REGION_LIST.filter(
          (entry) => entry.surface === group.id,
        )) {
          expect(
            ids.filter((id) => id === region.id),
            region.name,
          ).toHaveLength(1);
        }
      }
    });

    it("gives every region with a state control exactly one, in one vocabulary", async () => {
      const user = userEvent.setup();
      renderPanel();

      for (const group of SURFACE_GROUPS) {
        await goToSurfaceTab(user, group.id);
        for (const region of LAYOUT_REGION_LIST.filter(
          (entry) => entry.surface === group.id,
          // Model has no Hide at all (G6): the picker always draws, so it has
          // no state control to be duplicated. Covered on its own below.
        ).filter((entry) => entry.id !== "model")) {
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
      }
    });

    it("draws no display control for Model, whose picker always shows (G6)", async () => {
      const user = userEvent.setup();
      renderPanel();
      await goToSurfaceTab(user, "composer");

      expect(
        screen.queryByRole("radiogroup", { name: "Model display" }),
      ).toBeNull();
    });

    it("says each list's instruction once, with its rule joined to it", async () => {
      const user = userEvent.setup();
      renderPanel();

      let long = 0;
      let short = 0;
      let pinnedCount = 0;
      let pinnedInComposer = false;

      for (const group of SURFACE_GROUPS) {
        await goToSurfaceTab(user, group.id);
        // Scoped to the ACTIVE tabpanel: every tab stays mounted now
        // (`forceMount`), so an unscoped query would also match the same
        // text sitting inert in a tab visited on an earlier pass.
        const panel = within(activeTabPanel());
        long += panel.queryAllByText(
          "Drag to reorder, here or on the canvas. Drop one icon onto the middle of another to stack them in one panel. Add a divider to space icons apart.",
        ).length;
        short += panel.queryAllByText(
          "Drag to reorder, here or on the canvas.",
        ).length;
        // The pinned-right note belongs to the Toolbar-right LIST, so it is
        // part of that list header's one line rather than a footnote under
        // the card (redesign 4.8).
        const pinnedHere = panel.queryAllByText(
          "Drag to reorder, here or on the canvas. The model chip stays on the right.",
        );
        pinnedCount += pinnedHere.length;
        if (pinnedHere.length > 0) {
          pinnedInComposer = surface(group.id).contains(pinnedHere[0]);
        }
      }

      expect(long).toBe(1);
      expect(short).toBe(2);
      expect(pinnedCount).toBe(1);
      expect(pinnedInComposer).toBe(true);
    });

    it("gives each strip reading its own bar and side, and shares neither (L-156)", async () => {
      const user = userEvent.setup();
      renderPanel();
      await goToSurfaceTab(user, "statusBar");

      // The row that moved both at once is gone: where a reading lives is the
      // region's own pick now, behind its own disclosure.
      expect(within(surface("statusBar")).queryByText("Show these in")).toBe(
        null,
      );

      const names = {
        usageLimits: "Usage limits",
        resourceMonitor: "Resource monitor",
      } as const;
      for (const regionId of ["usageLimits", "resourceMonitor"] as const) {
        await user.click(row(regionId));
        const name = names[regionId];
        expect(
          within(row(regionId)).getAllByRole("radiogroup", {
            name: `${name} position`,
          }),
        ).toHaveLength(1);
        expect(
          within(row(regionId)).getAllByRole("radiogroup", {
            name: `${name} side`,
          }),
        ).toHaveLength(1);
      }
    });
  });

  describe("the rail's tri-state (L-93, D5)", () => {
    it("writes auto, shown and hidden from the row's one control", async () => {
      const user = userEvent.setup();
      renderPanel();
      await goToSurfaceTab(user, "sidebar");
      // `railComments` still carries a presence hint ("Auto - appears when an
      // artifact is open"), which is what earns it the three-way control
      // (G6): most rail panels have no rule of their own any more and only
      // offer Shown/Hidden, whose "on" writes `auto` (see the other test in
      // this block, which exercises exactly that two-option row).
      const comments = within(row("railComments"));

      await user.click(comments.getByRole("radio", { name: "Shown" }));
      expect(shownValue("railComments")).toBe("shown");

      await user.click(comments.getByRole("radio", { name: "Hidden" }));
      expect(shownValue("railComments")).toBe("hidden");

      // Back to `auto` reads as no override at all, because `auto` IS the
      // shipped value - so the effective value is what this asserts on.
      await user.click(comments.getByRole("radio", { name: "Auto" }));
      expect(shownValue("railComments")).toBe("auto");
    });

    it("keeps a pinned Shown pinned through any other interaction on the page", async () => {
      const user = userEvent.setup();
      renderPanel();
      await goToSurfaceTab(user, "sidebar");

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
    await goToSurfaceTab(user, "chat");

    await user.click(
      within(row("minimap")).getByRole("radio", { name: "Hidden" }),
    );

    expect(useLayoutStore.getState().overrides.minimap?.shown).toBe("hidden");
  });

  describe("the pictures (L-120, redesign 3.2)", () => {
    it("draws a band on Composer and Status bar, and nowhere else", async () => {
      const user = userEvent.setup();
      renderPanel();

      for (const group of SURFACE_GROUPS) {
        await goToSurfaceTab(user, group.id);
        const bands = within(surface(group.id)).queryAllByTestId(
          "surface-band",
        );
        const expected =
          group.id === "composer" || group.id === "statusBar" ? 1 : 0;
        expect(bands, group.id).toHaveLength(expected);
      }
    });

    it("opens the Sidebar card with its first row, not with a plinth", async () => {
      const user = userEvent.setup();
      renderPanel();
      await goToSurfaceTab(user, "sidebar");

      const sidebar = surface("sidebar");
      // The word the deleted plinth printed. Its absence is the complaint
      // L-118 was filed about, and it is not a class-name assertion.
      expect(within(sidebar).queryByText("Specimen")).toBeNull();
      // Below the surface's own Side row, the first button in the card is the
      // first panel's own grab, so the list that changes the rail comes next.
      const focusable = sidebar.querySelector('[role="button"]');
      const firstRow = sidebar.querySelector("[data-sortable-id]");
      expect(firstRow?.contains(focusable ?? null)).toBe(true);
    });

    it("carries the real rail button on each Sidebar row, and only there", async () => {
      const user = userEvent.setup();
      renderPanel();
      await goToSurfaceTab(user, "sidebar");

      for (const railId of RAIL_REGION_IDS) {
        expect(
          row(railId).querySelectorAll("[data-row-glyph]"),
          railId,
        ).toHaveLength(1);
      }

      // Every other list keeps the registry's icon: their depictions are
      // either too wide to be a glyph or already inside the surface's band.
      await goToSurfaceTab(user, "composer");
      expect(
        surface("composer").querySelectorAll("[data-row-glyph]"),
      ).toHaveLength(0);
    });
  });

  describe("usage providers are a Status bar list (L-123)", () => {
    it("draws a row per provider, opening its Limits pick in place", async () => {
      const user = userEvent.setup();
      renderPanel();
      await goToSurfaceTab(user, "statusBar");

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
      await goToSurfaceTab(user, "statusBar");

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
      // The Presets tab is the page's default, so it needs no switch.
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
      // The reset button lives on the Presets tab, the page's default, so no
      // tab switch is needed to reach it.
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

    it("sits after the presets block on its own tab, toned danger, and inoperable on an untouched layout", () => {
      renderPanel();

      // Reset Everything merged into the Presets tab (G6): the floor is no
      // longer the last card on a single scrolling page, it is the last thing
      // in the tab that opens by default.
      const presets = screen.getByTestId("layout-presets-group");
      const card = screen.getByTestId("layout-reset-group");
      expect(
        presets.compareDocumentPosition(card) &
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
      await goToSurfaceTab(user, "chat");

      expect(within(row("minimap")).getByTestId("changed-dot")).toBeTruthy();

      await user.click(
        within(row("minimap")).getByRole("button", { name: "Revert Minimap" }),
      );

      expect(useLayoutStore.getState().arrangement.minimapSide).toBe(
        DEFAULT_ARRANGEMENT.minimapSide,
      );
    });
  });

  it("lands a deep link on its region's row, switching to its tab and opening the disclosure", async () => {
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
    // The page opens on Presets, and `contextUsage` lives on Chat - the
    // landing has to switch tabs itself (G6), not just open a disclosure.
    expect(
      screen
        .getByRole("tab", { name: "Presets" })
        .getAttribute("aria-selected"),
    ).toBe("true");

    await act(async () => {
      navigateToLayoutRegion("contextUsage");
      await Promise.resolve();
    });

    expect(
      screen.getByRole("tab", { name: "Chat" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      within(row("contextUsage")).getByRole("radiogroup", { name: "Style" }),
    ).toBeTruthy();
    // The scroll is for the eye; the focus is for the hands (5.9).
    expect(row("contextUsage").querySelector('[role="button"]')).toBe(
      document.activeElement,
    );
  });

  describe("the small-screen status bar row (L-51)", () => {
    it("is absent outside the installed mobile app", async () => {
      const user = userEvent.setup();
      renderPanel();
      await goToSurfaceTab(user, "statusBar");

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
      await goToSurfaceTab(user, "statusBar");

      await user.click(
        screen.getByRole("switch", {
          name: "Show the status bar on small screens",
        }),
      );

      expect(useLayoutStore.getState().arrangement.mobileFooter).toBe(true);
    });
  });

  describe("the surface placement rows", () => {
    it("labels the Tabs tab, and opens it with Position then Task tab layout", async () => {
      const user = userEvent.setup();
      renderPanel();
      await goToSurfaceTab(user, "topBar");

      const tabs = surface("topBar");
      const position = tabs.querySelector(
        "[data-settings-anchor='layout-tab-strip-placement']",
      );
      const taskTabLayout = tabs.querySelector(
        "[data-settings-anchor='layout-task-tab-layout']",
      );
      if (position === null || taskTabLayout === null) {
        throw new Error("missing a Tabs surface row");
      }
      expect(position.textContent).toContain("Position");
      expect(
        position.compareDocumentPosition(taskTabLayout) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        within(tabs).getByRole("radiogroup", { name: "Tabs position" }),
      ).toBeTruthy();
    });

    it("disables Task tab layout with its reason while the tabs are vertical, keeping its value", async () => {
      const user = userEvent.setup();
      renderPanel();
      await goToSurfaceTab(user, "topBar");
      const taskTabLayout = within(surface("topBar")).getByRole("group", {
        name: "Task tab layout",
      });
      const disabledStates = (): ReadonlyArray<boolean> =>
        within(taskTabLayout)
          .getAllByRole<HTMLButtonElement>("button")
          .map((button) => button.disabled);
      expect(disabledStates()).toEqual([false, false]);

      await user.click(
        within(
          screen.getByRole("radiogroup", { name: "Tabs position" }),
        ).getByRole("radio", { name: "Left" }),
      );

      expect(useLayoutStore.getState().arrangement.tabStripPlacement).toBe(
        "left",
      );
      expect(disabledStates()).toEqual([true, true]);
      expect(surface("topBar").textContent).toContain(
        "Applies when tabs are at the top.",
      );
      expect(
        within(taskTabLayout)
          .getByRole("button", { name: "Scroll" })
          .getAttribute("aria-pressed"),
      ).toBe("true");
    });

    it("opens the Tabs tab with View, disabled at the top and writable once vertical (D8)", async () => {
      const user = userEvent.setup();
      renderPanel();
      await goToSurfaceTab(user, "topBar");

      const tabs = surface("topBar");
      const view = tabs.querySelector(
        "[data-settings-anchor='layout-side-strip-view']",
      );
      expect(view?.textContent).toContain("View");
      const viewGroup = within(tabs).getByRole("radiogroup", {
        name: "Tabs view",
      });
      expect(
        within(viewGroup)
          .getAllByRole<HTMLButtonElement>("radio")
          .every((option) => option.disabled),
      ).toBe(true);
      expect(tabs.textContent).toContain(
        "Applies when tabs are at the left or right.",
      );

      await user.click(
        within(
          screen.getByRole("radiogroup", { name: "Tabs position" }),
        ).getByRole("radio", { name: "Left" }),
      );

      expect(
        within(viewGroup)
          .getAllByRole<HTMLButtonElement>("radio")
          .every((option) => option.disabled),
      ).toBe(false);
      await user.click(
        within(viewGroup).getByRole("radio", { name: "Activity" }),
      );

      expect(useLayoutStore.getState().arrangement.sideStripView).toBe(
        "activity",
      );
    });

    it("opens the Sidebar tab with Side, which writes the sidebar's side", async () => {
      const user = userEvent.setup();
      renderPanel();
      await goToSurfaceTab(user, "sidebar");

      const sidebar = surface("sidebar");
      const side = sidebar.querySelector(
        "[data-settings-anchor='layout-sidebar-side']",
      );
      expect(side?.textContent).toContain("Side");
      await user.click(
        within(
          within(sidebar).getByRole("radiogroup", { name: "Sidebar side" }),
        ).getByRole("radio", { name: "Right" }),
      );

      expect(useLayoutStore.getState().arrangement.sidebarSide).toBe("right");
    });

    it("withholds Position, View and Side in the installed mobile app, and never disables Task tab layout there", async () => {
      setMobileApp(true);
      useLayoutStore.setState({
        ...DEFAULT_LAYOUT_SNAPSHOT,
        arrangement: {
          ...DEFAULT_LAYOUT_SNAPSHOT.arrangement,
          tabStripPlacement: "left",
        },
      });
      const user = userEvent.setup();
      renderPanel();
      await goToSurfaceTab(user, "topBar");

      expect(
        screen.queryByRole("radiogroup", { name: "Tabs position" }),
      ).toBeNull();
      expect(
        screen.queryByRole("radiogroup", { name: "Tabs view" }),
      ).toBeNull();
      const taskTabLayout = within(surface("topBar")).getByRole("group", {
        name: "Task tab layout",
      });
      expect(
        within(taskTabLayout)
          .getAllByRole<HTMLButtonElement>("button")
          .map((button) => button.disabled),
      ).toEqual([false, false]);
      expect(surface("topBar").textContent).not.toContain(
        "Applies when tabs are at the top.",
      );

      // "Sidebar side" lives on a different tab, so it has to be checked on
      // ITS tab - on topBar's it would read as absent whether or not the
      // mobile-app guard withheld it.
      await goToSurfaceTab(user, "sidebar");
      expect(
        screen.queryByRole("radiogroup", { name: "Sidebar side" }),
      ).toBeNull();
    });

    it.each(["vertical tabs", "side tabs"])(
      "finds Position when searching %s",
      (query) => {
        const anchors = searchSettings(query, {
          runnerHost: null,
          featureSettings: null,
          mobileApp: false,
        }).map((result) => result.entry.anchor);

        expect(anchors).toContain("layout-tab-strip-placement");
      },
    );

    it.each(["activity", "live agents", "needs you"])(
      "finds View when searching %s (D8)",
      (query) => {
        const anchors = searchSettings(query, {
          runnerHost: null,
          featureSettings: null,
          mobileApp: false,
        }).map((result) => result.entry.anchor);

        expect(anchors).toContain("layout-side-strip-view");
      },
    );
  });

  describe("tab navigation (G6)", () => {
    it("shows only the active surface's rows, hiding every other tab's", async () => {
      const user = userEvent.setup();
      renderPanel();

      for (const group of SURFACE_GROUPS) {
        await goToSurfaceTab(user, group.id);
        expect(tabPanelHiddenFor(`layout-surface-${group.id}`)).toBe(false);
        expect(tabPanelHiddenFor("layout-presets-group")).toBe(true);
        for (const other of SURFACE_GROUPS) {
          if (other.id === group.id) continue;
          expect(
            tabPanelHiddenFor(`layout-surface-${other.id}`),
            other.id,
          ).toBe(true);
        }
      }

      // Back on Presets, no surface's content is visible.
      await user.click(
        screen.getByRole("tab", { name: LAYOUT.definitions.presets.label }),
      );
      expect(tabPanelHiddenFor("layout-presets-group")).toBe(false);
      for (const group of SURFACE_GROUPS) {
        expect(tabPanelHiddenFor(`layout-surface-${group.id}`)).toBe(true);
      }
    });
  });

  describe("settings-search anchor landing (G6)", () => {
    it("switches to a row's own tab when a search result asks to land on it", () => {
      // Seeded before the panel mounts, the way a search-result click's
      // request outlives the navigation that made it (5.9).
      useSettingsSearchStore
        .getState()
        .requestReveal("layout", LAYOUT.definitions.sidebarSide.anchor);

      renderPanel();

      expect(
        screen
          .getByRole("tab", { name: "Sidebar" })
          .getAttribute("aria-selected"),
      ).toBe("true");
      expect(tabPanelHiddenFor("layout-surface-sidebar")).toBe(false);
      // Presets, the page's own default, is not what's showing.
      expect(tabPanelHiddenFor("layout-presets-group")).toBe(true);
    });
  });

  describe("the area rail (H2)", () => {
    it("shows exactly one area's panel at a time", async () => {
      const user = userEvent.setup();
      renderPanel();

      expect(
        document.querySelectorAll('[role="tabpanel"]:not([hidden])'),
      ).toHaveLength(1);
      expect(activeTabPanel()).toBe(
        screen.getByTestId("layout-presets-group").closest('[role="tabpanel"]'),
      );

      await goToSurfaceTab(user, "chat");

      expect(
        document.querySelectorAll('[role="tabpanel"]:not([hidden])'),
      ).toHaveLength(1);
      expect(activeTabPanel()).toBe(
        surface("chat").closest('[role="tabpanel"]'),
      );
    });

    it("walks the rail with arrow keys, Home and End (Radix roving focus)", async () => {
      renderPanel();
      const tabs = screen.getAllByRole("tab");
      expect(tabs.map((tab) => tab.textContent)).toEqual([
        "Presets",
        "Tabs",
        "Sidebar",
        "Chat",
        "Composer",
        "Status bar",
      ]);

      // Radix moves the roving tab stop on a `setTimeout(0)` rather than
      // synchronously in the keydown handler, so every press needs a
      // macrotask flush before the new `document.activeElement` is read.
      async function press(key: string): Promise<void> {
        fireEvent.keyDown(document.activeElement ?? tabs[0], { key });
        await act(async () => {
          await new Promise((resolve) => {
            setTimeout(resolve, 0);
          });
        });
      }

      act(() => {
        tabs[0].focus();
      });

      await press("ArrowDown");
      expect(document.activeElement).toBe(tabs[1]);
      expect(tabs[1].getAttribute("aria-selected")).toBe("true");

      await press("End");
      expect(document.activeElement).toBe(tabs[tabs.length - 1]);
      expect(tabs[tabs.length - 1].getAttribute("aria-selected")).toBe("true");

      await press("Home");
      expect(document.activeElement).toBe(tabs[0]);
      expect(tabs[0].getAttribute("aria-selected")).toBe("true");

      await press("ArrowDown");
      await press("ArrowUp");
      expect(document.activeElement).toBe(tabs[0]);
      expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    });

    it("puts the editor door in the page header, with its search anchor, and draws no Customize card", () => {
      renderPanel();

      const anchor = document.querySelector(
        `[data-settings-anchor="${LAYOUT.definitions.customizeEntry.anchor}"]`,
      );
      expect(anchor).not.toBeNull();
      expect(anchor?.textContent).toMatch(
        /Open the editor|needs a wider window/,
      );
      expect(screen.queryByText("Customize layout")).toBeNull();
    });

    it("shows no Reset on Presets even once its preset changed, and none on an untouched surface", async () => {
      const user = userEvent.setup();
      act(() => {
        useLayoutStore.getState().setBasePreset("compact");
      });
      renderPanel();

      // Presets is the page's default tab.
      expect(
        screen.queryByRole("button", { name: "Reset Presets" }),
      ).toBeNull();

      await goToSurfaceTab(user, "composer");
      expect(
        screen.queryByRole("button", { name: "Reset Composer" }),
      ).toBeNull();
    });

    it("lights an area's dot after an edit, and Reset plus confirm clears only that area's dot", async () => {
      const user = userEvent.setup();
      act(() => {
        useLayoutStore.getState().setArrangement({
          ...DEFAULT_ARRANGEMENT,
          minimapSide: "left", // chat
          sidebarSide: "right", // sidebar
        });
      });
      renderPanel();

      const chatTab = () => screen.getByRole("tab", { name: /^Chat/ });
      const sidebarTab = () => screen.getByRole("tab", { name: /^Sidebar/ });
      expect(within(chatTab()).getByTestId("area-changed-dot")).toBeTruthy();
      expect(within(sidebarTab()).getByTestId("area-changed-dot")).toBeTruthy();

      await goToSurfaceTab(user, "chat");
      await user.click(screen.getByRole("button", { name: "Reset Chat" }));
      await user.click(screen.getByTestId("confirm-action"));

      expect(within(chatTab()).queryByTestId("area-changed-dot")).toBeNull();
      // Sidebar's dot, and its own change, are untouched by Chat's reset.
      expect(within(sidebarTab()).getByTestId("area-changed-dot")).toBeTruthy();
      expect(useLayoutStore.getState().arrangement.minimapSide).toBe(
        DEFAULT_ARRANGEMENT.minimapSide,
      );
      expect(useLayoutStore.getState().arrangement.sidebarSide).toBe("right");
    });

    it("scrolls a newly picked area back to its top", async () => {
      const user = userEvent.setup();
      renderPanel();
      await goToSurfaceTab(user, "chat");

      const chatBody = surface("chat").closest("[data-layout-area-body]");
      if (!(chatBody instanceof HTMLElement)) {
        throw new Error("no scroll body for chat");
      }
      chatBody.scrollTop = 100;

      await goToSurfaceTab(user, "composer");
      await goToSurfaceTab(user, "chat");

      expect(chatBody.scrollTop).toBe(0);
    });

    it("resetting Tabs also restores Task tab layout", async () => {
      const user = userEvent.setup();
      act(() => {
        useLayoutStore.getState().setArrangement({
          ...DEFAULT_ARRANGEMENT,
          tabStripPlacement: "left",
        });
        useSettingsStore.getState().setTaskTabLayout("shrink");
      });
      renderPanel();
      await goToSurfaceTab(user, "topBar");

      await user.click(screen.getByRole("button", { name: "Reset Tabs" }));
      await user.click(screen.getByTestId("confirm-action"));

      expect(useSettingsStore.getState().taskTabLayout).toBe("scroll");
      expect(useLayoutStore.getState().arrangement.tabStripPlacement).toBe(
        DEFAULT_ARRANGEMENT.tabStripPlacement,
      );
    });
  });

  describe("Reset button focus return (review H2)", () => {
    it("returns focus to the area's panel after a keyboard-confirmed reset", async () => {
      const user = userEvent.setup();
      act(() => {
        useLayoutStore.getState().setArrangement({
          ...DEFAULT_ARRANGEMENT,
          minimapSide: "left",
        });
      });
      renderPanel();
      await goToSurfaceTab(user, "chat");

      const resetButton = screen.getByRole("button", { name: "Reset Chat" });
      act(() => {
        resetButton.focus();
      });
      await user.keyboard("{Enter}");

      const confirmButton = screen.getByTestId("confirm-action");
      act(() => {
        confirmButton.focus();
      });
      await user.keyboard("{Enter}");

      // The reset unmounts the button that opened the dialog, and
      // `onCloseAutoFocus` redirects the browser's own focus-restore rather
      // than running it synchronously with the close.
      await act(async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });
      });

      expect(document.activeElement).toBe(
        screen.getByRole("tabpanel", { name: "Chat" }),
      );
      expect(screen.queryByRole("button", { name: "Reset Chat" })).toBeNull();
    });

    it("returns focus to the Reset button on Cancel", async () => {
      const user = userEvent.setup();
      act(() => {
        useLayoutStore.getState().setArrangement({
          ...DEFAULT_ARRANGEMENT,
          minimapSide: "left",
        });
      });
      renderPanel();
      await goToSurfaceTab(user, "chat");

      const resetButton = screen.getByRole("button", { name: "Reset Chat" });
      act(() => {
        resetButton.focus();
      });
      await user.keyboard("{Enter}");

      const cancelButton = screen.getByRole("button", { name: "Cancel" });
      act(() => {
        cancelButton.focus();
      });
      await user.keyboard("{Enter}");

      await act(async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });
      });

      // Cancel leaves the area changed, so the opener is still there for
      // Radix's own default focus-restore to land on.
      expect(document.activeElement).toBe(resetButton);
      expect(screen.getByRole("button", { name: "Reset Chat" })).toBeTruthy();
    });
  });
});
