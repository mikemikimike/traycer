/**
 * End to end: a raw `KeyboardEvent` for a non-canonically DECLARED default
 * (`tab.split.add`'s `ctrl+alt+n`, `composer.model-picker.toggle`'s
 * `alt+shift+m`) still resolves through `resolveMatchingChord` to the
 * canonical chord the store's (also canonicalized) bindings hold, and
 * `findActionForChord` finds the action from there. `app.tabs.vertical.collapse`
 * is included for the same reason, on both platforms.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPlatformMock } from "@/__tests__/create-platform-mock";

const platformMock = vi.hoisted(() => ({ mac: false }));
vi.mock("@/lib/keybindings/platform", () => createPlatformMock(platformMock));

import { getDefaultBindings } from "@/lib/keybindings/actions";
import { resolveMatchingChord } from "@/lib/keybindings/chord";
import { findActionForChord } from "@/lib/keybindings/dispatch";
import { useKeybindingStore } from "@/stores/settings/keybinding-store";

function keydown(
  init: Partial<KeyboardEventInit> & { code: string },
): KeyboardEvent {
  return new KeyboardEvent("keydown", { ...init, code: init.code });
}

beforeEach(() => {
  platformMock.mac = false;
  useKeybindingStore.setState({ bindings: getDefaultBindings() });
});

describe("resolveMatchingChord -> findActionForChord, off macOS", () => {
  it("resolves Ctrl+Alt+N to tab.split.add", () => {
    const chord = resolveMatchingChord(
      keydown({ code: "KeyN", ctrlKey: true, altKey: true }),
    );
    expect(chord).toBe("mod+alt+n");
    expect(findActionForChord(chord ?? "")).toBe("tab.split.add");
  });

  it("resolves Shift+Alt+M to composer.model-picker.toggle", () => {
    const chord = resolveMatchingChord(
      keydown({ code: "KeyM", shiftKey: true, altKey: true }),
    );
    expect(chord).toBe("shift+alt+m");
    expect(findActionForChord(chord ?? "")).toBe(
      "composer.model-picker.toggle",
    );
  });

  it("resolves Shift+Alt+S to app.tabs.vertical.collapse", () => {
    const chord = resolveMatchingChord(
      keydown({ code: "KeyS", shiftKey: true, altKey: true }),
    );
    expect(chord).toBe("shift+alt+s");
    expect(findActionForChord(chord ?? "")).toBe("app.tabs.vertical.collapse");
  });
});

describe("resolveMatchingChord -> findActionForChord, on macOS", () => {
  beforeEach(() => {
    platformMock.mac = true;
    useKeybindingStore.setState({ bindings: getDefaultBindings() });
  });

  it("resolves Ctrl+Cmd+S to app.tabs.vertical.collapse", () => {
    const chord = resolveMatchingChord(
      keydown({ code: "KeyS", ctrlKey: true, metaKey: true }),
    );
    expect(chord).toBe("mod+ctrl+s");
    expect(findActionForChord(chord ?? "")).toBe("app.tabs.vertical.collapse");
  });
});
