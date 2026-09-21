import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LayoutEditor } from "@/components/layout-editor/layout-editor";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import {
  DEFAULT_LAYOUT_SNAPSHOT,
  getLayoutSnapshot,
  useLayoutStore,
} from "@/stores/layout/layout-store";

/**
 * The notification feed is the one external boundary here: the relay row's
 * signal is what `merged-notifications` classifies as blocking, and standing
 * up a host feed to produce one would test that store, not this root.
 */
const feed = vi.hoisted(() => ({ blocking: 0 }));
vi.mock(
  "@/stores/notifications/merged-notifications",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/stores/notifications/merged-notifications")
    >()),
    useBlockingAttentionCount: () => feed.blocking,
  }),
);

/**
 * The other external boundary: the provider level's limit checklist observes
 * the status bar's own rate-limit cache (L-96), which needs a host runtime and
 * a query client this root has neither of. What the windows ARE is
 * `provider-limits-choose.test.tsx`'s subject; here the level only has to
 * mount so the ladder and the back row can be driven through it.
 */
vi.mock("@/components/layout-editor/inspector/provider-limit-windows", () => ({
  useProviderLimitWindows: () => ({ windows: [], drawnKeys: [] }),
}));

function mountColumn(): HTMLDivElement {
  const column = document.createElement("div");
  const control = document.createElement("button");
  column.append(control);
  document.body.append(column);
  return column;
}

function openSession(): void {
  useLayoutEditorStore.getState().beginSession({
    entry: "pointer",
    source: "direct_ui",
    preferredInstanceId: null,
    startedAt: 0,
  });
}

function hideTheMic(): void {
  useLayoutEditorStore.getState().recordGesture(() => {
    useLayoutStore.getState().setRegionValues("mic", { shown: "hidden" });
  });
}

function escape(target: EventTarget): void {
  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    }),
  );
}

function chord(shift: boolean): void {
  document.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "z",
      metaKey: true,
      shiftKey: shift,
      bubbles: true,
      cancelable: true,
    }),
  );
}

beforeEach(() => {
  feed.blocking = 0;
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
  cleanup();
  document.body.replaceChildren();
  useLayoutEditorStore.getState().endSession();
});

describe("the mounted editor root", () => {
  it("draws nothing and leaves the column alone until a session opens", () => {
    const column = mountColumn();

    const view = render(<LayoutEditor column={column} />);

    expect(view.container.querySelector("[data-layout-inspector]")).toBeNull();
    expect(column.hasAttribute("aria-hidden")).toBe(false);
    expect(column.hasAttribute("data-layout-editing")).toBe(false);
  });

  it("docks the inspector beside the column and firewalls the column", () => {
    const column = mountColumn();
    const view = render(<LayoutEditor column={column} />);

    act(() => {
      openSession();
    });

    const inspector = view.container.querySelector("[data-layout-inspector]");
    expect(inspector?.getAttribute("data-dock-mode")).toBe("right");
    expect(column.getAttribute("aria-hidden")).toBe("true");
    expect(column.getAttribute("data-layout-editing")).toBe("1");

    act(() => {
      useLayoutEditorStore.getState().setDockMode("left");
    });
    expect(
      view.container
        .querySelector("[data-layout-inspector]")
        ?.getAttribute("data-dock-mode"),
    ).toBe("left");

    act(() => {
      useLayoutEditorStore.getState().endSession();
    });
    expect(column.hasAttribute("aria-hidden")).toBe(false);
    expect(column.hasAttribute("data-layout-editing")).toBe(false);
  });

  it("walks the layout history on Mod+Z and Mod+Shift+Z (L-18)", () => {
    const column = mountColumn();
    render(<LayoutEditor column={column} />);

    act(() => {
      openSession();
      hideTheMic();
    });
    expect(getLayoutSnapshot().overrides.mic).toEqual({ shown: "hidden" });

    act(() => {
      chord(false);
    });
    expect(getLayoutSnapshot().overrides.mic).toBeUndefined();

    act(() => {
      chord(true);
    });
    expect(getLayoutSnapshot().overrides.mic).toEqual({ shown: "hidden" });
  });

  it("leaves the chord alone when no session is open", () => {
    const column = mountColumn();
    render(<LayoutEditor column={column} />);

    act(() => {
      openSession();
      hideTheMic();
      useLayoutEditorStore.getState().endSession();
      useLayoutStore.getState().setRegionValues("mic", { shown: "hidden" });
    });

    act(() => {
      chord(false);
    });

    expect(getLayoutSnapshot().overrides.mic).toEqual({ shown: "hidden" });
  });

  it("walks the Escape ladder from wherever the keyboard is (L-31, I-02)", () => {
    const column = mountColumn();
    const view = render(<LayoutEditor column={column} />);

    act(() => {
      openSession();
      useLayoutEditorStore.getState().select("usageLimits");
      useLayoutEditorStore
        .getState()
        .openLevel({ kind: "usage-provider", providerId: "claude-code" });
    });

    // Focus is on `<body>`, which is exactly where selecting a region used to
    // leave it: the panel-scoped listener never saw the key from here.
    expect(document.activeElement).not.toBe(document.body);
    document.body.focus();

    act(() => {
      escape(document.body);
    });
    expect(useLayoutEditorStore.getState().level).toBeNull();
    expect(useLayoutEditorStore.getState().selected).toBe("usageLimits");

    act(() => {
      escape(document.body);
    });
    expect(useLayoutEditorStore.getState().selected).toBeNull();
    expect(useLayoutEditorStore.getState().session).not.toBeNull();

    // Off the bottom rung: the third press leaves the editor.
    act(() => {
      escape(document.body);
    });
    expect(useLayoutEditorStore.getState().session).toBeNull();
    expect(view.container.querySelector("[data-layout-inspector]")).toBeNull();
  });

  it("leaves Escape alone when no session is open", () => {
    const column = mountColumn();
    render(<LayoutEditor column={column} />);

    act(() => {
      escape(document.body);
    });

    expect(useLayoutEditorStore.getState().session).toBeNull();
    expect(useLayoutEditorStore.getState().selected).toBeNull();
  });

  it("leaves Escape to an overlay that has taken focus", () => {
    const column = mountColumn();
    render(<LayoutEditor column={column} />);
    const menu = document.createElement("div");
    menu.setAttribute("role", "menu");
    document.body.append(menu);

    act(() => {
      openSession();
      useLayoutEditorStore.getState().select("usageLimits");
    });
    act(() => {
      escape(menu);
    });

    // The menu dismisses itself; the level the user was reading stays open.
    expect(useLayoutEditorStore.getState().selected).toBe("usageLimits");
  });

  it("draws the shared back row over every level below the index (L-89)", () => {
    const column = mountColumn();
    const view = render(<LayoutEditor column={column} />);

    act(() => {
      openSession();
    });
    expect(
      view.container.querySelector("[data-layout-inspector-back]"),
    ).toBeNull();

    act(() => {
      useLayoutEditorStore.getState().select("usageLimits");
    });
    expect(
      view.container.querySelector("[data-layout-inspector-back]")?.textContent,
    ).toBe("All regions");

    act(() => {
      useLayoutEditorStore
        .getState()
        .openLevel({ kind: "usage-provider", providerId: "claude-code" });
    });
    expect(
      view.container.querySelector("[data-layout-inspector-back]")?.textContent,
    ).toBe("Usage limits");
  });

  it("raises the relay row only while something is blocking on the user (4.8)", () => {
    const column = mountColumn();
    const view = render(<LayoutEditor column={column} />);

    act(() => {
      openSession();
    });
    expect(view.container.textContent).not.toContain(
      "An agent is waiting for you",
    );

    feed.blocking = 1;
    act(() => {
      view.rerender(<LayoutEditor column={column} />);
    });

    expect(view.container.textContent).toContain("An agent is waiting for you");
  });
});
