import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StatusBarRateLimitWindow } from "@/hooks/rate-limits/use-status-bar-rate-limit-segments";
import {
  AUTOMATIC_LIMIT_SELECTION,
  type LayoutArrangement,
} from "@/lib/layout/layout-arrangement";
import {
  anythingChanged,
  providerChanged,
  usageProvidersChanged,
} from "@/lib/layout/layout-diff";
import type { RateLimitProviderId } from "@/lib/rate-limit-providers";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import {
  DEFAULT_LAYOUT_SNAPSHOT,
  getLayoutSnapshot,
  useLayoutStore,
} from "@/stores/layout/layout-store";

/**
 * The one boundary: what the host has READ for this provider. The level is
 * forbidden a query of its own (L-96), so the windows arrive through the
 * strip's own passive read - mocked here to the two shapes that matter, a
 * provider with limits and a provider nobody has read yet.
 */
const live = vi.hoisted(() => ({
  windows: [] as ReadonlyArray<StatusBarRateLimitWindow>,
  drawnKeys: [] as ReadonlyArray<string>,
  /** How many subscriptions the render under test opened (R3-15). */
  reads: 0,
}));
vi.mock("@/components/layout-editor/inspector/provider-limit-windows", () => ({
  useProviderLimitWindows: () => {
    live.reads += 1;
    return live;
  },
}));

import {
  ProviderLevel,
  ProviderLimitsControl,
} from "@/components/layout-editor/inspector/provider-level";

const PROVIDER: RateLimitProviderId = "claude-code";

function limitWindow(
  windowKey: string,
  label: string,
): StatusBarRateLimitWindow {
  return {
    windowKey,
    label,
    labelIsDuration: true,
    kind: "session",
    usedPercent: 40,
    resetsAt: null,
    severity: "healthy",
  };
}

function arrangement(): LayoutArrangement {
  return useLayoutStore.getState().arrangement;
}

function selection() {
  return arrangement().providerLimits[PROVIDER] ?? AUTOMATIC_LIMIT_SELECTION;
}

function limitsMode(): string | null {
  const group = screen.getByRole("radiogroup", { name: "Limits" });
  const on = [...group.querySelectorAll('[role="radio"]')].find(
    (option) => option.getAttribute("aria-checked") === "true",
  );
  return on?.textContent ?? null;
}

beforeEach(() => {
  live.windows = [limitWindow("5h", "5h"), limitWindow("week", "Weekly")];
  live.drawnKeys = ["5h"];
  live.reads = 0;
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

describe('the provider level\'s "Choose..." checklist (L-96, I-14)', () => {
  it("opens the provider's own live windows and draws the one it was showing", () => {
    render(<ProviderLevel providerId={PROVIDER} />);

    // Automatic is the default, and it offers no list at all.
    expect(limitsMode()).toBe("Automatic (recommended)");
    expect(screen.queryByRole("group", { name: "Limits to draw" })).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "Choose..." }));

    const list = screen.getByRole("group", { name: "Limits to draw" });
    expect(
      [...list.querySelectorAll("label")].map((row) => row.textContent),
    ).toEqual(["5h", "Weekly"]);
    // Seeded from what the strip was already drawing, so taking control of
    // the pick does not change the picture in the same gesture.
    expect(selection()).toEqual({ limitKeys: ["5h"] });
  });

  it("ticks a second limit into the selection, in catalog order", () => {
    render(<ProviderLevel providerId={PROVIDER} />);
    fireEvent.click(screen.getByRole("radio", { name: "Choose..." }));

    fireEvent.click(screen.getByRole("checkbox", { name: "Weekly" }));
    expect(selection().limitKeys).toEqual(["5h", "week"]);

    // Order comes from the catalog, never from the order they were ticked.
    fireEvent.click(screen.getByRole("checkbox", { name: "5h" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "5h" }));
    expect(selection().limitKeys).toEqual(["5h", "week"]);
  });

  it("keeps at least one limit ticked", () => {
    render(<ProviderLevel providerId={PROVIDER} />);
    fireEvent.click(screen.getByRole("radio", { name: "Choose..." }));

    const only = screen.getByRole("checkbox", { name: "5h" });
    expect(only.hasAttribute("disabled")).toBe(true);
    fireEvent.click(only);
    expect(selection().limitKeys).toEqual(["5h"]);
  });

  it("clears the picks on the way back to Automatic", () => {
    render(<ProviderLevel providerId={PROVIDER} />);
    fireEvent.click(screen.getByRole("radio", { name: "Choose..." }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Weekly" }));
    expect(selection().limitKeys).toHaveLength(2);

    fireEvent.click(
      screen.getByRole("radio", { name: "Automatic (recommended)" }),
    );

    expect(selection()).toEqual(AUTOMATIC_LIMIT_SELECTION);
    expect(screen.queryByRole("group", { name: "Limits to draw" })).toBeNull();
  });

  it("leaves NOTHING changed on the way back to Automatic (R1-03)", () => {
    render(<ProviderLevel providerId={PROVIDER} />);
    fireEvent.click(screen.getByRole("radio", { name: "Choose..." }));
    expect(providerChanged(arrangement(), PROVIDER)).toBe(true);

    fireEvent.click(
      screen.getByRole("radio", { name: "Automatic (recommended)" }),
    );

    // Byte-identical to the shipped layout, so there is nothing to revert, no
    // dot to draw on the provider or on Usage limits, and no "Reset
    // everything" - a confirmed, irreversible action - to offer.
    expect(arrangement().providerLimits).toEqual({});
    expect(providerChanged(arrangement(), PROVIDER)).toBe(false);
    expect(usageProvidersChanged(arrangement())).toBe(false);
    expect(anythingChanged(getLayoutSnapshot())).toBe(false);
  });

  it("keeps a pick the host no longer reports when another is ticked (R1-16)", () => {
    // A stored selection naming a window this reading does not carry - a 7d
    // limit the user picked on a reading they have since moved past.
    useLayoutStore.getState().setArrangement({
      ...useLayoutStore.getState().arrangement,
      providerLimits: {
        [PROVIDER]: { limitKeys: ["5h", "7d"] },
      },
    });
    render(<ProviderLevel providerId={PROVIDER} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Weekly" }));

    // The live ones in catalog order, then the pick nobody can see - never a
    // silent prune of what the user chose.
    expect(selection().limitKeys).toEqual(["5h", "week", "7d"]);
  });

  it("is one undoable gesture per tick", () => {
    render(<ProviderLevel providerId={PROVIDER} />);
    useLayoutEditorStore.getState().beginSession({
      entry: "pointer",
      source: "direct_ui",
      startedAt: 0,
    });

    fireEvent.click(screen.getByRole("radio", { name: "Choose..." }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Weekly" }));
    expect(selection().limitKeys).toEqual(["5h", "week"]);

    useLayoutEditorStore.getState().undo();
    expect(selection().limitKeys).toEqual(["5h"]);
    useLayoutEditorStore.getState().undo();
    expect(selection()).toEqual(AUTOMATIC_LIMIT_SELECTION);
  });

  it("says so and stays Automatic when the provider has reported nothing", () => {
    live.windows = [];
    live.drawnKeys = [];
    render(<ProviderLevel providerId={PROVIDER} />);

    expect(
      screen.getByText("No limits reported yet - showing the tightest one."),
    ).not.toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "Choose..." }));

    expect(selection()).toEqual(AUTOMATIC_LIMIT_SELECTION);
    expect(limitsMode()).toBe("Automatic (recommended)");
    expect(screen.queryByRole("group", { name: "Limits to draw" })).toBeNull();
  });
});

describe("what the level costs and what it hides (R3-15, R3-16)", () => {
  it("asks for the provider's windows once, as the page's control does", () => {
    render(<ProviderLimitsControl providerId={PROVIDER} />);
    const onPage = live.reads;
    expect(onPage).toBeGreaterThan(0);

    cleanup();
    live.reads = 0;
    render(<ProviderLevel providerId={PROVIDER} />);

    // The level draws the stage AND the pick from ONE reading. It used to
    // subscribe for the stage and then let its child subscribe again for the
    // same provider, which is two answers to one question.
    expect(live.reads).toBe(onPage);
  });

  it("greys a hidden provider's limits in place rather than removing them", () => {
    const arrangement = useLayoutStore.getState().arrangement;
    useLayoutStore.setState({
      arrangement: { ...arrangement, hiddenProviders: [PROVIDER] },
    });
    render(<ProviderLevel providerId={PROVIDER} />);

    // Still readable. `inert` took the whole subtree out of the accessibility
    // tree, so a screen-reader user who turned a provider off could no longer
    // read what its greyed limits said - and L-08's rule is "greyed in place".
    // (The stage above is `inert` and stays so: a PICTURE of a segment is not
    // a control, which is L-77 rather than this.)
    const mode = screen.getByRole("radiogroup", { name: "Limits" });
    expect(mode.closest("[inert]")).toBeNull();

    // And still not operable, which is the half `inert` was doing: a disabled
    // fieldset turns off every control under it without hiding any of them.
    const group = mode.closest("fieldset");
    expect(group?.disabled).toBe(true);
    expect(group?.getAttribute("aria-disabled")).toBe("true");
  });
});
