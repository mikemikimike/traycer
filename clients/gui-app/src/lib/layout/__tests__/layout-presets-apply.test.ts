import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_ARRANGEMENT,
  type LayoutArrangement,
} from "@/lib/layout/layout-arrangement";
import {
  layoutChanges,
  layoutModified,
  resetLayout,
  revertLayoutChange,
} from "@/lib/layout/layout-diff";
import {
  effectiveLayoutValues,
  PRESET_VALUES,
} from "@/lib/layout/layout-presets";
import { persistKey, STORE_KEYS } from "@/lib/persist";
import {
  useLayoutEditorStore,
  type LayoutEditorState,
} from "@/stores/layout/layout-editor-store";
import {
  DEFAULT_LAYOUT_SNAPSHOT,
  getLayoutSnapshot,
  useLayoutStore,
} from "@/stores/layout/layout-store";

/**
 * `applyPreset` (`layout-store.ts`) and the change list it is measured by
 * (`layout-diff.ts`): applying a preset replaces every value with the
 * preset's and clears the delta, but leaves placement, order and provider
 * choices untouched - and does it as one undo step.
 */

function reset(): void {
  useLayoutStore.setState({
    ...DEFAULT_LAYOUT_SNAPSHOT,
    layoutCarryDone: true,
  });
  useLayoutEditorStore.getState().endSession();
  window.localStorage.clear();
}

beforeEach(reset);
afterEach(reset);

function editorState(): LayoutEditorState {
  return useLayoutEditorStore.getState();
}

function beginSession(): void {
  useLayoutEditorStore.getState().beginSession({
    entry: "pointer",
    source: "direct_ui",
    startedAt: 0,
    origin: { kind: "tab" },
  });
}

const PROVIDER = DEFAULT_ARRANGEMENT.usageProviders[0];

/** Placement, order, reading width and a hidden provider all moved from what shipped. */
function movedArrangement(): LayoutArrangement {
  return {
    ...DEFAULT_ARRANGEMENT,
    tabStripPlacement: "left",
    sidebarSide: "right",
    usageHost: "header",
    usageSide: "left",
    dock: [...DEFAULT_ARRANGEMENT.dock].reverse(),
    rail: [...DEFAULT_ARRANGEMENT.rail].reverse(),
    hiddenProviders: [PROVIDER],
    // Chat display settings (audit R1): readingWidth is arrangement, not a
    // region value, so applying a preset must leave it untouched too.
    readingWidth: "wide",
  };
}

describe("applying a preset", () => {
  it("keeps the arrangement, clears the delta, and adopts the preset's own values", () => {
    useLayoutStore.getState().setArrangement(movedArrangement());
    const arrangementBefore = getLayoutSnapshot().arrangement;
    useLayoutStore.getState().setRegionValues("model", { style: "bars-text" });
    useLayoutStore.getState().setRegionValues("mic", { shown: "hidden" });

    useLayoutStore.getState().applyPreset("compact");

    expect(getLayoutSnapshot().basePreset).toBe("compact");
    expect(getLayoutSnapshot().arrangement).toEqual(arrangementBefore);
    expect(getLayoutSnapshot().overrides).toEqual({});
    expect(
      effectiveLayoutValues("compact", getLayoutSnapshot().overrides),
    ).toEqual(PRESET_VALUES.compact);
  });

  it("is one undo step in a session", () => {
    beginSession();
    editorState().recordGesture(() => {
      useLayoutStore.getState().setRegionValues("mic", { shown: "hidden" });
      useLayoutStore
        .getState()
        .setArrangement({ ...DEFAULT_ARRANGEMENT, usageHost: "header" });
    });
    const before = getLayoutSnapshot();

    editorState().recordGesture(() => {
      useLayoutStore.getState().applyPreset("compact");
    });
    expect(getLayoutSnapshot().basePreset).toBe("compact");
    expect(editorState().history.past).toHaveLength(2);

    editorState().undo();

    expect(getLayoutSnapshot()).toEqual(before);
  });
});

describe("layoutModified", () => {
  it("tracks a value pick, an arrangement move and an apply, each independently", () => {
    expect(layoutModified(getLayoutSnapshot())).toBe(false);

    useLayoutStore.getState().setRegionValues("mic", { shown: "hidden" });
    expect(layoutModified(getLayoutSnapshot())).toBe(true);

    // Set back to the preset's own value: no longer a change.
    useLayoutStore.getState().setRegionValues("mic", { shown: "shown" });
    expect(layoutModified(getLayoutSnapshot())).toBe(false);

    useLayoutStore
      .getState()
      .setArrangement({ ...DEFAULT_ARRANGEMENT, sidebarSide: "right" });
    expect(layoutModified(getLayoutSnapshot())).toBe(true);

    useLayoutStore.getState().setArrangement(DEFAULT_ARRANGEMENT);
    expect(layoutModified(getLayoutSnapshot())).toBe(false);

    // Applying Compact with nothing else changed: unmodified under its own
    // preset, which is a different fact from `anythingChanged` (basePreset
    // itself moved away from Default).
    useLayoutStore.getState().applyPreset("compact");
    expect(layoutModified(getLayoutSnapshot())).toBe(false);
    expect(getLayoutSnapshot().basePreset).toBe("compact");
  });
});

describe("the change list", () => {
  it("a style line's baseline is the last-applied preset's own value", () => {
    useLayoutStore.getState().applyPreset("compact");
    useLayoutStore.getState().setRegionValues("model", { style: "text" });

    const changes = layoutChanges(getLayoutSnapshot());

    expect(changes.styles).toEqual([
      {
        kind: "value",
        region: "model",
        key: "style",
        current: "text",
        baseline: PRESET_VALUES.compact.model.style,
      },
    ]);
  });

  it("groups arrangement lines by field, order and provider", () => {
    useLayoutStore.getState().setArrangement({
      ...DEFAULT_ARRANGEMENT,
      sidebarSide: "right",
      dock: [...DEFAULT_ARRANGEMENT.dock].reverse(),
      hiddenProviders: [PROVIDER],
    });

    const changes = layoutChanges(getLayoutSnapshot());

    expect(changes.arrangement).toEqual([
      {
        kind: "field",
        field: "sidebarSide",
        current: "right",
        baseline: "left",
      },
      { kind: "order", group: "dock" },
      { kind: "provider", providerId: PROVIDER },
    ]);
  });

  it("revertLayoutChange on a value line puts back only that key", () => {
    useLayoutStore.getState().setRegionValues("mic", { shown: "hidden" });
    useLayoutStore.getState().setRegionValues("homeTab", { shown: "shown" });

    const change = layoutChanges(getLayoutSnapshot()).styles.find(
      (candidate) => candidate.region === "mic",
    );
    if (change === undefined) throw new Error("expected a mic change");

    useLayoutStore
      .getState()
      .replaceAll(revertLayoutChange(getLayoutSnapshot(), change));

    expect(getLayoutSnapshot().overrides).toEqual({
      homeTab: { shown: "shown" },
    });
  });

  it("revertLayoutChange on a field line leaves the order and provider lines listed", () => {
    useLayoutStore.getState().setArrangement({
      ...DEFAULT_ARRANGEMENT,
      sidebarSide: "right",
      dock: [...DEFAULT_ARRANGEMENT.dock].reverse(),
      hiddenProviders: [PROVIDER],
    });
    const fieldChange = layoutChanges(getLayoutSnapshot()).arrangement.find(
      (candidate) => candidate.kind === "field",
    );
    if (fieldChange === undefined) throw new Error("expected a field change");

    useLayoutStore
      .getState()
      .replaceAll(revertLayoutChange(getLayoutSnapshot(), fieldChange));

    expect(getLayoutSnapshot().arrangement.sidebarSide).toBe("left");
    expect(
      layoutChanges(getLayoutSnapshot()).arrangement.map(
        (candidate) => candidate.kind,
      ),
    ).toEqual(["order", "provider"]);
  });

  it("revertLayoutChange on an order line leaves the provider line listed", () => {
    useLayoutStore.getState().setArrangement({
      ...DEFAULT_ARRANGEMENT,
      dock: [...DEFAULT_ARRANGEMENT.dock].reverse(),
      hiddenProviders: [PROVIDER],
    });
    const orderChange = layoutChanges(getLayoutSnapshot()).arrangement.find(
      (candidate) => candidate.kind === "order",
    );
    if (orderChange === undefined) throw new Error("expected an order change");

    useLayoutStore
      .getState()
      .replaceAll(revertLayoutChange(getLayoutSnapshot(), orderChange));

    expect(getLayoutSnapshot().arrangement.dock).toEqual(
      DEFAULT_ARRANGEMENT.dock,
    );
    expect(
      layoutChanges(getLayoutSnapshot()).arrangement.map(
        (candidate) => candidate.kind,
      ),
    ).toEqual(["provider"]);
  });

  it("revertLayoutChange on a provider line clears the last remaining arrangement change", () => {
    useLayoutStore.getState().setArrangement({
      ...DEFAULT_ARRANGEMENT,
      hiddenProviders: [PROVIDER],
    });
    const providerChange = layoutChanges(getLayoutSnapshot()).arrangement.find(
      (candidate) => candidate.kind === "provider",
    );
    if (providerChange === undefined) {
      throw new Error("expected a provider change");
    }

    useLayoutStore
      .getState()
      .replaceAll(revertLayoutChange(getLayoutSnapshot(), providerChange));

    expect(layoutChanges(getLayoutSnapshot()).arrangement).toEqual([]);
  });
});

describe("resetLayout through the store", () => {
  it("restores the shipped snapshot, keeping dividerSeq from ever decreasing", () => {
    useLayoutStore.getState().applyPreset("compact");
    useLayoutStore.getState().setRegionValues("model", { style: "text" });
    useLayoutStore.getState().setArrangement({
      ...DEFAULT_ARRANGEMENT,
      sidebarSide: "right",
      dividerSeq: DEFAULT_ARRANGEMENT.dividerSeq + 3,
    });

    useLayoutStore.getState().replaceAll(resetLayout(getLayoutSnapshot()));

    expect(getLayoutSnapshot().basePreset).toBe("default");
    expect(getLayoutSnapshot().overrides).toEqual({});
    expect(getLayoutSnapshot().arrangement).toEqual({
      ...DEFAULT_ARRANGEMENT,
      dividerSeq: DEFAULT_ARRANGEMENT.dividerSeq + 3,
    });
  });
});

describe("a pre-existing persisted record still loads", () => {
  it("rehydrates the last-applied preset and its own override", async () => {
    window.localStorage.setItem(
      persistKey(STORE_KEYS.layout),
      JSON.stringify({
        state: {
          basePreset: "compact",
          overrides: { model: { style: "text" } },
          arrangement: DEFAULT_ARRANGEMENT,
          layoutCarryDone: true,
        },
        version: 5,
      }),
    );

    await useLayoutStore.persist.rehydrate();

    expect(getLayoutSnapshot().basePreset).toBe("compact");
    expect(getLayoutSnapshot().overrides).toEqual({
      model: { style: "text" },
    });
  });
});
