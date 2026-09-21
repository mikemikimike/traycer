import {
  DEFAULT_ARRANGEMENT,
  isAutomaticLimitSelection,
  ORDER_GROUP_IDS,
  type EdgeSide,
  type LayoutArrangement,
  type OrderGroupId,
  type StatusBarProviderLimitSelection,
  type UsageHost,
} from "@/lib/layout/layout-arrangement";
import { leftPanelGroupsFromRail } from "@/lib/layout/rail";
import {
  overrideKeys,
  sameFieldList,
  sameRegionValue,
  type LayoutValues,
} from "@/lib/layout/layout-values";
import {
  effectiveLayoutValues,
  PRESET_VALUES,
  type LayoutPresetId,
} from "@/lib/layout/layout-presets";
import type { RegionId } from "@/lib/layout/region-id";
import type { LayoutSnapshot } from "@/lib/layout/layout-snapshot";
import type { RateLimitProviderId } from "@/lib/rate-limit-providers";

/**
 * What is different from the base preset, and the way back.
 *
 * The scope is settled (C-11) and deliberately narrower than "everything a
 * user could have touched": a change is a VALUE that differs from the base
 * preset, an order group that is no longer in its default order, or a provider
 * switched off the strip. Presets are density-only (L-20), so putting the
 * arrangement back is a separate gesture and `resetToBase` leaves it alone.
 */

/** Which keys of one region differ from the base preset, in the patch's order. */
function changedKeys<K extends RegionId>(
  snapshot: LayoutSnapshot,
  region: K,
): ReadonlyArray<keyof LayoutValues[K] & string> {
  const patch = snapshot.overrides[region];
  if (patch === undefined) return [];
  const base = PRESET_VALUES[snapshot.basePreset][region];
  return overrideKeys(patch).filter(
    (key) => !sameRegionValue(key, patch[key], base[key]),
  );
}

/** Whether a region has anything to revert, which is what its dot draws. */
export function regionChanged(
  snapshot: LayoutSnapshot,
  region: RegionId,
): boolean {
  return changedKeys(snapshot, region).length > 0;
}

/**
 * The number the header reads out beside the preset name ("Compact + 3
 * changes"): one per changed VALUE, and nothing else (L-57).
 *
 * Values only, because the count has to agree with the button beside it:
 * "Reset to Compact" reverts exactly the delta this counts, and a count that
 * also carried the arrangement would leave changes behind after a reset that
 * claimed to clear them. An arrangement change is still a change a person
 * made - it earns a dot in the index and a revert on its own Position row
 * (`positionRowChanged`).
 */
export function changeCount(snapshot: LayoutSnapshot): number {
  // No re-minimizing: `overrides` is invariantly minimal, because every write
  // path into the store (`setRegionValues`, `setRegionValuesMany`,
  // `setBasePreset`, `replaceAll`) and every rehydrate ends in the same
  // resolver. Re-deriving it here allocated twenty-two objects on every filter
  // keystroke to confirm what the store already guarantees (G1-21).
  return Object.values(snapshot.overrides).reduce(
    (total: number, patch: object | undefined) =>
      total + (patch === undefined ? 0 : Object.keys(patch).length),
    0,
  );
}

/** Every order group whose order is no longer the default one. */
export function reorderedGroups(
  arrangement: LayoutArrangement,
): ReadonlyArray<OrderGroupId> {
  return ORDER_GROUP_IDS.filter(
    (group) =>
      !sameFieldList(orderIds(arrangement, group), defaultOrderIds(group)),
  );
}

/** Every value back to the base preset. Values only: the arrangement stays. */
export function resetToBase(snapshot: LayoutSnapshot): LayoutSnapshot {
  return { ...snapshot, overrides: {} };
}

// ── The floor (L-20's "Reset everything", P-6) ──────────────────────────────
//
// `changeCount` and `resetToBase` are deliberately values-only, and
// `positionRowChanged` covers the usage host, the two sides and the five order
// groups. That leaves three arrangement fields nothing measured and nothing
// put back - `hiddenProviders`, `providerLimits` and `mobileFooter` - so a
// page reading "Default" with no changes could have three providers hidden and
// the mobile footer off. The predicates below are what a changed dot and a
// per-row revert read; `resetEverything` is the floor under both, and it
// matters most on this host, which has no session and therefore no Undo.

/**
 * Whether one provider's stored selection differs from the shipped default.
 *
 * By DIFFERENCE rather than by presence: an entry equal to Automatic says
 * nothing the absence of one does not, and reading presence as change left a
 * provider the user had put back marked forever - down to offering "Reset
 * everything", a confirmed destructive action, on a layout nobody had changed
 * (R1-03). The writer no longer stores such an entry; a map rehydrated from an
 * older write still can, which is why the truth is measured here and not
 * assumed at the write.
 */
function limitsChanged(
  selection: StatusBarProviderLimitSelection | undefined,
): boolean {
  return selection !== undefined && !isAutomaticLimitSelection(selection);
}

/** Whether ONE provider has been hidden or had its limits picked (L-26, L-96). */
export function providerChanged(
  arrangement: LayoutArrangement,
  providerId: RateLimitProviderId,
): boolean {
  return (
    arrangement.hiddenProviders.includes(providerId) ||
    limitsChanged(arrangement.providerLimits[providerId])
  );
}

/** That provider back to shown, on Automatic, leaving every other one alone. */
export function revertProvider(
  arrangement: LayoutArrangement,
  providerId: RateLimitProviderId,
): LayoutArrangement {
  const providerLimits = { ...arrangement.providerLimits };
  delete providerLimits[providerId];
  return {
    ...arrangement,
    hiddenProviders: arrangement.hiddenProviders.filter(
      (entry) => entry !== providerId,
    ),
    providerLimits,
  };
}

/** Whether anything about the usage providers differs from what shipped. */
export function usageProvidersChanged(arrangement: LayoutArrangement): boolean {
  return (
    arrangement.hiddenProviders.length > 0 ||
    Object.values(arrangement.providerLimits).some((selection) =>
      limitsChanged(selection),
    ) ||
    reorderedGroups(arrangement).includes("usageProviders")
  );
}

/** Whether the strip is drawn on a narrow viewport against what shipped (L-51). */
export function mobileFooterChanged(arrangement: LayoutArrangement): boolean {
  return arrangement.mobileFooter !== DEFAULT_ARRANGEMENT.mobileFooter;
}

/** Whether ANY of where things live differs from the shipped arrangement. */
export function arrangementChanged(arrangement: LayoutArrangement): boolean {
  return (
    reorderedGroups(arrangement).length > 0 ||
    arrangement.usageHost !== DEFAULT_ARRANGEMENT.usageHost ||
    arrangement.minimapSide !== DEFAULT_ARRANGEMENT.minimapSide ||
    arrangement.resourceSide !== DEFAULT_ARRANGEMENT.resourceSide ||
    usageProvidersChanged(arrangement) ||
    mobileFooterChanged(arrangement)
  );
}

/**
 * Everything back to what shipped: the Default preset, no value overrides and
 * the shipped arrangement (L-20).
 *
 * `dividerSeq` is the one field that does NOT go back. It is the rail's
 * "only ever increases" counter, and handing out an id a removed divider once
 * held is the one way two entries in a list keyed by id can collide.
 */
export function resetEverything(snapshot: LayoutSnapshot): LayoutSnapshot {
  return {
    ...snapshot,
    basePreset: "default",
    overrides: {},
    arrangement: {
      ...DEFAULT_ARRANGEMENT,
      dividerSeq: Math.max(
        snapshot.arrangement.dividerSeq,
        DEFAULT_ARRANGEMENT.dividerSeq,
      ),
    },
  };
}

/** Whether a snapshot has anything at all for "Reset everything" to undo. */
export function anythingChanged(snapshot: LayoutSnapshot): boolean {
  return (
    snapshot.basePreset !== "default" ||
    changeCount(snapshot) > 0 ||
    arrangementChanged(snapshot.arrangement)
  );
}

/**
 * One order group's ids.
 *
 * The rail is read as its GROUPING rather than as its entries: divider ids are
 * issued from a counter that only ever increases, so a divider removed and
 * added back would leave the rail permanently "reordered" against a default it
 * draws identically to.
 */
function orderIds(
  arrangement: LayoutArrangement,
  group: OrderGroupId,
): ReadonlyArray<string> {
  switch (group) {
    case "dock":
      return arrangement.dock;
    case "toolbarLeft":
      return arrangement.toolbarLeft;
    case "toolbarRight":
      return arrangement.toolbarRight;
    case "rail":
      return leftPanelGroupsFromRail(arrangement.rail).flatMap(
        (railGroup, index): string[] =>
          index === 0
            ? [...railGroup.panelIds]
            : [GROUP_BOUNDARY, ...railGroup.panelIds],
      );
    case "usageProviders":
      return arrangement.usageProviders;
  }
}

/** Stands for a divider in the rail's comparable order. Not a panel id. */
const GROUP_BOUNDARY = "|";

function defaultOrderIds(group: OrderGroupId): ReadonlyArray<string> {
  return orderIds(DEFAULT_ARRANGEMENT, group);
}

// ── Analytics (L-46, L-54, L-55, tech-plan section 7) ───────────────────────
//
// `layout_snapshot` and `layout_editor_session`'s change summary are built
// here rather than assembled ad hoc at the firing site, for the same reason
// the rest of this file exists: the shape is the model's, not a door's, and a
// pure function is what a test can drive on real snapshots.

function snakeCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function layoutSettingPropertyName(region: string, key: string): string {
  return `layout_${snakeCase(region)}_${snakeCase(key)}`;
}

/**
 * Every `region.key` pair `LayoutValues` declares, walked off the shipped
 * Default rather than hand-listed: a leaf added to any region's value bag
 * widens `LayoutValues`, which is what `SHIPPED_DEFAULT_VALUES` (aka
 * `PRESET_VALUES.default`) is typed against, so this list - and the
 * `layout_<region>_<key>` property built from it - cannot drift from the
 * registry it describes without failing that assignment first.
 */
function layoutSettingEntries(): ReadonlyArray<{
  readonly region: RegionId;
  readonly key: string;
}> {
  const regions = Object.keys(PRESET_VALUES.default) as ReadonlyArray<RegionId>;
  return regions.flatMap((region) =>
    Object.keys(PRESET_VALUES.default[region]).map((key) => ({ region, key })),
  );
}

/**
 * A region's value bag has no compile-time index signature - `LayoutValues`
 * names each region's shape as its own interface, not `Record<RegionId,
 * ...>` - so reading a runtime-computed key off it generically cannot be a
 * cast: the union of every region's interface (`ContextUsageValues |
 * ModelValues | ...`) does not "sufficiently overlap" with `Record<string,
 * unknown>` for TypeScript's narrowing-cast check. `Reflect.get` reads it
 * without one.
 */
function regionSettingValue(regionValues: object, key: string): unknown {
  return Reflect.get(regionValues, key);
}

/**
 * Every `layout_<region>_<key>` property name `layout_snapshot` declares, in
 * the order {@link layoutSettingEntries} walks them. `lib/analytics.ts`
 * allowlists exactly this list, so the declared property set and the
 * registry it is built from cannot name a different set of settings.
 */
export const LAYOUT_SETTING_PROPERTY_KEYS: ReadonlyArray<string> =
  layoutSettingEntries().map(({ region, key }) =>
    layoutSettingPropertyName(region, key),
  );

/**
 * One setting's reported value (L-54, L-55): `"default"` at the shipped
 * Default, the literal value otherwise, `"true"`/`"false"` for a boolean leaf
 * and `"changed"` for the one list leaf (`pinnedFields`) - a scalar either
 * way, and never the list itself.
 */
function settingPropertyValue(
  key: string,
  value: unknown,
  defaultValue: unknown,
): string {
  if (sameRegionValue(key, value, defaultValue)) return "default";
  if (key === "pinnedFields") return "changed";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

/**
 * `layout_snapshot`'s whole payload (L-46, L-54, L-55, tech-plan section 7):
 * the ~40 per-setting properties, ALWAYS present so `STRICT_EVENTS` never
 * drops the event for a missing declared key, plus the base preset, how many
 * settings differ from it, three arrangement enums and five reorder
 * booleans. `shownProfiles`, `providerLimits`, `hiddenProviders` and
 * `limitKeys` never reach it because {@link layoutSnapshotProperties} is
 * built only from `LayoutValues` plus the five closed arrangement facts the
 * plan names - the BUILDER is what keeps them out, not this type (L-54,
 * C-41, G3-07).
 */
export interface LayoutSnapshotProperties {
  // The ~40 `layout_<region>_<key>` properties are always strings
  // (`settingPropertyValue`'s return type); this index signature has to
  // cover the explicit properties below it too, so it is their union rather
  // than `string` alone.
  //
  // It also means the property SET is a RUNTIME guarantee, not a type-level
  // one (G3-07): the names are built by walking the registry, TypeScript
  // cannot read literal keys out of that walk, and an index signature wide
  // enough for them is wide enough for any other key. What holds the payload
  // to exactly this set is `STRICT_EVENTS`'s key-count check in
  // `sanitizeAnalyticsProperties` plus the structural test in
  // `layout-analytics.test.ts`, which is also the only thing that would catch
  // a new arrangement field joining the payload. Do not read this type as the
  // guard.
  readonly [key: string]: string | number | boolean;
  readonly base_preset: LayoutPresetId;
  readonly changed_from_default_count: number;
  readonly layout_usage_host: UsageHost;
  readonly layout_minimap_side: EdgeSide;
  readonly layout_resource_side: EdgeSide;
  readonly layout_dock_reordered: boolean;
  readonly layout_toolbar_left_reordered: boolean;
  readonly layout_toolbar_right_reordered: boolean;
  readonly layout_rail_reordered: boolean;
  readonly layout_usage_providers_reordered: boolean;
}

/** `layout_snapshot`'s payload, built from a whole snapshot. */
export function layoutSnapshotProperties(
  snapshot: LayoutSnapshot,
): LayoutSnapshotProperties {
  const values = effectiveLayoutValues(snapshot.basePreset, snapshot.overrides);
  const defaults = PRESET_VALUES.default;
  let changedFromDefaultCount = 0;
  const settingEntries = layoutSettingEntries().map(({ region, key }) => {
    const propertyValue = settingPropertyValue(
      key,
      regionSettingValue(values[region], key),
      regionSettingValue(defaults[region], key),
    );
    if (propertyValue !== "default") changedFromDefaultCount += 1;
    return [layoutSettingPropertyName(region, key), propertyValue] as const;
  });
  const reordered = new Set(reorderedGroups(snapshot.arrangement));
  return {
    // Built from the same walk `LAYOUT_SETTING_PROPERTY_KEYS` is, so this is
    // exactly that key set with a value per key - the structural test in
    // `layout-analytics.test.ts` is what proves it rather than a second cast.
    ...(Object.fromEntries(settingEntries) as Record<string, string>),
    base_preset: snapshot.basePreset,
    changed_from_default_count: changedFromDefaultCount,
    layout_usage_host: snapshot.arrangement.usageHost,
    layout_minimap_side: snapshot.arrangement.minimapSide,
    layout_resource_side: snapshot.arrangement.resourceSide,
    layout_dock_reordered: reordered.has("dock"),
    layout_toolbar_left_reordered: reordered.has("toolbarLeft"),
    layout_toolbar_right_reordered: reordered.has("toolbarRight"),
    layout_rail_reordered: reordered.has("rail"),
    layout_usage_providers_reordered: reordered.has("usageProviders"),
  };
}

export type LayoutDurationBucket =
  | "under_10s"
  | "10s_to_1m"
  | "1m_to_5m"
  | "over_5m";

/**
 * Buckets a millisecond duration for `layout_editor_session`'s two duration
 * properties. Its own scale rather than the app-wide `duration_bucket`
 * allowlist (`under_10s | 10_to_30s | over_30s`): an editor session routinely
 * outruns that ceiling (C-42).
 */
export function layoutDurationBucket(durationMs: number): LayoutDurationBucket {
  if (durationMs < 10_000) return "under_10s";
  if (durationMs < 60_000) return "10s_to_1m";
  if (durationMs < 300_000) return "1m_to_5m";
  return "over_5m";
}

/**
 * Every region whose EFFECTIVE value bag differs between two snapshots -
 * what a session actually touched, independent of which base preset each
 * snapshot carries (a preset switch mid-session still counts as touching
 * whatever it visibly changed).
 */
export function touchedRegionIds(
  from: LayoutSnapshot,
  to: LayoutSnapshot,
): ReadonlyArray<RegionId> {
  const fromValues = effectiveLayoutValues(from.basePreset, from.overrides);
  const toValues = effectiveLayoutValues(to.basePreset, to.overrides);
  const regions = Object.keys(PRESET_VALUES.default) as ReadonlyArray<RegionId>;
  return regions.filter(
    (region) =>
      JSON.stringify(fromValues[region]) !== JSON.stringify(toValues[region]),
  );
}

export interface LayoutEditorSessionChangeSummary {
  readonly changedCount: number;
  readonly regionsTouchedCount: number;
}

/**
 * `layout_editor_session`'s value-change facts (L-46, L-54, L-57):
 * `changedCount` is {@link changeCount} at exit - the same delta "Reset to
 * <preset>" reverts - and `regionsTouchedCount` is the distinct regions that
 * moved between the session's entry snapshot and its exit snapshot.
 */
export function layoutEditorSessionChangeSummary(
  entrySnapshot: LayoutSnapshot,
  exitSnapshot: LayoutSnapshot,
): LayoutEditorSessionChangeSummary {
  return {
    changedCount: changeCount(exitSnapshot),
    regionsTouchedCount: touchedRegionIds(entrySnapshot, exitSnapshot).length,
  };
}
