import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StatusBarRateLimitWindow } from "@/hooks/rate-limits/use-status-bar-rate-limit-segments";
import { AUTOMATIC_LIMIT_SELECTION } from "@/lib/layout/layout-arrangement";
import type { RateLimitProviderId } from "@/lib/rate-limit-providers";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import {
  DEFAULT_LAYOUT_SNAPSHOT,
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
}));
vi.mock("@/components/layout-editor/inspector/provider-limit-windows", () => ({
  useProviderLimitWindows: () => live,
}));

import { ProviderLevel } from "@/components/layout-editor/inspector/provider-level";

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

function selection() {
  return (
    useLayoutStore.getState().arrangement.providerLimits[PROVIDER] ??
    AUTOMATIC_LIMIT_SELECTION
  );
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
    expect(selection()).toEqual({ automatic: false, limitKeys: ["5h"] });
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

  it("is one undoable gesture per tick", () => {
    render(<ProviderLevel providerId={PROVIDER} />);
    useLayoutEditorStore.getState().beginSession({
      entry: "pointer",
      source: "direct_ui",
      preferredInstanceId: null,
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
