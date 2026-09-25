import { useIsMobileViewport } from "@/hooks/ui/use-mobile-viewport";
import { useSettingsAvailabilityContext } from "@/hooks/settings/use-settings-availability-context";
import { isVoiceInputRowAvailable } from "@/lib/settings/settings-availability";
import type { ReactNode } from "react";
import { RegionShownControl } from "@/components/layout-editor/inspector/region-controls";
import { useLayoutUsage } from "@/components/layout-editor/inspector/use-layout-usage";
import { SpecimenStage } from "@/components/layout-editor/inspector/specimen-stage";
import { assertNever } from "@/components/layout-editor/inspector/rows/assert-never";
import { ProvidersChildrenRow } from "@/components/layout-editor/inspector/rows/children-row";
import { FineTuneDisclosure } from "@/components/layout-editor/inspector/rows/fine-tune-row";
import {
  PositionHostRow,
  PositionOrderRow,
  PositionSideRow,
} from "@/components/layout-editor/inspector/rows/position-row";
import { SizeRow } from "@/components/layout-editor/inspector/rows/size-row";
import { StyleRow } from "@/components/layout-editor/inspector/rows/style-row";
import { LAYOUT_REGIONS } from "@/components/layout-editor/regions/layout-regions";
import { regionDepiction } from "@/components/layout-editor/region-depiction";
import {
  regionFacts,
  regionRowAvailable,
  regionWhere,
  type AnyGrammarRow,
} from "@/components/layout-editor/regions/region-facts";
import type { LayoutArrangement } from "@/lib/layout/layout-arrangement";
import type { RateLimitProviderId } from "@/lib/rate-limit-providers";
import { effectiveLayoutValues } from "@/lib/layout/layout-presets";
import type { LayoutSnapshot } from "@/lib/layout/layout-snapshot";
import {
  regionValuesHidden,
  type LayoutValues,
} from "@/lib/layout/layout-values";
import type { RegionId } from "@/lib/layout/region-id";
import { cn } from "@/lib/utils";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import { useLayoutSnapshot } from "@/stores/layout/layout-store";

interface RegionSectionProps {
  readonly regionId: RegionId;
  /**
   * How the provider level is opened. Never absent: the section is the DOCKED
   * inspector's screen, and the inspector always has a rung below this one to
   * go to. The page composes `SurfaceSection` and `GrammarRowView` directly
   * and opens the providers in place instead, which is where the nullable
   * shape below still belongs.
   */
  readonly onOpenProvider: (providerId: RateLimitProviderId) => void;
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
  const { regionId, onOpenProvider } = props;
  const { providerIds } = useLayoutUsage();
  const availability = useSettingsAvailabilityContext();
  const narrow = useIsMobileViewport();
  const snapshot = useLayoutSnapshot();
  const filter = useLayoutEditorStore((state) => state.filter);
  const values = effectiveLayoutValues(snapshot.basePreset, snapshot.overrides);
  const arrangement = snapshot.arrangement;
  const region = LAYOUT_REGIONS[regionId];
  const facts = regionFacts(regionId);
  const shown = !regionValuesHidden(values[regionId]);
  const hasSample =
    regionId !== "usageLimits" ||
    arrangement.usageProviders.some(
      (id) =>
        providerIds.includes(id) && !arrangement.hiddenProviders.includes(id),
    );
  // Composed rather than indexed by one region's host: the two bar readings
  // each answer for themselves now (L-156), so the line under a name is the
  // registry's sentence for the bar THIS region is in, plus its own side.
  const where = regionWhere(
    regionId,
    narrow
      ? { ...arrangement, usageHost: "status-bar", resourceHost: "status-bar" }
      : arrangement,
  );
  if (regionId === "mic" && !isVoiceInputRowAvailable(availability))
    return null;

  return (
    <div className="flex flex-col">
      <SpecimenStage off={!shown} label={hasSample ? "Sample" : null}>
        {regionDepiction(regionId, values, arrangement)}
      </SpecimenStage>
      {/* `flex-wrap` plus a floor on the text column, the same rule the rows
        below carry (I-05): the rail's three-position control is ~150px of a
        292px header, so in the 320px dock it takes its own line under the
        name rather than crushing "Sidebar - icon rail" to one word per
        line. */}
      <div className="flex flex-wrap items-start gap-x-2.5 gap-y-2 px-3.5 pt-3.5 pb-3">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-foreground">
          <facts.icon className="size-3.5" />
        </div>
        <div className="min-w-32 flex-1">
          <div className="text-ui-sm font-medium">{facts.name}</div>
          <div className="mt-0.5 text-ui-xs text-muted-foreground">{where}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {/* The region's ONE visibility control, the same component the
            page puts inline on this region's row. The rail's is three-state
            for all nine panels (L-47, L-93, I-10). */}
          <RegionShownControl regionId={regionId} values={values} />
        </div>
      </div>
      {facts.hint !== null ? (
        <p className="px-3.5 pb-2 text-ui-xs text-muted-foreground">
          {facts.hint}
        </p>
      ) : null}
      {/* `inert`, not `aria-hidden`: `aria-hidden` leaves its descendants in
        the tab order, so a keyboard user landed inside the greyed rows of a
        hidden region - and `pointer-events-none` did not stop that either.
        `inert` removes focus, hit testing and the a11y tree in one, and
        subsumes the pointer rule (G1-06). */}
      {/* Per row, because Fine-tune greys its own rows: one of them can be
        about another surface and outlive the region's Hidden (G7). Each
        grammar row kind appears at most once per region (L-08), so
        `row.kind` is a stable key without an index. */}
      {region.rows.map((row) => {
        const view = (
          <GrammarRowView
            key={row.kind}
            row={row}
            regionId={regionId}
            values={values}
            arrangement={arrangement}
            snapshot={snapshot}
            filter={filter}
            onOpenProvider={onOpenProvider}
            regionHidden={!shown}
          />
        );
        if (row.kind === "fine-tune") return view;
        return (
          <div
            key={row.kind}
            inert={!shown}
            className={cn(!shown && "opacity-40")}
          >
            {view}
          </div>
        );
      })}
    </div>
  );
}

/**
 * One grammar row, drawn by the module that owns its KIND.
 *
 * Exported because both hosts draw the same rows, in different places: the
 * dock stacks all of a region's rows under its header, and the page puts Size
 * and Position on the region's row inside its surface list and opens the rest
 * - Style, Fine-tune and the providers list - behind that row's own disclosure
 * (L-95). Which rows a host draws is composition; how a row is drawn is not.
 */
export function GrammarRowView(props: {
  readonly row: AnyGrammarRow;
  readonly regionId: RegionId;
  readonly values: LayoutValues;
  readonly arrangement: LayoutArrangement;
  readonly snapshot: LayoutSnapshot;
  readonly filter: string;
  readonly onOpenProvider: ((providerId: RateLimitProviderId) => void) | null;
  /** Read by Fine-tune alone, which greys its rows per row (G7). */
  readonly regionHidden: boolean;
}): ReactNode {
  const {
    row,
    regionId,
    values,
    arrangement,
    snapshot,
    filter,
    onOpenProvider,
    regionHidden,
  } = props;
  const narrow = useIsMobileViewport();
  const regionValues = values[regionId];
  if (!regionRowAvailable(regionId, row, narrow)) return null;

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
          specimen={row.specimen}
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
          regionHidden={regionHidden}
        />
      );
    case "children":
      return (
        <ProvidersChildrenRow
          values={values}
          arrangement={arrangement}
          onOpenProvider={onOpenProvider}
        />
      );
    default:
      return assertNever(row);
  }
}
