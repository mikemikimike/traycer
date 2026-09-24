import type { ReactNode } from "react";
import {
  type AppFrame,
  AppFrameComposerStack,
  AppFrameStatusBarRow,
} from "@/components/layout-editor/inspector/app-frame-chrome";
import { RevertButton } from "@/components/layout-editor/inspector/inspector-row";
import { ProviderLimitsControl } from "@/components/layout-editor/inspector/provider-level";
import { RegionDisplayControl } from "@/components/layout-editor/inspector/region-controls";
import { revertControlValues } from "@/components/layout-editor/inspector/region-control-io";
import { GrammarRowView } from "@/components/layout-editor/inspector/region-section";
import {
  OrderGroupHeader,
  OrderGroupList,
} from "@/components/layout-editor/inspector/rows/order-group-list";
import {
  BARE_ROW,
  regionRowItems,
  type SortableRowDecoration,
} from "@/components/layout-editor/inspector/rows/order-row-items";
import { SegmentedControl } from "@/components/layout-editor/inspector/segmented-control";
import { SortableList } from "@/components/layout-editor/inspector/sortable-list";
import { useSortableRowPadding } from "@/components/layout-editor/inspector/sortable-row-padding";
import {
  isRailRegionId,
  toggleHiddenProvider,
} from "@/components/layout-editor/layout-gestures";
import { depictRegion } from "@/components/layout-editor/region-depiction";
import { LAYOUT_REGIONS } from "@/components/layout-editor/regions/layout-regions";
import {
  LAYOUT_REGION_LIST,
  regionFacts,
  type AnyGrammarRow,
} from "@/components/layout-editor/regions/region-facts";
import { regionMatchesFilter } from "@/components/layout-editor/regions/region-filter-match";
import {
  SURFACE_GROUPS,
  type SurfaceGroupId,
} from "@/components/layout-editor/regions/region-grammar";
import { Button } from "@/components/ui/button";
import {
  regionPositionMoved,
  revertPositionRow,
} from "@/components/layout-editor/regions/region-position-rows";
import {
  looseSurfaceRegions,
  surfaceHasBand,
  SURFACE_ORDER_GROUPS,
} from "@/components/layout-editor/regions/surface-groups";
import { writeArrangement } from "@/lib/layout/arrangement-gestures";
import {
  providerChanged,
  regionChanged,
  reorderedGroups,
  revertProvider,
  usageProvidersChanged,
} from "@/lib/layout/layout-diff";
import {
  DEFAULT_ARRANGEMENT,
  statusBarHostsAnyRegion,
  type LayoutArrangement,
  type OrderGroupId,
} from "@/lib/layout/layout-arrangement";
import { effectiveLayoutValues } from "@/lib/layout/layout-presets";
import type { LayoutSnapshot } from "@/lib/layout/layout-snapshot";
import type { LayoutValues } from "@/lib/layout/layout-values";
import { providerDisplayName } from "@/lib/provider-ordering";
import type { RateLimitProviderId } from "@/lib/rate-limit-providers";
import type { RegionId } from "@/lib/layout/region-id";
import { cn } from "@/lib/utils";
import { useLayoutStore } from "@/stores/layout/layout-store";

/**
 * One SURFACE's card body on the full-width host (L-92, L-95, L-118).
 *
 * The inspector can filter, because something is selected; the page has to
 * group, so the section is the surface and the region is a ROW inside it. That
 * one move deletes every repeat the owner found: the sidebar's nine identical
 * Position lists become ONE list of nine rows, the composer's eight become
 * three lists, and each shared control - the reorder instruction, "Add
 * divider", the pinned-right note, the usage host - has exactly one place to
 * live once the group itself is the section.
 *
 * **The page draws at most one picture per card, and only where the picture
 * carries something the rows cannot** (L-120, redesign 3.2). Sidebar, Top bar
 * and Chat draw none: the Sidebar's assembled shape IS its list order, and
 * each of its rows carries the real rail button as its glyph, so the 660px
 * plinth the owner named is deleted rather than shrunk. Composer and Status
 * bar keep one flush band each, in the house's own inset-card shape rather
 * than on a lit plinth - `SpecimenStage` is the DOCK's grammar now (L-09 as
 * narrowed by L-128).
 *
 * The L-08 grammar survives inside a row: Shown and Size are ONE segmented
 * control (L-121), Position IS the row's place in its list, and Side, Style
 * and Fine-tune open behind the row's own disclosure - one level deep and
 * never off the page, which is L-89 satisfied by never leaving it.
 *
 * Nothing here is a second form. The lists are the `OrderGroupList` the
 * inspector draws with `selectedId={regionId}`, asked for the same group with
 * `selectedId: null`; the controls are the ones the section header uses; the
 * writes are `layout-gestures.ts` and `region-control-io.ts` (L-03).
 */
export function SurfaceSection(props: {
  readonly surface: SurfaceGroupId;
  readonly snapshot: LayoutSnapshot;
  readonly filter: string;
  /** Which rows have their disclosure open, owned by the page (L-89). */
  readonly openRows: ReadonlyArray<string>;
  readonly onToggleRow: (rowId: string) => void;
  /**
   * The surface's own rows, which belong to no region (D7, L-51), or `null`
   * for a surface that has none - which is also what tells the card whether
   * its first list has anything above it to be ruled off from.
   */
  readonly surfaceRows: ReactNode | null;
}): ReactNode {
  const { surface, snapshot, filter, openRows, onToggleRow, surfaceRows } =
    props;
  const values = effectiveLayoutValues(snapshot.basePreset, snapshot.overrides);
  const arrangement = snapshot.arrangement;
  const gutter = useSortableRowPadding();

  function decorate(id: string): SortableRowDecoration {
    const regionId = asRegionId(id);
    if (regionId === null) {
      return providerRowDecoration(id, arrangement, openRows, onToggleRow);
    }
    const changed = regionRowChanged(snapshot, regionId);
    const hint = regionFacts(regionId).hint;
    // A disclosure only where opening it shows something: the region's own
    // detail rows, or its presence rule. Most regions have neither, and a
    // chevron that opened an empty box was the no-op the owner found (G6).
    const discloses = hint !== null || regionDetailRows(regionId).length > 0;
    return {
      ...BARE_ROW,
      changed,
      hint,
      // The Sidebar's rows ARE the picture the card used to draw above them
      // (L-120): the rail's own button, at 1:1, through the one entry point
      // every depiction goes through (L-77). No other list gets one - their
      // depictions are either too wide to be a glyph or already in the
      // surface's band - and the list wraps it `inert` and dims it.
      glyph: isRailRegionId(regionId)
        ? depictRegion(regionId, values[regionId], arrangement)
        : null,
      control: <RegionDisplayControl regionId={regionId} values={values} />,
      revert: changed ? (
        <RevertButton
          label={`Revert ${regionFacts(regionId).name}`}
          onRevert={() => {
            revertRegion(snapshot, regionId);
          }}
        />
      ) : null,
      detail: discloses ? (
        <RegionRowDetail
          regionId={regionId}
          snapshot={snapshot}
          values={values}
          filter={filter}
        />
      ) : null,
      open: discloses && openRows.includes(id),
      onToggleOpen: discloses
        ? () => {
            onToggleRow(id);
          }
        : null,
    };
  }

  const loose = looseSurfaceRegions(surface).filter((regionId) =>
    regionMatchesFilter(regionId, filter),
  );
  const groups = SURFACE_ORDER_GROUPS[surface].filter(
    (group) => groupMatchesFilter(group, filter) && groupIsDrawn(group, values),
  );
  const band = surfaceBand(surface, values, arrangement);

  return (
    <div className="flex flex-col">
      {band === null ? null : (
        // The house's own inset-card shape, borrowed verbatim from
        // `SettingsSubgroup`, in the row gutter so the picture sits in the
        // same column as the rows under it. `bg-foreground/3` rather than
        // `bg-card` or `bg-muted`, both of which collapse onto the surrounding
        // card in every preset dark theme (the reason `AppFrameComposerBox`
        // already uses it). `min-w-0 max-w-full` is R2-07's fix: an over-wide
        // surface shrinks to the band and clips on the RIGHT only, under
        // `HostContextFrame`'s existing mask fade, instead of overflowing a
        // centred line in both directions and losing its leading edge.
        // The gutter's own vertical padding is a ROW's; a band sits a little
        // prouder at the top of the card and closer to the rows it describes,
        // so the two `py` classes are displaced AFTER it rather than before.
        <div className={cn(gutter.row, "pt-4 pb-1")}>
          <div
            data-testid="surface-band"
            className="min-w-0 max-w-full overflow-hidden rounded-lg border border-border/60 bg-foreground/3 px-3 py-2.5"
          >
            {band}
          </div>
        </div>
      )}
      {surfaceRows}
      {loose.length === 0 ? null : (
        <SortableList
          label={`${surfaceLabel(surface)} settings`}
          selectedId={null}
          items={regionRowItems(loose, values, decorate)}
          onMove={null}
        />
      )}
      {groups.map((group, index) => (
        <SurfaceOrderList
          key={group}
          group={group}
          snapshot={snapshot}
          values={values}
          decorate={decorate}
          ruled={
            band !== null ||
            surfaceRows !== null ||
            loose.length > 0 ||
            index > 0
          }
        />
      ))}
    </div>
  );
}

/**
 * The picture a surface card opens with, or `null` for the three that draw
 * none (L-120).
 *
 * The composer runs horizontally and the strip is a strip, so both bands are
 * one row of the real thing at 1:1 - the same `app-frame-chrome.tsx` the
 * preset miniatures draw from, so the two pictures cannot disagree about the
 * app (R1-04).
 */
function surfaceBand(
  surface: SurfaceGroupId,
  values: LayoutValues,
  arrangement: LayoutArrangement,
): ReactNode {
  if (!surfaceHasBand(surface)) return null;
  if (surface === "composer") {
    return <AppFrameComposerStack values={values} arrangement={arrangement} />;
  }
  return <StatusBarBand values={values} arrangement={arrangement} />;
}

/**
 * The status strip, or the line that says where it went: the strip is not
 * drawn at all once BOTH of its readings have moved up, which each of them
 * decides for itself (L-51, L-156).
 */
function StatusBarBand({ values, arrangement }: AppFrame): ReactNode {
  if (!statusBarHostsAnyRegion(arrangement)) {
    return (
      <p className="text-ui-sm text-muted-foreground">
        Both of these are in the top bar, so there is no status bar to draw.
      </p>
    );
  }
  return (
    <div className="flex h-6 w-full min-w-0 items-center gap-3">
      <AppFrameStatusBarRow values={values} arrangement={arrangement} />
    </div>
  );
}

/**
 * A list is shown whole or not at all.
 *
 * Filtering the MEMBERS of a list a drag reorders would be a lie: what the
 * user dropped a row between would not be what it landed between. So the
 * filter decides whether the list is drawn, and the list then draws every
 * member of its group.
 */
function groupMatchesFilter(group: OrderGroupId, filter: string): boolean {
  // The providers list has no member REGION - a provider is a reading, not a
  // region - so `regionMatchesFilter` answers nothing for its rows and the
  // list would vanish under any filter at all. It belongs to Usage limits, so
  // it follows that region's match, which is also the answer a person typing
  // "limits" or "usage" expects.
  if (group === "usageProviders") {
    return regionMatchesFilter("usageLimits", filter);
  }
  return LAYOUT_REGION_LIST.some(
    (region) =>
      region.rows.some(
        (row) => row.kind === "position-order" && row.group === group,
      ) && regionMatchesFilter(region.id, filter),
  );
}

/**
 * Whether the list's own subject is on screen at all.
 *
 * The providers are the segments of ONE region, so a Providers list under a
 * hidden Usage limits row would be a list of parts of something that is not
 * there (redesign 5.4). Every other group is always drawn.
 */
function groupIsDrawn(group: OrderGroupId, values: LayoutValues): boolean {
  return group !== "usageProviders" || values.usageLimits.shown === "shown";
}

/**
 * One order group as a headed list: the list's name, how it is operated, and
 * the group's own revert, in the house's row shape (L-127).
 *
 * `text-overline uppercase` is used zero times elsewhere in the settings tree,
 * and the pinned-right note used to be drawn UNDER the list where it read as a
 * footnote to the card rather than as a rule about this list - both fixed by
 * making the header a row like every other row on the page (redesign 4.8,
 * LV2-18).
 *
 * The revert belongs to the GROUP rather than to each member, because putting
 * a group back is what `revertPositionRow` has always done for a
 * `position-order` row - and the row it used to hang on does not exist on this
 * host. A member's own dot still says whether THAT member moved. It is drawn
 * with a visible label instead of an unlabelled glyph floating at the card's
 * right edge, and every list that can be reordered gets one, which the
 * Composer's three did not (LV2-18).
 */
function SurfaceOrderList(props: {
  readonly group: OrderGroupId;
  readonly snapshot: LayoutSnapshot;
  readonly values: LayoutValues;
  readonly decorate: (id: string) => SortableRowDecoration;
  /** Whether anything precedes this list inside the card. */
  readonly ruled: boolean;
}): ReactNode {
  const { group, snapshot, values, decorate, ruled } = props;
  const arrangement = snapshot.arrangement;
  const moved = reorderedGroups(arrangement).includes(group);
  return (
    <div className="flex flex-col">
      {/* The rules are the CARD's - where this list sits among the card's other
        blocks - so they stay here while the header's own shape is the one
        component both hosts compose (R3-11). */}
      <div
        className={cn(
          "border-b border-border/40",
          ruled && "border-t border-border/40",
        )}
      >
        <OrderGroupHeader
          group={group}
          action={
            moved ? (
              <Button
                type="button"
                variant="muted"
                size="sm"
                onClick={() => {
                  writeArrangement(revertedOrderGroup(group, arrangement));
                }}
              >
                Revert order
              </Button>
            ) : null
          }
        />
      </div>
      <OrderGroupList
        group={group}
        selectedId={null}
        values={values}
        arrangement={arrangement}
        onOpenProvider={null}
        decorate={decorate}
      />
    </div>
  );
}

/**
 * A group put back through the one seam that knows how: any region whose
 * Position row names this group reverts the whole list, because that is what a
 * `position-order` revert has always meant (L-57).
 */
function revertedOrderGroup(
  group: OrderGroupId,
  arrangement: LayoutArrangement,
): LayoutArrangement {
  // The providers list is the one group no region declares, so its revert is
  // stated here rather than reached through a member.
  if (group === "usageProviders") {
    return {
      ...arrangement,
      usageProviders: DEFAULT_ARRANGEMENT.usageProviders,
    };
  }
  const member = LAYOUT_REGION_LIST.find((region) =>
    region.rows.some(
      (row) => row.kind === "position-order" && row.group === group,
    ),
  );
  return member === undefined
    ? arrangement
    : revertPositionRow(arrangement, member.id);
}

/**
 * One provider row: its `Shown | Hidden` state, its changed dot and revert,
 * and its own Limits pick as the row's disclosure (L-123).
 *
 * Two levels instead of five. The stage and the icon-tile header that
 * `ProviderLevel` draws in the dock are not repeated here, because the row
 * above the disclosure already names the provider and carries its state.
 */
function providerRowDecoration(
  id: string,
  arrangement: LayoutArrangement,
  openRows: ReadonlyArray<string>,
  onToggleRow: (rowId: string) => void,
): SortableRowDecoration {
  const providerId = usageProviderId(arrangement, id);
  if (providerId === null) return BARE_ROW;
  const changed = providerChanged(arrangement, providerId);
  const name = providerDisplayName(providerId);
  return {
    ...BARE_ROW,
    changed,
    control: <ProviderDisplayControl providerId={providerId} />,
    revert: changed ? (
      <RevertButton
        label={`Revert ${name}`}
        onRevert={() => {
          writeArrangement(revertProvider(arrangement, providerId));
        }}
      />
    ) : null,
    detail: <ProviderLimitsControl providerId={providerId} />,
    open: openRows.includes(id),
    onToggleOpen: () => {
      onToggleRow(id);
    },
  };
}

/**
 * A provider's `Shown | Hidden`, in the same segmented shape every other row
 * on this page uses (L-121). The dock's level writes the same
 * `hiddenProviders` field through a switch, which is the grammar the owner
 * approved there (L-128).
 */
function ProviderDisplayControl(props: {
  readonly providerId: RateLimitProviderId;
}): ReactNode {
  const { providerId } = props;
  const arrangement = useLayoutStore((state) => state.arrangement);
  const shown = !arrangement.hiddenProviders.includes(providerId);
  return (
    <SegmentedControl
      ariaLabel={`${providerDisplayName(providerId)} display`}
      options={PROVIDER_DISPLAY_OPTIONS}
      value={shown ? "shown" : "hidden"}
      onChange={(next) => {
        toggleHiddenProvider(providerId, arrangement, next === "shown");
      }}
    />
  );
}

const PROVIDER_DISPLAY_OPTIONS = [
  { value: "shown", label: "Shown" },
  { value: "hidden", label: "Hidden" },
];

/**
 * The row's id back as a provider id, by looking it up in the list it came
 * from - the same narrowing-by-selection the order lists use, rather than a
 * predicate that only says an arbitrary string is one (G1-23).
 */
function usageProviderId(
  arrangement: LayoutArrangement,
  id: string,
): RateLimitProviderId | null {
  return arrangement.usageProviders.find((entry) => entry === id) ?? null;
}

/**
 * What the row's disclosure opens: Side, Style and Fine-tune.
 *
 * Side moved OFF the row's line (redesign 4.1): a region's place on its
 * surface is a Position fact, and Position already lives in the list or in the
 * disclosure everywhere else - it was the third control on the two rows that
 * could least afford one. The providers list left the disclosure altogether
 * (L-123), which is what took a provider's limits from five levels to two.
 */
function RegionRowDetail(props: {
  readonly regionId: RegionId;
  readonly snapshot: LayoutSnapshot;
  readonly values: LayoutValues;
  readonly filter: string;
}): ReactNode {
  const { regionId, snapshot, values, filter } = props;
  const rows = regionDetailRows(regionId);
  if (rows.length === 0) return null;
  return (
    <div>
      {rows.map((row) => (
        <GrammarRowView
          key={row.kind}
          row={row}
          regionId={regionId}
          values={values}
          arrangement={snapshot.arrangement}
          snapshot={snapshot}
          filter={filter}
          onOpenProvider={null}
          // The page has never greyed a hidden region's disclosure: the row's
          // own Shown control, one line up, already says it is off.
          regionHidden={false}
        />
      ))}
    </div>
  );
}

/**
 * The grammar rows a row's disclosure owns.
 *
 * Everything else is drawn by the row itself or by the card: `size` and
 * `shown` are the row's one display control (L-121), `position-order` IS the
 * list the row sits in, and `children` is the Providers list the card draws as
 * a sibling (L-123).
 *
 * `position-host` is a detail row because the bar is a per-REGION pick
 * (L-156): each reading names its own, so there is no surface-tier row above
 * the list that could answer for both.
 */
const DETAIL_ROW_KINDS: ReadonlyArray<string> = [
  "position-host",
  "position-side",
  "style",
  "fine-tune",
];

function regionDetailRows(regionId: RegionId): ReadonlyArray<AnyGrammarRow> {
  // Annotated rather than inferred: indexing the registry with a UNION of ids
  // gives a union of arrays, and a `filter` on one of those has no single
  // callable signature. `AnyGrammarRow` is the registry's own name for the
  // union of their elements.
  const declared: ReadonlyArray<AnyGrammarRow> = LAYOUT_REGIONS[regionId].rows;
  return declared.filter((row) => DETAIL_ROW_KINDS.includes(row.kind));
}

/**
 * Whether this region differs from what shipped, in any of the three ways it
 * can - its values, where it sits, or (for Usage limits) the providers it
 * draws, which is arrangement state nothing on this page measured before
 * (P-6, P-7).
 */
function regionRowChanged(
  snapshot: LayoutSnapshot,
  regionId: RegionId,
): boolean {
  return (
    regionChanged(snapshot, regionId) ||
    regionPositionMoved(snapshot, regionId) ||
    (regionId === "usageLimits" && usageProvidersChanged(snapshot.arrangement))
  );
}

/** This region back to what shipped: its values, and then where it sits. */
function revertRegion(snapshot: LayoutSnapshot, regionId: RegionId): void {
  const override = snapshot.overrides[regionId];
  if (override !== undefined) {
    revertControlValues(regionId, Object.keys(override));
  }
  if (regionPositionMoved(snapshot, regionId)) {
    writeArrangement(revertPositionRow(snapshot.arrangement, regionId));
  }
}

/**
 * A row id back as a region id, by asking the registry rather than asserting.
 * Divider rows answer `null` and stay undecorated; a provider id answers
 * `null` here and is decorated as a provider instead.
 */
function asRegionId(id: string): RegionId | null {
  return LAYOUT_REGION_LIST.find((region) => region.id === id)?.id ?? null;
}

/** The card's own heading, for the `role="group"` around a list with no name. */
function surfaceLabel(surface: SurfaceGroupId): string {
  return SURFACE_GROUPS.find((group) => group.id === surface)?.label ?? "";
}
