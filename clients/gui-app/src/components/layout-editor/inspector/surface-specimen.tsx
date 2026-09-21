import type { ReactNode } from "react";
import { Bell, History } from "lucide-react";
import { SpecimenStage } from "@/components/layout-editor/inspector/specimen-stage";
import { depictRegion } from "@/components/layout-editor/region-depiction";
import type { SurfaceGroupId } from "@/components/layout-editor/regions/region-grammar";
import type { LayoutArrangement } from "@/lib/layout/layout-arrangement";
import type { LayoutValues } from "@/lib/layout/layout-values";
import type { RailEntry } from "@/lib/layout/rail";
import type { RegionId, ToolbarRegionId } from "@/lib/layout/region-id";
import { cn } from "@/lib/utils";

/**
 * One picture per SURFACE, which is what the page's cards open with (L-95).
 *
 * A rail icon alone on an 88px plinth - what the Top bar card and each of the
 * nine Sidebar sections used to show - is not a picture of anything; the rail
 * WITH its dividers, in its real order, is (P-3). It also makes the picture do
 * work the form cannot: dragging a row moves the thing above it, so the
 * specimen is a live preview rather than 22 repetitions of the word SPECIMEN.
 *
 * Every region in here goes through `depictRegion` (L-77), under the CURRENT
 * values and arrangement, so these are the same pixels the canvas and the
 * preset miniatures draw. What is NOT a region - a tab label, the header's
 * icon cluster, the composer's own box - is the surface's own chrome, drawn
 * the way `PresetMiniature` draws it, because two blank rectangles are not a
 * picture of a top bar (I-03).
 *
 * **Chat has no specimen, deliberately.** Its two regions live on two
 * different surfaces - the minimap on the transcript's edge and the context
 * chip on the composer's foot - so there is no single row that holds both, and
 * P-2 says to omit a specimen rather than approximate one (B.7's own risk).
 */
export function SurfaceSpecimen(props: {
  readonly surface: SurfaceGroupId;
  readonly values: LayoutValues;
  readonly arrangement: LayoutArrangement;
}): ReactNode {
  const { surface, values, arrangement } = props;
  const body = specimenBody(surface, values, arrangement);
  if (body === null) return null;
  return <SpecimenStage off={false}>{body}</SpecimenStage>;
}

function specimenBody(
  surface: SurfaceGroupId,
  values: LayoutValues,
  arrangement: LayoutArrangement,
): ReactNode {
  switch (surface) {
    case "topBar":
      return <TopBarSpecimen values={values} arrangement={arrangement} />;
    case "sidebar":
      return <SidebarSpecimen values={values} arrangement={arrangement} />;
    case "composer":
      return <ComposerSpecimen values={values} arrangement={arrangement} />;
    case "statusBar":
      return <StatusBarSpecimen values={values} arrangement={arrangement} />;
    case "chat":
      return null;
  }
}

interface SurfaceFrame {
  readonly values: LayoutValues;
  readonly arrangement: LayoutArrangement;
}

/** The tabs beside the home tab, which are chrome rather than regions. */
const SPECIMEN_TABS: ReadonlyArray<{
  readonly label: string;
  readonly active: boolean;
}> = [
  { label: "Start page", active: false },
  { label: "Sample chat", active: true },
];

/**
 * The top bar, which under the `header` usage placement is where BOTH
 * status-bar regions live - exactly as `HeaderUsageControls` renders them.
 */
function TopBarSpecimen({ values, arrangement }: SurfaceFrame): ReactNode {
  const inHeader = arrangement.usageHost === "header";
  return (
    <div className="flex w-full items-center gap-2">
      <ShownRegion
        regionId="homeTab"
        values={values}
        arrangement={arrangement}
      />
      {SPECIMEN_TABS.map((tab) => (
        <span
          key={tab.label}
          className={cn(
            "flex h-7 shrink-0 items-center rounded-sm px-2.5 text-ui-sm text-muted-foreground",
            tab.active &&
              "border border-border bg-foreground/5 text-foreground",
          )}
        >
          {tab.label}
        </span>
      ))}
      <span className="flex-1" />
      {inHeader ? (
        <>
          <ShownRegion
            regionId="usageLimits"
            values={values}
            arrangement={arrangement}
          />
          <ShownRegion
            regionId="resourceMonitor"
            values={values}
            arrangement={arrangement}
          />
        </>
      ) : null}
      <History aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <Bell aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <span className="size-5 shrink-0 rounded-full border border-border bg-foreground/10" />
    </div>
  );
}

/**
 * The real rail: the arrangement's own entries, dividers included (L-25), in
 * the order the list beneath it is in. Each panel brings its own rail frame,
 * so this adds no spacing of its own.
 */
function SidebarSpecimen({ values, arrangement }: SurfaceFrame): ReactNode {
  return (
    <div className="flex flex-col items-center">
      {arrangement.rail.map((entry) => (
        <RailSpecimenEntry
          key={entry.id}
          entry={entry}
          values={values}
          arrangement={arrangement}
        />
      ))}
    </div>
  );
}

/**
 * One rail entry: a group boundary, or the panel's own icon unless the user
 * turned it off. `auto` is not off, so only `hidden` leaves a gap.
 */
function RailSpecimenEntry(props: {
  readonly entry: RailEntry;
  readonly values: LayoutValues;
  readonly arrangement: LayoutArrangement;
}): ReactNode {
  const { entry, values, arrangement } = props;
  if (entry.kind === "divider") {
    return <span aria-hidden className="my-1 h-px w-6 bg-border" />;
  }
  const railValues = values[entry.id];
  if (railValues.shown === "hidden") return null;
  return <span>{depictRegion(entry.id, railValues, arrangement, null)}</span>;
}

/**
 * The composer as the app assembles it (L-97): the compact chips above its
 * left edge, the full-size rows in one joined frame tucked under it, and the
 * two toolbar clusters inside the box.
 */
function ComposerSpecimen({ values, arrangement }: SurfaceFrame): ReactNode {
  const shown = arrangement.dock.filter(
    (regionId) => values[regionId].shown === "shown",
  );
  const rows = shown.filter((regionId) => values[regionId].size === "full");
  const chips = shown.filter((regionId) => values[regionId].size === "chip");
  return (
    <div className="flex w-full flex-col gap-1.5">
      {chips.length === 0 ? null : (
        <div className="flex items-center gap-1.5">
          {chips.map((regionId) => (
            <span key={regionId}>
              {depictRegion(
                regionId,
                values[regionId],
                arrangement,
                "chip-strip",
              )}
            </span>
          ))}
        </div>
      )}
      {rows.length === 0 ? null : (
        // `-mb-px` over a frame with no bottom border: the seam between the
        // dock and the composer is one line, not two touching ones.
        <div className="-mb-px flex flex-col gap-1.5 rounded-t-lg border border-b-0 border-border bg-foreground/3 px-3 py-2">
          {rows.map((regionId) => (
            <div key={regionId}>
              {depictRegion(regionId, values[regionId], arrangement, null)}
            </div>
          ))}
        </div>
      )}
      <div className="rounded-xl border border-border bg-foreground/3 px-3 pt-2.5 pb-2">
        <div className="pb-4 text-ui-sm text-muted-foreground">
          Describe the next change...
        </div>
        <div className="flex items-center">
          <ToolbarCluster
            regionIds={arrangement.toolbarLeft}
            values={values}
            arrangement={arrangement}
          />
          <span className="flex-1" />
          <ToolbarCluster
            regionIds={arrangement.toolbarRight}
            values={values}
            arrangement={arrangement}
          />
          <span className="ml-1.5 size-6 shrink-0 rounded-full border border-border bg-foreground/10" />
        </div>
      </div>
    </div>
  );
}

function ToolbarCluster(props: {
  readonly regionIds: ReadonlyArray<ToolbarRegionId>;
  readonly values: LayoutValues;
  readonly arrangement: LayoutArrangement;
}): ReactNode {
  const { regionIds, values, arrangement } = props;
  return (
    <div className="flex items-center gap-1.5">
      {regionIds.map((regionId) => (
        <ShownRegion
          key={regionId}
          regionId={regionId}
          values={values}
          arrangement={arrangement}
        />
      ))}
    </div>
  );
}

/**
 * The status strip, or the line that says where it went: under the `header`
 * placement the strip is not drawn at all and both of its regions have moved
 * up (L-51, D7).
 */
function StatusBarSpecimen({ values, arrangement }: SurfaceFrame): ReactNode {
  if (arrangement.usageHost === "header") {
    return (
      <p className="text-ui-sm text-muted-foreground">
        Both of these are in the top bar, so there is no status bar to draw.
      </p>
    );
  }
  const monitor = (
    <ShownRegion
      regionId="resourceMonitor"
      values={values}
      arrangement={arrangement}
    />
  );
  return (
    <div className="flex h-6 w-full items-center gap-3">
      {arrangement.resourceSide === "left" ? monitor : null}
      <ShownRegion
        regionId="usageLimits"
        values={values}
        arrangement={arrangement}
      />
      <span className="flex-1" />
      {arrangement.resourceSide === "right" ? monitor : null}
    </div>
  );
}

/**
 * One region, drawn only where this surface really draws it - the single place
 * the specimen asks that question, so no part of it can forget to.
 */
function ShownRegion<K extends RegionId>(props: {
  readonly regionId: K;
  readonly values: LayoutValues;
  readonly arrangement: LayoutArrangement;
}): ReactNode {
  const { regionId, values, arrangement } = props;
  const regionValues = values[regionId];
  if (regionValues.shown !== "shown") return null;
  return depictRegion(regionId, regionValues, arrangement, null);
}
