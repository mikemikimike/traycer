import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LayoutRegionContextMenu } from "@/components/layout-editor/region-quick-verbs";
import { offeredQuickVerbs } from "@/components/layout-editor/regions/quick-verbs";
import {
  SHOW_HIDE_VERBS,
  SIZED_VERBS,
} from "@/components/layout-editor/regions/region-grammar";
import { PRESET_VALUES } from "@/lib/layout/layout-presets";
import type { RegionId } from "@/lib/layout/region-id";
import {
  DEFAULT_LAYOUT_SNAPSHOT,
  useLayoutStore,
} from "@/stores/layout/layout-store";

interface CapturedToastAction {
  readonly label: string;
  readonly onClick: () => void;
}

interface CapturedToast {
  readonly message: string;
  readonly id: string;
  readonly action: CapturedToastAction;
  readonly cancel: CapturedToastAction;
}

const openLayoutEditorMock = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());
const toasts = vi.hoisted(() => [] as Array<CapturedToast>);

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigateMock }));

vi.mock("@/lib/layout/editor-session", () => ({
  openLayoutEditor: openLayoutEditorMock,
}));

// Sonner renders into a toaster the app mounts elsewhere; what this suite is
// about is what the toast CARRIES, so the call is captured instead.
vi.mock("sonner", () => ({
  toast: (
    message: string,
    options: {
      readonly id: string;
      readonly action: CapturedToastAction;
      readonly cancel: CapturedToastAction;
    },
  ) => {
    toasts.push({
      message,
      id: options.id,
      action: options.action,
      cancel: options.cancel,
    });
  },
}));

function Harness(props: { readonly regionId: RegionId }): ReactNode {
  return (
    <LayoutRegionContextMenu regionId={props.regionId}>
      <button type="button" data-testid="region">
        region
      </button>
    </LayoutRegionContextMenu>
  );
}

function openMenu(): void {
  fireEvent.contextMenu(screen.getByTestId("region"));
}

/**
 * A region's effective value, read the way the store resolves it - the base
 * preset under the minimal delta - so an assertion cannot pass merely because
 * a key was written as an override that repeats the base.
 */
function regionValue(regionId: RegionId, key: "shown" | "size"): unknown {
  const state = useLayoutStore.getState();
  const stored = state.overrides[regionId];
  const base = PRESET_VALUES[state.basePreset][regionId];
  return (
    (stored === undefined ? undefined : Reflect.get(stored, key)) ??
    Reflect.get(base, key)
  );
}

beforeEach(() => {
  toasts.length = 0;
  useLayoutStore.getState().replaceAll(DEFAULT_LAYOUT_SNAPSHOT);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  useLayoutStore.getState().replaceAll(DEFAULT_LAYOUT_SNAPSHOT);
});

describe("offeredQuickVerbs", () => {
  it("offers one of the show/hide pair, never both", () => {
    expect(
      offeredQuickVerbs(SHOW_HIDE_VERBS, { hidden: false, chip: false }),
    ).toEqual(["hide"]);
    expect(
      offeredQuickVerbs(SHOW_HIDE_VERBS, { hidden: true, chip: false }),
    ).toEqual(["show"]);
  });

  it("offers the size a region is NOT in, and only while it is there to size", () => {
    expect(
      offeredQuickVerbs(SIZED_VERBS, { hidden: false, chip: false }),
    ).toEqual(["chip", "hide"]);
    expect(
      offeredQuickVerbs(SIZED_VERBS, { hidden: false, chip: true }),
    ).toEqual(["full", "hide"]);
    expect(
      offeredQuickVerbs(SIZED_VERBS, { hidden: true, chip: true }),
    ).toEqual(["show"]);
  });

  it("never offers move: the menu's way in is what performs one", () => {
    expect(
      offeredQuickVerbs(SIZED_VERBS, { hidden: false, chip: false }),
    ).not.toContain("move");
  });
});

describe("<LayoutRegionContextMenu />", () => {
  it("hides the region and announces it with an Undo", () => {
    render(<Harness regionId="minimap" />);
    openMenu();

    fireEvent.click(screen.getByTestId("layout-quick-verb-minimap-hide"));

    expect(regionValue("minimap", "shown")).toBe("hidden");
    expect(toasts.at(-1)?.message).toBe("Minimap hidden");
    expect(toasts.at(-1)?.action.label).toBe("Undo");
  });

  // A second verb replaces the first's toast rather than stacking beside it, so
  // the only Undo on screen is always the last verb's.
  it("shows one toast at a time, whichever verb fired", () => {
    render(<Harness regionId="access" />);

    openMenu();
    fireEvent.click(screen.getByTestId("layout-quick-verb-access-chip"));
    const sizeToast = toasts.at(-1);

    openMenu();
    fireEvent.click(screen.getByTestId("layout-quick-verb-access-hide"));

    expect(sizeToast?.id).toBeTypeOf("string");
    expect(toasts.at(-1)?.id).toBe(sizeToast?.id);
  });

  // The case a snapshot-based Undo gets wrong: something ELSE changes the same
  // region while the toast is up. Undo must put back the one leaf the verb
  // wrote and leave the rest where it now stands.
  it("puts back only the leaf the verb wrote, not the region as it was", () => {
    render(<Harness regionId="access" />);
    openMenu();
    fireEvent.click(screen.getByTestId("layout-quick-verb-access-hide"));
    expect(regionValue("access", "shown")).toBe("hidden");
    const hideToast = toasts.at(-1);

    // Written from outside this menu - the Layout settings page, another
    // window - while the toast is still on screen.
    useLayoutStore.getState().setRegionValues("access", { size: "chip" });

    hideToast?.action.onClick();

    expect(regionValue("access", "shown")).toBe("shown");
    expect(regionValue("access", "size")).toBe("chip");
  });

  it("brings a rail panel back to auto, not pinned open (L-47)", () => {
    useLayoutStore.getState().setRegionValues("railComments", {
      shown: "hidden",
    });
    render(<Harness regionId="railComments" />);
    openMenu();

    fireEvent.click(screen.getByTestId("layout-quick-verb-railComments-show"));

    expect(regionValue("railComments", "shown")).toBe("auto");
  });

  it("opens the editor on the region the menu was over", () => {
    render(<Harness regionId="mic" />);
    openMenu();

    fireEvent.click(screen.getByTestId("customize-layout-menu-item"));

    expect(openLayoutEditorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "direct_ui",
        entry: "pointer",
        target: "mic",
      }),
    );
  });

  it("offers the same way in from the toast", () => {
    render(<Harness regionId="minimap" />);
    openMenu();
    fireEvent.click(screen.getByTestId("layout-quick-verb-minimap-hide"));

    expect(toasts.at(-1)?.cancel.label).toBe("Customize layout...");
    toasts.at(-1)?.cancel.onClick();

    expect(openLayoutEditorMock).toHaveBeenCalledWith(
      expect.objectContaining({ target: "minimap" }),
    );
  });
});
