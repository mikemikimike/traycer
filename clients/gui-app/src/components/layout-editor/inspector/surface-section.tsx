import type { ReactNode } from "react";
import { RevertButton } from "@/components/layout-editor/inspector/inspector-row";
import {
  RegionShownControl,
  RegionSideControl,
  RegionSizeControl,
} from "@/components/layout-editor/inspector/region-controls";
import { revertControlValues } from "@/components/layout-editor/inspector/region-control-io";
import { GrammarRowView } from "@/components/layout-editor/inspector/region-section";
import { OrderGroupList } from "@/components/layout-editor/inspector/rows/order-group-list";
import {
  BARE_ROW,
  regionRowItems,
  type SortableRowDecoration,
} from "@/components/layout-editor/inspector/rows/order-row-items";
import { SortableList } from "@/components/layout-editor/inspector/sortable-list";
import { SurfaceSpecimen } from "@/components/layout-editor/inspector/surface-specimen";
import { writeArrangement } from "@/components/layout-editor/layout-gestures";
import { LAYOUT_REGIONS } from "@/components/layout-editor/regions/layout-regions";
import {
  LAYOUT_REGION_LIST,
  regionFacts,
  type AnyGrammarRow,
} from "@/components/layout-editor/regions/region-facts";
import { regionMatchesFilter } from "@/components/layout-editor/regions/region-filter-match";
import type { SurfaceGroupId } from "@/components/layout-editor/regions/region-grammar";
import {
  regionPositionMoved,
  revertPositionRow,
} from "@/components/layout-editor/regions/region-position-rows";
import {
  looseSurfaceRegions,
  ORDER_GROUPS,
  surfaceHasSpecimen,
  SURFACE_ORDER_GROUPS,
} from "@/components/layout-editor/regions/surface-groups";
import {
  regionChanged,
  reorderedGroups,
  usageProvidersChanged,
} from "@/lib/layout/layout-diff";
import type {
  LayoutArrangement,
  OrderGroupId,
} from "@/lib/layout/layout-arrangement";
import { effectiveLayoutValues } from "@/lib/layout/layout-presets";
import type { LayoutSnapshot } from "@/lib/layout/layout-snapshot";
import type { LayoutValues } from "@/lib/layout/layout-values";
import type { RegionId } from "@/lib/layout/region-id";
import { cn } from "@/lib/utils";

/**
 * One SURFACE's card body on the full-width host (L-92, L-95).
 *
 * The inspector can filter, because something is selected; the page has to
 * group, so the section is the surface and the region is a ROW inside it. That
 * one move deletes every repeat the owner found: the sidebar's nine identical
 * Position lists become ONE list of nine rows, the composer's eight become
 * three lists, and each shared control - the reorder instruction, "Add
 * divider", the pinned-right note, the usage host - has exactly one place to
 * live once the group itself is the section.
 *
 * The L-08 grammar survives inside a row: the stage is now the surface's,
 * Shown and Size sit inline because they are one control each, Position IS the
 * row's place in its list, and Style, Fine-tune and the providers list open
 * behind the row's own disclosure - one level deep and never off the page,
 * which is L-89 satisfied by never leaving it.
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

  function decorate(id: string): SortableRowDecoration {
    const regionId = asRegionId(id);
    if (regionId === null) return BARE_ROW;
    return {
      changed: regionRowChanged(snapshot, regionId),
      hint: regionFacts(regionId).hint,
      control: (
        <RegionRowControls
          regionId={regionId}
          snapshot={snapshot}
          values={values}
        />
      ),
      detail: (
        <RegionRowDetail
          regionId={regionId}
          snapshot={snapshot}
          values={values}
          filter={filter}
        />
      ),
      open: openRows.includes(id),
      onToggleOpen: () => {
        onToggleRow(id);
      },
    };
  }

  const loose = looseSurfaceRegions(surface).filter((regionId) =>
    regionMatchesFilter(regionId, filter),
  );
  const groups = SURFACE_ORDER_GROUPS[surface].filter((group) =>
    groupMatchesFilter(group, filter),
  );
  // Chat has no picture faithful enough to draw and no surface rows, so its
  // first list is the top of the card and must not be ruled off from nothing.
  const ruledFromTop = surfaceHasSpecimen(surface) || surfaceRows !== null;

  return (
    <div className="flex flex-col">
      <SurfaceSpecimen
        surface={surface}
        values={values}
        arrangement={arrangement}
      />
      {surfaceRows}
      {loose.length === 0 ? null : (
        <div
          className={cn(
            "px-3.5 py-3",
            ruledFromTop && "border-t border-border",
          )}
        >
          <SortableList
            selectedId={null}
            items={regionRowItems(loose, values, decorate)}
            onMove={null}
          />
        </div>
      )}
      {groups.map((group) => (
        <SurfaceOrderList
          key={group}
          group={group}
          snapshot={snapshot}
          values={values}
          decorate={decorate}
          ruled={ruledFromTop || loose.length > 0 || group !== groups[0]}
        />
      ))}
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
  return LAYOUT_REGION_LIST.some(
    (region) =>
      region.rows.some(
        (row) => row.kind === "position-order" && row.group === group,
      ) && regionMatchesFilter(region.id, filter),
  );
}

/**
 * One order group as a headed list, with the group's own revert beside its
 * name.
 *
 * The revert belongs to the GROUP rather than to each member, because putting
 * a group back is what `revertPositionRow` has always done for a
 * `position-order` row - and the row it used to hang on does not exist on this
 * host. A member's own dot still says whether THAT member moved.
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
  const facts = ORDER_GROUPS[group];
  const arrangement = snapshot.arrangement;
  const moved = reorderedGroups(arrangement).includes(group);
  return (
    <div className={cn("px-3.5 py-3", ruled && "border-t border-border")}>
      <div className="mb-2 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          {facts.label === null ? null : (
            <div className="text-overline text-muted-foreground uppercase">
              {facts.label}
            </div>
          )}
          <p className="text-ui-sm text-muted-foreground">
            {facts.description}
          </p>
        </div>
        {moved ? (
          <RevertButton
            label={`Revert ${facts.label ?? "order"}`}
            onRevert={() => {
              writeArrangement(revertedOrderGroup(group, arrangement));
            }}
          />
        ) : null}
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
 * A region's inline controls, in L-08's order with Position taken out - on
 * this host Position is the row.
 */
function RegionRowControls(props: {
  readonly regionId: RegionId;
  readonly snapshot: LayoutSnapshot;
  readonly values: LayoutValues;
}): ReactNode {
  const { regionId, snapshot, values } = props;
  const rows = regionFacts(regionId).rows;
  const hasSide = rows.some((row) => row.kind === "position-side");
  const hasSize = rows.some((row) => row.kind === "size");
  return (
    <>
      {hasSide ? (
        <RegionSideControl
          regionId={regionId}
          arrangement={snapshot.arrangement}
        />
      ) : null}
      {hasSize ? (
        <RegionSizeControl
          regionId={regionId}
          regionValues={values[regionId]}
        />
      ) : null}
      <RegionShownControl regionId={regionId} values={values} />
      {regionRowChanged(snapshot, regionId) ? (
        <RevertButton
          label={`Revert ${regionFacts(regionId).name}`}
          onRevert={() => {
            revertRegion(snapshot, regionId);
          }}
        />
      ) : null}
    </>
  );
}

/**
 * What the row's disclosure opens: the region's remaining grammar rows, which
 * is Style, Fine-tune and - for Usage limits - the providers list, each
 * opening its own provider in place too (L-89, D6).
 */
function RegionRowDetail(props: {
  readonly regionId: RegionId;
  readonly snapshot: LayoutSnapshot;
  readonly values: LayoutValues;
  readonly filter: string;
}): ReactNode {
  const { regionId, snapshot, values, filter } = props;
  // Annotated rather than inferred: indexing the registry with a UNION of ids
  // gives a union of arrays, and a `filter` on one of those has no single
  // callable signature. `AnyGrammarRow` is the registry's own name for the
  // union of their elements.
  const declared: ReadonlyArray<AnyGrammarRow> = LAYOUT_REGIONS[regionId].rows;
  const rows = declared.filter((row) => DETAIL_ROW_KINDS.includes(row.kind));
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
        />
      ))}
    </div>
  );
}

/**
 * The grammar rows a row's disclosure owns.
 *
 * Everything else is drawn by the row itself: `size` and `position-side` are
 * inline controls, `position-order` IS the list the row sits in, and
 * `position-host` belongs to the Status bar surface rather than to a region
 * (D7).
 */
const DETAIL_ROW_KINDS: ReadonlyArray<string> = [
  "style",
  "fine-tune",
  "children",
];

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
 * Divider rows and provider rows answer `null` and stay undecorated.
 */
function asRegionId(id: string): RegionId | null {
  return LAYOUT_REGION_LIST.find((region) => region.id === id)?.id ?? null;
}
