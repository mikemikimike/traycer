import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_ARRANGEMENT } from "@/lib/layout/layout-arrangement";
import { LAYOUT_HISTORY_CAP } from "@/lib/layout/layout-history";
import { persistKey, STORE_KEYS } from "@/lib/persist";
import {
  preferredRegionInstance,
  useLayoutEditorStore,
  type LayoutEditorState,
  type RegionInstance,
} from "@/stores/layout/layout-editor-store";
import {
  DEFAULT_LAYOUT_SNAPSHOT,
  getLayoutSnapshot,
  useLayoutStore,
} from "@/stores/layout/layout-store";

/**
 * Every live registration of one region, in registration order.
 *
 * Read off the store's own map rather than through a helper exported only for
 * this: the map IS the public shape (`preferredRegionInstance` takes it), and
 * a second accessor with no production caller was dead weight (G1-12).
 */
function instancesOf(
  regionId: RegionInstance["regionId"],
): ReadonlyArray<RegionInstance> {
  return [...editorState().instances.values()].filter(
    (entry) => entry.regionId === regionId,
  );
}

function session(): void {
  useLayoutEditorStore.getState().beginSession({
    entry: "pointer",
    source: "direct_ui",
    startedAt: 0,
  });
}

function instance(input: {
  regionId: RegionInstance["regionId"];
  instanceId: string | null;
}): RegionInstance {
  const node = document.createElement("div");
  return {
    key: `${input.regionId}@shell:${input.instanceId ?? "-"}`,
    regionId: input.regionId,
    sceneId: "shell",
    instanceId: input.instanceId,
    node,
  };
}

function editorState(): LayoutEditorState {
  return useLayoutEditorStore.getState();
}

beforeEach(() => {
  window.localStorage.clear();
  useLayoutStore.setState({
    ...DEFAULT_LAYOUT_SNAPSHOT,
    layoutCarryDone: true,
  });
  useLayoutEditorStore.getState().endSession();
  useLayoutEditorStore.setState({
    instances: new Map(),
    dockMode: "right",
    floatPosition: null,
    lockedBy: "none",
  });
});

afterEach(() => {
  useLayoutEditorStore.getState().endSession();
});

describe("a gesture is one undo step", () => {
  it("records the state a gesture replaced and puts it back", () => {
    session();
    editorState().recordGesture(() => {
      useLayoutStore.getState().setRegionValues("mic", { shown: "hidden" });
    });

    expect(getLayoutSnapshot().overrides.mic).toEqual({ shown: "hidden" });
    expect(editorState().history.past).toHaveLength(1);

    editorState().undo();
    expect(getLayoutSnapshot().overrides.mic).toBeUndefined();

    editorState().redo();
    expect(getLayoutSnapshot().overrides.mic).toEqual({ shown: "hidden" });
  });

  it("counts everything one gesture touched as one step", () => {
    session();
    editorState().recordGesture(() => {
      const layout = useLayoutStore.getState();
      layout.setRegionValues("mic", { shown: "hidden" });
      layout.setArrangement({ ...DEFAULT_ARRANGEMENT, usageHost: "header" });
    });

    expect(editorState().history.past).toHaveLength(1);
    editorState().undo();
    expect(getLayoutSnapshot().overrides.mic).toBeUndefined();
    expect(getLayoutSnapshot().arrangement.usageHost).toBe("status-bar");
  });

  it("does not record a gesture that changed nothing", () => {
    session();
    editorState().recordGesture(() => {
      // `shown` is already what the base preset says, so there is no delta.
      useLayoutStore.getState().setRegionValues("mic", { shown: "shown" });
    });

    expect(editorState().history.past).toHaveLength(0);
  });

  it("drops the redo branch once a new gesture lands", () => {
    session();
    editorState().recordGesture(() => {
      useLayoutStore.getState().setRegionValues("mic", { shown: "hidden" });
    });
    editorState().undo();
    expect(editorState().history.future).toHaveLength(1);

    editorState().recordGesture(() => {
      useLayoutStore.getState().setRegionValues("agent", { shown: "hidden" });
    });
    expect(editorState().history.future).toHaveLength(0);
  });

  it("keeps at most the capped number of steps", () => {
    session();
    for (let step = 0; step < LAYOUT_HISTORY_CAP + 5; step += 1) {
      const shown = step % 2 === 0 ? "hidden" : "shown";
      editorState().recordGesture(() => {
        useLayoutStore.getState().setRegionValues("mic", { shown });
      });
    }

    expect(editorState().history.past).toHaveLength(LAYOUT_HISTORY_CAP);
  });
});

describe("undo_count and first_change_bucket bookkeeping (L-46, L-54)", () => {
  it("counts only actual undo travel, not redo or a dropped redo branch", () => {
    session();
    editorState().recordGesture(() => {
      useLayoutStore.getState().setRegionValues("mic", { shown: "hidden" });
    });
    expect(editorState().undoCount).toBe(0);

    editorState().undo();
    expect(editorState().undoCount).toBe(1);

    editorState().redo();
    expect(editorState().undoCount).toBe(1);

    editorState().recordGesture(() => {
      useLayoutStore.getState().setRegionValues("agent", { shown: "hidden" });
    });
    editorState().undo();
    expect(editorState().undoCount).toBe(2);
  });

  it("does not count an undo with nothing to travel to", () => {
    session();
    editorState().undo();
    expect(editorState().undoCount).toBe(0);
  });

  it("sets firstChangeAt on the first gesture and never moves it again", () => {
    session();
    expect(editorState().firstChangeAt).toBeNull();

    editorState().recordGesture(() => {
      useLayoutStore.getState().setRegionValues("mic", { shown: "hidden" });
    });
    const first = editorState().firstChangeAt;
    expect(first).not.toBeNull();

    editorState().recordGesture(() => {
      useLayoutStore.getState().setRegionValues("agent", { shown: "hidden" });
    });
    expect(editorState().firstChangeAt).toBe(first);

    editorState().undo();
    expect(editorState().firstChangeAt).toBe(first);
  });

  it("leaves firstChangeAt null for a gesture that changed nothing", () => {
    session();
    editorState().recordGesture(() => {
      useLayoutStore.getState().setRegionValues("mic", { shown: "shown" });
    });
    expect(editorState().firstChangeAt).toBeNull();
  });

  it("resets both on the next session", () => {
    session();
    editorState().recordGesture(() => {
      useLayoutStore.getState().setRegionValues("mic", { shown: "hidden" });
    });
    editorState().undo();
    expect(editorState().undoCount).toBe(1);
    expect(editorState().firstChangeAt).not.toBeNull();

    editorState().endSession();
    session();

    expect(editorState().undoCount).toBe(0);
    expect(editorState().firstChangeAt).toBeNull();
  });
});

describe("Discard and external writes (L-18)", () => {
  it("restores the state the session started from", () => {
    useLayoutStore.getState().setRegionValues("agent", { shown: "hidden" });
    session();
    editorState().recordGesture(() => {
      useLayoutStore.getState().setRegionValues("mic", { shown: "hidden" });
    });

    editorState().discard();

    expect(getLayoutSnapshot().overrides.mic).toBeUndefined();
    expect(getLayoutSnapshot().overrides.agent).toEqual({ shown: "hidden" });
    expect(editorState().history.past).toHaveLength(0);
  });

  it("rebases the entry snapshot onto a write the editor did not make", () => {
    session();
    editorState().recordGesture(() => {
      useLayoutStore.getState().setRegionValues("mic", { shown: "hidden" });
    });

    // Another window, or a settings surface outside the editor.
    useLayoutStore.getState().setRegionValues("agent", { shown: "hidden" });

    expect(editorState().history.past).toHaveLength(1);

    editorState().discard();

    // The editor's own change is gone; the external one survives Discard.
    expect(getLayoutSnapshot().overrides.mic).toBeUndefined();
    expect(getLayoutSnapshot().overrides.agent).toEqual({ shown: "hidden" });
  });

  it("stops rebasing once the session ends", () => {
    session();
    const entry = editorState().entrySnapshot;
    editorState().endSession();

    useLayoutStore.getState().setRegionValues("agent", { shown: "hidden" });

    expect(entry?.overrides.agent).toBeUndefined();
    expect(editorState().entrySnapshot).toBeNull();
  });
});

describe("the inspector ladder (L-31)", () => {
  it("walks provider level, then section, then index", () => {
    session();
    editorState().select("usageLimits");
    editorState().openLevel({
      kind: "usage-provider",
      providerId: "claude-code",
    });

    expect(editorState().popInspectorLevel()).toBe(true);
    expect(editorState().level).toBeNull();
    expect(editorState().selected).toBe("usageLimits");

    expect(editorState().popInspectorLevel()).toBe(true);
    expect(editorState().selected).toBeNull();

    expect(editorState().popInspectorLevel()).toBe(false);
  });

  it("closes an open level when the selection moves", () => {
    session();
    editorState().select("usageLimits");
    editorState().openLevel({
      kind: "usage-provider",
      providerId: "claude-code",
    });

    editorState().select("minimap");

    expect(editorState().level).toBeNull();
  });
});

describe("instances", () => {
  // A live session has one visible scene, so the overlays follow the first
  // registration and the map is the only thing that decides which that is
  // (L-87 deleted the second tile the old pin existed to choose between).
  it("points the overlays at the first registration and drops with it", () => {
    session();
    const first = instance({ regionId: "minimap", instanceId: "tile-a" });
    const second = instance({ regionId: "minimap", instanceId: "tile-b" });
    editorState().registerInstance(first);
    editorState().registerInstance(second);

    expect(preferredRegionInstance(editorState(), "minimap")).toBe(first);
    expect(instancesOf("minimap")).toEqual([first, second]);

    editorState().unregisterInstance(first.key, first.node);
    expect(preferredRegionInstance(editorState(), "minimap")).toBe(second);

    editorState().unregisterInstance(second.key, second.node);
    expect(preferredRegionInstance(editorState(), "minimap")).toBeNull();
  });

  it("ignores an unregister from a node that is no longer the live one", () => {
    session();
    const first = instance({ regionId: "mic", instanceId: null });
    editorState().registerInstance(first);
    const remounted: RegionInstance = {
      ...first,
      node: document.createElement("span"),
    };
    editorState().registerInstance(remounted);

    editorState().unregisterInstance(first.key, first.node);

    expect(preferredRegionInstance(editorState(), "mic")).toBe(remounted);
  });

  it("survives a session boundary, because the nodes belong to the app", () => {
    session();
    const live = instance({ regionId: "mic", instanceId: null });
    editorState().registerInstance(live);

    editorState().endSession();

    expect(instancesOf("mic")).toEqual([live]);
  });
});

describe("where the panel sits is the only persisted state (L-38)", () => {
  it("writes only the dock mode and the float position to its own leaf", async () => {
    session();
    editorState().select("minimap");
    editorState().setDockMode("float");
    editorState().setFloatPosition({ x: 120, y: 64 });
    await useLayoutEditorStore.persist.rehydrate();

    // The whole record, byte for byte: nothing about the open session is in
    // it, which is the point of the partialize.
    expect(
      window.localStorage.getItem(persistKey(STORE_KEYS.layoutEditorDock)),
    ).toBe(
      JSON.stringify({
        state: { dockMode: "float", floatPosition: { x: 120, y: 64 } },
        version: 1,
      }),
    );
  });

  it("falls back to the right dock when the record is unusable", async () => {
    window.localStorage.setItem(
      persistKey(STORE_KEYS.layoutEditorDock),
      JSON.stringify({
        state: { dockMode: "bottom", floatPosition: { x: "left", y: 4 } },
        version: 1,
      }),
    );
    await useLayoutEditorStore.persist.rehydrate();

    expect(editorState().dockMode).toBe("right");
    expect(editorState().floatPosition).toBeNull();
  });
});

describe("session-scoped fields", () => {
  it("clears hover, selection and the filter on exit", () => {
    session();
    editorState().select("minimap");
    editorState().setHovered("mic");
    editorState().setFilter("mini");
    editorState().setKeyboardNav(true);

    editorState().endSession();

    expect(editorState().selected).toBeNull();
    expect(editorState().hovered).toBeNull();
    expect(editorState().filter).toBe("");
    expect(editorState().keyboardNav).toBe(false);
    expect(editorState().session).toBeNull();
  });
});

/**
 * `dirty` is the only thing Discard is gated on, and until this landed it had
 * no test anywhere - a boolean five call sites had to keep in step, whose
 * failure mode is a permanently disabled or permanently enabled button and
 * nothing red to say so (G2-08). It is now derived by the session's one
 * layout-store watcher, so these five cases are five inputs to one mechanism
 * rather than five copies of it.
 */
describe("whether there is anything to discard", () => {
  function hideTheMic(): void {
    editorState().recordGesture(() => {
      useLayoutStore.getState().setRegionValues("mic", { shown: "hidden" });
    });
  }

  it("is false on entry and raised by a gesture", () => {
    session();
    expect(editorState().dirty).toBe(false);

    hideTheMic();

    expect(editorState().dirty).toBe(true);
  });

  it("drops again on an undo back to the entry state, and returns on the redo", () => {
    session();
    hideTheMic();

    editorState().undo();
    expect(editorState().dirty).toBe(false);

    editorState().redo();
    expect(editorState().dirty).toBe(true);
  });

  it("drops on Discard", () => {
    session();
    hideTheMic();

    editorState().discard();

    expect(editorState().dirty).toBe(false);
  });

  it("stays false when a write the editor did not make rebases the entry", () => {
    // The path with no other observer: the rebase moves what Discard would
    // restore TO, so another window's change is not something this session has
    // to discard. A rebase that forgot to re-answer this left the button lit
    // over a layout identical to the one it would restore.
    session();

    useLayoutStore.getState().setRegionValues("agent", { shown: "hidden" });

    expect(editorState().dirty).toBe(false);
    expect(editorState().entrySnapshot?.overrides.agent).toEqual({
      shown: "hidden",
    });
  });

  it("survives an external write landing on top of the session's own change", () => {
    session();
    hideTheMic();

    useLayoutStore.getState().setRegionValues("agent", { shown: "hidden" });

    expect(editorState().dirty).toBe(true);
  });
});
