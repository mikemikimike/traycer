/**
 * Cross-action guard, on both platforms: every chord-kind action's resolved
 * default is exactly `canonicalChord` of its declared per-platform value (so a
 * non-canonical declaration like `ctrl+alt+n` off mac, or `alt+shift+m`, still
 * resolves to the form the dispatcher matches), and no two actions resolve to
 * the same chord.
 */
import { describe, expect, it, vi } from "vitest";
import { createPlatformMock } from "@/__tests__/create-platform-mock";

const platformMock = vi.hoisted(() => ({ mac: false }));
vi.mock("@/lib/keybindings/platform", () => createPlatformMock(platformMock));

import {
  ACTION_IDS,
  ACTION_META,
  resolveActionDefaultChord,
  type ActionMeta,
} from "@/lib/keybindings/actions";
import { canonicalChord } from "@/lib/keybindings/chord";

/** The declared (possibly non-canonical) default for this platform, before resolution. */
function declaredDefault(meta: ActionMeta, isMac: boolean): string | null {
  const def = meta.defaultChord;
  if (def === null) return null;
  if (typeof def === "string") return def;
  return isMac ? def.mac : def.other;
}

describe.each([
  { isMac: true, label: "mac" },
  { isMac: false, label: "non-mac" },
])("chord-kind action defaults on $label", ({ isMac }) => {
  it("resolves to canonicalChord of the declared value, for every action", () => {
    platformMock.mac = isMac;
    for (const id of ACTION_IDS) {
      const meta = ACTION_META[id];
      if (meta.kind !== "chord") continue;
      const declared = declaredDefault(meta, isMac);
      const resolved = resolveActionDefaultChord(meta);
      if (declared === null) {
        expect(resolved, id).toBeNull();
        continue;
      }
      expect(resolved, id).toBe(canonicalChord(declared));
    }
  });

  it("has no duplicate resolved default across actions", () => {
    platformMock.mac = isMac;
    const holders = new Map<string, string>();
    for (const id of ACTION_IDS) {
      const meta = ACTION_META[id];
      if (meta.kind !== "chord") continue;
      const chord = resolveActionDefaultChord(meta);
      if (chord === null) continue;
      const holder = holders.get(chord);
      expect(
        holder,
        `${id} and ${holder ?? ""} both default to "${chord}"`,
      ).toBeUndefined();
      holders.set(chord, id);
    }
  });
});
