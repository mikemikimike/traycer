import type { ReactNode } from "react";
import { SegmentedControl } from "@/components/layout-editor/inspector/segmented-control";
import { SpecimenStage } from "@/components/layout-editor/inspector/specimen-stage";
import { assertNever } from "@/components/layout-editor/inspector/rows/assert-never";
import { ProvidersChildrenRow } from "@/components/layout-editor/inspector/rows/children-row";
import { FineTuneDisclosure } from "@/components/layout-editor/inspector/rows/fine-tune-row";
import {
  PositionHostRow,
  PositionOrderRow,
  PositionSideRow,
} from "@/components/layout-editor/inspector/rows/position-row";
import {
  isRailRegionId,
  setRegionShown,
} from "@/components/layout-editor/layout-gestures";
import { SizeRow } from "@/components/layout-editor/inspector/rows/size-row";
import { StyleRow } from "@/components/layout-editor/inspector/rows/style-row";
import { LAYOUT_REGIONS } from "@/components/layout-editor/regions/layout-regions";
import {
  regionDepiction,
  regionFacts,
  type AnyGrammarRow,
} from "@/components/layout-editor/regions/region-facts";
import { Switch } from "@/components/ui/switch";
import type { LayoutArrangement } from "@/lib/layout/layout-arrangement";
import { effectiveLayoutValues } from "@/lib/layout/layout-presets";
import type { LayoutSnapshot } from "@/lib/layout/layout-snapshot";
import type { LayoutValues } from "@/lib/layout/layout-values";
import type { RegionId } from "@/lib/layout/region-id";
import { cn } from "@/lib/utils";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import {
  useLayoutSnapshot,
  useLayoutStore,
} from "@/stores/layout/layout-store";

interface RegionSectionProps {
  readonly regionId: RegionId;
  /** The same section renders in both hosts (L-03); only the children row differs. */
  readonly host: "inspector" | "page";
  readonly onOpenProvider: ((providerId: string) => void) | null;
}

/**
 * One region's section, in the fixed grammar order (L-08): stage, header with
 * Shown, Size, Position, Style, Fine-tune (collapsed), children - rows that do
 * not apply are omitted. Nothing here is written per region: every row comes
 * off `LAYOUT_REGIONS[regionId].rows`, which is what keeps the docked
 * inspector and the full-width `Settings > Layout` host the same form (L-03).
 *
 * The shell and the row switch. Each row KIND is drawn by its own module under
 * `rows/`, so the file that decides which rows a region has never also decides
 * what any one of them looks like.
 */
export function RegionSection(props: RegionSectionProps): ReactNode {
  const { regionId, host, onOpenProvider } = props;
  const snapshot = useLayoutSnapshot();
  const filter = useLayoutEditorStore((state) => state.filter);
  const values = effectiveLayoutValues(snapshot.basePreset, snapshot.overrides);
  const arrangement = snapshot.arrangement;
  const region = LAYOUT_REGIONS[regionId];
  const facts = regionFacts(regionId);
  const shownValue = values[regionId].shown;
  const shown = shownValue !== "hidden";
  const where =
    facts.whereByHost !== null
      ? facts.whereByHost[arrangement.usageHost]
      : facts.where;

  function setRailVisibility(next: string): void {
    if (!isRailRegionId(regionId)) return;
    if (next !== "auto" && next !== "shown" && next !== "hidden") return;
    useLayoutEditorStore.getState().recordGesture(() => {
      useLayoutStore.getState().setRegionValues(regionId, { shown: next });
    });
  }

  return (
    <div className="flex flex-col">
      <SpecimenStage off={!shown}>
        {regionDepiction(regionId, values, arrangement)}
      </SpecimenStage>
      <div className="flex items-start gap-2.5 px-3.5 pt-3.5 pb-3">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-foreground">
          <facts.icon className="size-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-ui-sm font-medium">{facts.name}</div>
          <div className="mt-0.5 text-ui-xs text-muted-foreground">{where}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {isRailRegionId(regionId) && facts.hint !== null ? (
            <SegmentedControl
              ariaLabel={`${facts.name} visibility`}
              value={shownValue}
              onChange={setRailVisibility}
              options={[
                { value: "auto", label: "Auto" },
                { value: "shown", label: "Shown" },
                { value: "hidden", label: "Hidden" },
              ]}
            />
          ) : (
            <Switch
              aria-label={`Show ${facts.name}`}
              checked={shown}
              onCheckedChange={() => {
                setRegionShown(regionId, !shown);
              }}
            />
          )}
        </div>
      </div>
      {isRailRegionId(regionId) && facts.hint !== null ? (
        <p className="px-3.5 pb-2 text-ui-xs text-muted-foreground">
          {facts.hint}
        </p>
      ) : null}
      {/* `inert`, not `aria-hidden`: `aria-hidden` leaves its descendants in
        the tab order, so a keyboard user landed inside the greyed rows of a
        hidden region - and `pointer-events-none` did not stop that either.
        `inert` removes focus, hit testing and the a11y tree in one, and
        subsumes the pointer rule (G1-06). */}
      <div inert={!shown} className={cn(!shown && "opacity-40")}>
        {region.rows.map((row) => (
          // Each grammar row kind appears at most once per region (L-08), so
          // `row.kind` is a stable key without an index.
          <GrammarRowView
            key={row.kind}
            row={row}
            regionId={regionId}
            host={host}
            values={values}
            arrangement={arrangement}
            snapshot={snapshot}
            filter={filter}
            onOpenProvider={onOpenProvider}
          />
        ))}
      </div>
    </div>
  );
}

function GrammarRowView(props: {
  readonly row: AnyGrammarRow;
  readonly regionId: RegionId;
  readonly host: "inspector" | "page";
  readonly values: LayoutValues;
  readonly arrangement: LayoutArrangement;
  readonly snapshot: LayoutSnapshot;
  readonly filter: string;
  readonly onOpenProvider: ((providerId: string) => void) | null;
}): ReactNode {
  const {
    row,
    regionId,
    host,
    values,
    arrangement,
    snapshot,
    filter,
    onOpenProvider,
  } = props;
  const regionValues = values[regionId];

  switch (row.kind) {
    case "size":
      return (
        <SizeRow
          regionId={regionId}
          regionValues={regionValues}
          description={row.description}
        />
      );
    case "position-host":
      return (
        <PositionHostRow
          regionId={regionId}
          arrangement={arrangement}
          snapshot={snapshot}
          description={row.description}
        />
      );
    case "position-side":
      return (
        <PositionSideRow
          regionId={regionId}
          arrangement={arrangement}
          snapshot={snapshot}
          description={row.description}
        />
      );
    case "position-order":
      return (
        <PositionOrderRow
          regionId={regionId}
          group={row.group}
          description={row.description}
          pinnedRight={row.pinnedRight}
          dividers={row.dividers}
          values={values}
          arrangement={arrangement}
          snapshot={snapshot}
        />
      );
    case "style":
      return (
        <StyleRow
          examples={row.examples}
          description={row.description}
          regionId={regionId}
          values={values}
          arrangement={arrangement}
        />
      );
    case "fine-tune":
      return (
        <FineTuneDisclosure
          rows={row.rows}
          regionId={regionId}
          regionValues={regionValues}
          filter={filter}
        />
      );
    case "children":
      return (
        <ProvidersChildrenRow
          values={values}
          arrangement={arrangement}
          host={host}
          onOpenProvider={onOpenProvider}
        />
      );
    default:
      return assertNever(row);
  }
}
