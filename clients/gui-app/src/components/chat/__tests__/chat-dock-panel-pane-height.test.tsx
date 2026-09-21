import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { ChatDockAttachedPanelBody } from "@/components/chat/chat-dock-attached-panel";
import {
  CHAT_DOCK_PANEL_DEFAULT_HEIGHT_RATIO,
  CHAT_DOCK_PANEL_HEIGHT_PROPERTY,
  CHAT_DOCK_PANEL_MAX_HEIGHT_RATIO,
  CHAT_DOCK_PANEL_MIN_HEIGHT_RATIO,
  chatDockPanelHeightCss,
  chatDockPanelPaneHeight,
  clampChatDockPanelHeightRatio,
} from "@/lib/chat/chat-dock-panel-height";
import { useSettingsStore } from "@/stores/settings/settings-store";

/**
 * L-145: the opened pill panel is a share of the CHAT PANE, not of the window.
 *
 * The case that made this a defect is a chat TILE on a canvas with several of
 * them: the pane here is 400px inside jsdom's 768px window, so every number
 * below separates the two readings rather than merely agreeing with one.
 */
const PANE_HEIGHT = 400;

/** jsdom measures everything as zero, so the pane states its own height. */
function stubPaneHeight(pane: HTMLElement, height: number): void {
  vi.spyOn(pane, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 600,
    bottom: height,
    width: 600,
    height,
    toJSON: () => ({}),
  });
}

function renderPanelInPane(paneHeight: number): HTMLElement {
  render(
    <div data-chat-pane="" data-testid="chat-pane">
      <ChatDockAttachedPanelBody section="filesChanged" testId="panel-rows">
        <div>a row</div>
      </ChatDockAttachedPanelBody>
    </div>,
  );
  const pane = screen.getByTestId("chat-pane");
  stubPaneHeight(pane, paneHeight);
  return pane;
}

function handle(): HTMLElement {
  return screen.getByTestId("chat-dock-attached-panel-resize");
}

function dragHandleBy(deltaY: number): void {
  const grip = handle();
  grip.setPointerCapture = () => undefined;
  act(() => {
    fireEvent.pointerDown(grip, {
      pointerId: 1,
      isPrimary: true,
      button: 0,
      clientY: 500,
    });
  });
  act(() => {
    fireEvent.pointerMove(grip, { pointerId: 1, clientY: 500 - deltaY });
  });
  act(() => {
    fireEvent.pointerUp(grip, { pointerId: 1, clientY: 500 - deltaY });
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useSettingsStore.setState({
    chatDockPanelHeight: CHAT_DOCK_PANEL_DEFAULT_HEIGHT_RATIO,
  });
});

describe("the pill panel's height is a share of the chat pane", () => {
  it("draws a pane-relative height, never a window-relative one", () => {
    renderPanelInPane(PANE_HEIGHT);

    const body = screen.getByTestId("panel-rows");
    const height = body.style.getPropertyValue(CHAT_DOCK_PANEL_HEIGHT_PROPERTY);
    expect(height).toContain("cqh");
    expect(height).not.toContain("dvh");
    expect(height).not.toContain("vh)");
    // The pane is the nearest SIZE container, so the share resolves against
    // it and against nothing else on the way up - and the drawn height is
    // that property and nothing else.
    expect(height).toBe(
      chatDockPanelHeightCss(
        Math.round(CHAT_DOCK_PANEL_DEFAULT_HEIGHT_RATIO * 100),
      ),
    );
    expect(body.className).toContain(
      `h-[var(${CHAT_DOCK_PANEL_HEIGHT_PROPERTY})]`,
    );
    // A pane too short for the floor shrinks the panel rather than being
    // buried by it, and the body scrolls at every size.
    expect(height).toContain(
      `min(${Math.round(CHAT_DOCK_PANEL_MAX_HEIGHT_RATIO * 100)}cqh,`,
    );
    expect(body.className).toContain("overflow-y-auto");
  });

  it("clamps to half the pane and to a usable minimum", () => {
    expect(clampChatDockPanelHeightRatio(0.9)).toBe(
      CHAT_DOCK_PANEL_MAX_HEIGHT_RATIO,
    );
    expect(clampChatDockPanelHeightRatio(0.01)).toBe(
      CHAT_DOCK_PANEL_MIN_HEIGHT_RATIO,
    );
    expect(clampChatDockPanelHeightRatio(Number.NaN)).toBe(
      CHAT_DOCK_PANEL_DEFAULT_HEIGHT_RATIO,
    );
    // Half of a 400px pane is 200px, not half of the 768px window.
    expect(CHAT_DOCK_PANEL_MAX_HEIGHT_RATIO * PANE_HEIGHT).toBe(200);
    expect(chatDockPanelHeightCss(12)).toBe("min(50cqh, max(6rem, 12cqh))");
  });

  it("measures the chat pane it is inside, and the window only without one", () => {
    const pane = renderPanelInPane(PANE_HEIGHT);
    const grip = handle();

    expect(chatDockPanelPaneHeight(grip)).toBe(PANE_HEIGHT);
    expect(chatDockPanelPaneHeight(null)).toBe(window.innerHeight);
    // The landing composer's dock has no pane above it: the window is the
    // fallback there, which is what `cqh` itself falls back to.
    pane.removeAttribute("data-chat-pane");
    expect(chatDockPanelPaneHeight(grip)).toBe(window.innerHeight);
    expect(window.innerHeight).not.toBe(PANE_HEIGHT);
  });

  it("drags 1:1 against the pane, not against the window", () => {
    renderPanelInPane(PANE_HEIGHT);

    // 60px up on a 400px pane is +15 points. On jsdom's 768px window the same
    // gesture would be +8, which is the reading this ticket removes.
    dragHandleBy(60);

    expect(useSettingsStore.getState().chatDockPanelHeight).toBeCloseTo(0.48);
    expect(handle().getAttribute("aria-valuenow")).toBe("48");
  });

  it("keeps the handle's ARIA truthful about what the share is of", () => {
    renderPanelInPane(PANE_HEIGHT);
    const grip = handle();

    expect(grip.getAttribute("aria-valuemin")).toBe("12");
    expect(grip.getAttribute("aria-valuemax")).toBe("50");
    expect(grip.getAttribute("aria-valuenow")).toBe("33");
    expect(grip.getAttribute("aria-valuetext")).toBe("33% of the chat pane");

    // Keyboard resize and the double-click reset still land on the same scale.
    fireEvent.keyDown(grip, { key: "ArrowUp" });
    expect(handle().getAttribute("aria-valuenow")).toBe("35");
    fireEvent.keyDown(grip, { key: "Home" });
    expect(handle().getAttribute("aria-valuenow")).toBe("50");
    fireEvent.doubleClick(grip);
    expect(handle().getAttribute("aria-valuenow")).toBe("33");
    expect(handle().getAttribute("aria-valuetext")).toBe(
      "33% of the chat pane",
    );
  });
});
