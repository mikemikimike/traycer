import { describe, expect, it } from "vitest";
import {
  regionValuesHidden,
  type AccessValues,
} from "@/lib/layout/layout-values";
import { PRESET_VALUES } from "@/lib/layout/layout-presets";
import { resolvePersistedOverrides } from "@/lib/layout/layout-values-persist";
import type { RegionId } from "@/lib/layout/region-id";

describe("regionValuesHidden", () => {
  it("is true for a value bag whose shown is hidden", () => {
    expect(regionValuesHidden({ shown: "hidden", size: "full" })).toBe(true);
  });

  it("is false for a value bag whose shown is shown", () => {
    expect(regionValuesHidden({ shown: "shown", size: "full" })).toBe(false);
  });

  it("is false, never throws, for a value bag with no shown leaf at all", () => {
    const access: AccessValues = { size: "chip" };
    expect(regionValuesHidden(access)).toBe(false);
  });
});

describe("HideableRegionId (checked indirectly, since it is a compile-time type)", () => {
  it("access and model are the only regions whose default value bag has no shown leaf", () => {
    const regionIds = Object.keys(
      PRESET_VALUES.default,
    ) as ReadonlyArray<RegionId>;
    const unhideable = regionIds.filter(
      (id) => !("shown" in PRESET_VALUES.default[id]),
    );
    expect(unhideable.sort()).toEqual(["access", "model"]);
  });
});

describe("resolvePersistedOverrides drops a legacy shown on Access/Model", () => {
  it("resolves a stored access record to size alone", () => {
    const overrides = resolvePersistedOverrides({
      access: { shown: "hidden", size: "chip" },
    });
    expect(overrides.access).toEqual({ size: "chip" });
  });

  it("resolves a stored model record to style alone", () => {
    const overrides = resolvePersistedOverrides({
      model: { shown: "hidden", style: "bars" },
    });
    expect(overrides.model).toEqual({ style: "bars" });
  });
});
