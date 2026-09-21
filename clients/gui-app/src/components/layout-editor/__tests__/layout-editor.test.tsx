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

function mountColumn(): HTMLDivElement {
  const column = document.createElement("div");
  const control = document.createElement("button");
  column.append(control);
  document.body.append(column);
  return column;
}

function openSession(): void {
  useLayoutEditorStore.getState().beginSession({
    scene: "in-place",
    entry: "pointer",
    preferredInstanceId: null,
    startedAt: 0,
  });
}

function hideTheMic(): void {
  useLayoutEditorStore.getState().recordGesture(() => {
    useLayoutStore.getState().setRegionValues("mic", { shown: "hidden" });
  });
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
