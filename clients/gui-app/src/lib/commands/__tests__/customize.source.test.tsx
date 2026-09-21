import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { customizeSource } from "@/lib/commands/sources/customize.source";
import type { CommandContext, CommandItem } from "@/lib/commands/types";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";

const openLayoutEditorMock = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigateMock }));

vi.mock("@/lib/layout/editor-session", () => ({
  openLayoutEditor: openLayoutEditorMock,
}));

function ctx(): CommandContext {
  return {
    pathname: "/",
    router: {
      getPathname: () => "/",
      navigateHome: () => undefined,
      navigateSettings: () => undefined,
      navigateToEpic: () => undefined,
      navigateToEpicTab: () => undefined,
      navigateToEpicList: () => undefined,
      navigateSettingsSection: () => undefined,
      navigateToTabIntent: () => undefined,
      goBack: () => undefined,
      goForward: () => undefined,
      isHistoryNavAvailable: () => false,
      canGoBack: () => false,
      canGoForward: () => false,
    },
    activeTabId: null,
    activeEpicId: null,
    focusedComposerKind: null,
    targetGroupId: null,
  };
}

function items(): ReadonlyArray<CommandItem> {
  let captured: ReadonlyArray<CommandItem> = [];
  function Probe() {
    captured = customizeSource.useItems(ctx());
    return null;
  }
  render(<Probe />);
  return captured;
}

beforeEach(() => {
  useLayoutEditorStore.setState({ session: null, lockedBy: "none" });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  useLayoutEditorStore.setState({ session: null, lockedBy: "none" });
});

describe("customizeSource", () => {
  it("opens the editor through the door, as a keyboard entry", () => {
    const [item, ...rest] = items();
    expect(rest).toEqual([]);
    expect(item.label).toBe("Customize layout");
    expect(item.disabled).toBeUndefined();

    void item.run(ctx());

    expect(openLayoutEditorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "command_palette",
        // The palette is reached by typing, and the entry method gates the
        // View Transition as well as being reported (L-30, L-54).
        entry: "keyboard",
        target: null,
      }),
    );
  });

  it("offers nothing from inside a session", () => {
    useLayoutEditorStore.setState({
      session: {
        entry: "pointer",
        source: "direct_ui",
        preferredInstanceId: null,
        startedAt: 0,
      },
    });

    expect(items()).toEqual([]);
  });

  // The door declines while another window holds the lease (L-32), so the row
  // says why instead of being a press that does nothing.
  it("explains itself rather than acting while another window holds it", () => {
    useLayoutEditorStore.setState({ lockedBy: "other-window" });
    const [item] = items();

    expect(item.disabled).toBe(true);
    expect(item.description).toContain("another window");

    void item.run(ctx());

    expect(openLayoutEditorMock).not.toHaveBeenCalled();
  });
});
