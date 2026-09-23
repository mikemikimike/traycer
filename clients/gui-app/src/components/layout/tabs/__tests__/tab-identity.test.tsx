import { describe, expect, it } from "vitest";
import { tabAutoTint } from "../tab-identity";

/** The exact hue set D11 allows: greens through cyans, then violets through
 * magentas - amber, red and the info blue are left out. */
const ALLOWED_HUES = new Set([
  125, 140, 155, 170, 185, 200, 280, 295, 310, 325,
]);
const FORBIDDEN_HUE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0, 60], // red/amber
  [210, 260], // the info blue range
];

function hueOf(tint: string): number {
  const match = /oklch\([\d.]+ [\d.]+ (\d+)\)/.exec(tint);
  if (match === null) throw new Error(`no oklch hue in ${tint}`);
  return Number(match[1]);
}

describe("tabAutoTint", () => {
  it("is stable for the same epic id", () => {
    const first = tabAutoTint("epic-123");
    const second = tabAutoTint("epic-123");
    expect(first).toBe(second);
  });

  it("differs across most distinct epic ids", () => {
    const ids = Array.from({ length: 30 }, (_, index) => `epic-${index}`);
    const tints = new Set(ids.map((id) => tabAutoTint(id)));
    // A 10-hue set over 30 ids must collide sometimes; the point is that it is
    // not the SAME tint for everything.
    expect(tints.size).toBeGreaterThan(1);
  });

  it("returns a light-dark() oklch pair", () => {
    const tint = tabAutoTint("epic-abc");
    expect(tint).toMatch(
      /^light-dark\(oklch\([\d.]+ [\d.]+ \d+\), oklch\([\d.]+ [\d.]+ \d+\)\)$/,
    );
  });

  it("never picks a hue outside the allowed set", () => {
    for (let index = 0; index < 200; index += 1) {
      const hue = hueOf(tabAutoTint(`epic-${String(index)}`));
      expect(ALLOWED_HUES.has(hue)).toBe(true);
      for (const [from, to] of FORBIDDEN_HUE_RANGES) {
        expect(hue < from || hue > to).toBe(true);
      }
    }
  });

  it("uses the same hue for both the light and dark oklch calls", () => {
    const tint = tabAutoTint("epic-xyz");
    const hues = [...tint.matchAll(/oklch\([\d.]+ [\d.]+ (\d+)\)/g)].map(
      (match) => match[1],
    );
    expect(hues).toHaveLength(2);
    expect(hues[0]).toBe(hues[1]);
  });
});
