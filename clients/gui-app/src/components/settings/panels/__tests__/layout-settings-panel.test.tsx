import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LayoutSettingsPanel } from "@/components/settings/panels/layout-settings-panel";
import { setMobileApp } from "@/lib/mobile-app";
import {
  LAYOUT_REGION_LIST,
  SURFACE_GROUPS,
} from "@/lib/layout/layout-regions";
import {
  DEFAULT_LAYOUT_SNAPSHOT,
  useLayoutStore,
} from "@/stores/layout/layout-store";

// The provider list is read through the watched host's scope; this page needs
// it mounted, never connected.
vi.mock("@/lib/host", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/host")>()),
  useHostClient: () => null,
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
});

/**
 * The full-width host of the one layout form (L-03).
 *
 * What is worth pinning here is that this page is not a second form: it renders
 * the SAME section components the inspector docks, so the only things it owns
 * are which of them appear and in what grouping. The sections' own behaviour is
 * covered where they live (`components/layout-editor/inspector`).
 */
describe("Settings ▸ Layout", () => {
  it("renders every region section, grouped by surface", () => {
    render(<LayoutSettingsPanel />);

    for (const group of SURFACE_GROUPS) {
      expect(screen.getByTestId(`layout-surface-${group.id}`)).toBeTruthy();
    }
    // Expanded, all of them: an index exists to pick ONE section to open, and
    // this host has no index.
    for (const region of LAYOUT_REGION_LIST) {
      const group = screen.getByTestId(`layout-surface-${region.surface}`);
      expect(group.textContent).toContain(region.name);
    }
  });

  it("puts the presets block first", () => {
    render(<LayoutSettingsPanel />);

    const presets = screen.getByTestId("layout-presets-group");
    const firstSurface = screen.getByTestId(
      `layout-surface-${SURFACE_GROUPS[0].id}`,
    );
    expect(
      presets.compareDocumentPosition(firstSurface) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("writes the region's own value from a section's switch", async () => {
    const user = userEvent.setup();
    render(<LayoutSettingsPanel />);

    await user.click(screen.getByRole("switch", { name: "Show Minimap" }));

    expect(useLayoutStore.getState().overrides.minimap?.shown).toBe("hidden");
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
