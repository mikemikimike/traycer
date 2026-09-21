import type { ReactNode } from "react";
import { Bell, History } from "lucide-react";
import {
  depictDockRows,
  depictRegion,
  type HostContextId,
} from "@/components/layout-editor/region-depiction";
import type { LayoutArrangement } from "@/lib/layout/layout-arrangement";
import type { LayoutValues } from "@/lib/layout/layout-values";
import type { RailEntry } from "@/lib/layout/rail";
import type {
  RailRegionId,
  RegionId,
  ToolbarRegionId,
} from "@/lib/layout/region-id";
import { cn } from "@/lib/utils";

/**
 * The app's frame around the regions, in one copy.
 *
 * Two surfaces draw a picture of the app: the preset cards, which are a whole
 * scaled window (L-43), and the Settings page's surface specimens, which are
 * one surface at 1:1 (L-95). Everything in them that is NOT a region - the tab
 * labels, the header's icon cluster, the composer's box and its two toolbar
 * clusters, the rail's dividers, and the dock's split into pills above one
 * joined frame - existed twice, so the next change to the composer's shape had
 * to be made in two files or the two pictures disagreed about what the app
 * looks like (R1-04). They had already drifted: the two drew the header's
 * resource monitor in different host frames, and only one of them tucked the
 * dock under the composer.
 *
 * What stays with each caller is PLACEMENT - the miniature draws these inside
 * a 1000x620 frame with the app's own bars and paddings, the specimen draws
 * one of them on a stage - so nothing here takes a size, a padding or a flag.
 */
export interface AppFrame {
  readonly values: LayoutValues;
  readonly arrangement: LayoutArrangement;
}

/** The tabs beside the home tab, which are chrome rather than regions. */
const APP_FRAME_TABS: ReadonlyArray<{
  readonly label: string;
  readonly active: boolean;
}> = [
  { label: "Start page", active: false },
  { label: "Sample chat", active: true },
];

/**
 * The top bar's row, minus the row itself: the home tab, the tab strip, the
 * usage cluster where the arrangement hosts it, and the header's own glyphs.
 *
 * Under the `header` placement this is where BOTH status-bar regions live -
 * exactly as `HeaderUsageControls` renders them (L-51's `statusBarShown`) - so
 * both are framed as the top bar rather than as the strip they came from.
 *
 * Drawn with their real labels, because two blank rectangles are not a picture
 * of a top bar (I-03).
 */
export function AppFrameTopBar({ values, arrangement }: AppFrame): ReactNode {
  const inHeader = arrangement.usageHost === "header";
  return (
    <>
      <AppFrameRegion
        regionId="homeTab"
        values={values}
        arrangement={arrangement}
        hostContext={null}
      />
      {APP_FRAME_TABS.map((tab) => (
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
          <AppFrameRegion
            regionId="usageLimits"
            values={values}
            arrangement={arrangement}
            hostContext="top-bar"
          />
          <AppFrameRegion
            regionId="resourceMonitor"
            values={values}
            arrangement={arrangement}
            hostContext="top-bar"
          />
        </>
      ) : null}
      <History aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <Bell aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <span className="size-5 shrink-0 rounded-full border border-border bg-foreground/10" />
    </>
  );
}

/**
 * The dock and the composer as the app assembles them (L-97, L-99): the
 * compact pills above the composer's left edge, the full-size rows in one
 * joined frame whose bottom edge disappears under the box, and the box itself.
 *
 * One stack rather than three parts, because the tuck only exists while the
 * frame touches the composer: anything a caller could put between them would
 * break it, and one of the two callers used to.
 */
export function AppFrameComposerStack({
  values,
  arrangement,
}: AppFrame): ReactNode {
  return (
    <div className="flex w-full flex-col">
      <AppFrameDock values={values} arrangement={arrangement} />
      <AppFrameComposerBox values={values} arrangement={arrangement} />
    </div>
  );
}

/**
 * The dock, split the way the canvas splits it.
 *
 * The pills go ABOVE the joined frame, both at the composer's left edge. Drawn
 * as separate cards, the Compact card had nothing left to claim: the fold to
 * chips IS the claim (G1-02), so the two shapes have to look different from
 * each other here.
 */
function AppFrameDock({ values, arrangement }: AppFrame): ReactNode {
  const shown = arrangement.dock.filter(
    (regionId) => values[regionId].shown === "shown",
  );
  const rows = shown.filter((regionId) => values[regionId].size === "full");
  const chips = shown.filter((regionId) => values[regionId].size === "chip");
  if (rows.length === 0 && chips.length === 0) return null;
  return (
    <div
      data-testid="app-frame-dock"
      className={cn(
        "flex flex-col gap-1.5",
        // `-mb-px` over a frame with no bottom border: the seam between the
        // dock and the composer is one line, not two touching ones. With no
        // frame there is nothing to tuck, and the pills keep their own gap.
        rows.length > 0 ? "-mb-px" : "mb-1.5",
      )}
    >
      {chips.length === 0 ? null : (
        <div
          data-testid="app-frame-dock-chips"
          className="flex items-center gap-1.5"
        >
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
      {rows.length === 0 ? null : depictDockRows(rows, values, arrangement)}
    </div>
  );
}

/**
 * The composer: a box with the prompt line above its two toolbar clusters.
 *
 * A box and nothing more. What the composer LOOKS like inside is the
 * depictions' business.
 *
 * `bg-foreground/3` rather than `bg-card`, for the reason I-03 exists: every
 * dark preset defines `--card` as `--background`, so a `bg-card` box on this
 * frame is a border around nothing. It is also the real composer shell's own
 * material.
 */
function AppFrameComposerBox({ values, arrangement }: AppFrame): ReactNode {
  return (
    <div
      data-testid="app-frame-composer"
      className="rounded-xl border border-border bg-foreground/3 px-3 pt-2.5 pb-2"
    >
      <div className="pb-4 text-ui-sm text-muted-foreground">
        Describe the next change...
      </div>
      <div className="flex items-center">
        <AppFrameToolbarCluster
          regionIds={arrangement.toolbarLeft}
          values={values}
          arrangement={arrangement}
        />
        <span className="flex-1" />
        <AppFrameToolbarCluster
          regionIds={arrangement.toolbarRight}
          values={values}
          arrangement={arrangement}
        />
        <span className="ml-1.5 size-6 shrink-0 rounded-full border border-border bg-foreground/10" />
      </div>
    </div>
  );
}

function AppFrameToolbarCluster(props: {
  readonly regionIds: ReadonlyArray<ToolbarRegionId>;
  readonly values: LayoutValues;
  readonly arrangement: LayoutArrangement;
}): ReactNode {
  const { regionIds, values, arrangement } = props;
  return (
    <div className="flex items-center gap-1.5">
      {regionIds.map((regionId) => (
        <AppFrameRegion
          key={regionId}
          regionId={regionId}
          values={values}
          arrangement={arrangement}
          hostContext={null}
        />
      ))}
    </div>
  );
}

/**
 * The status strip's ordered children, and nothing else.
 *
 * The one part of the app frame R1-04 left behind in two copies: which of the
 * two regions leads, where the spacer goes, and that `resourceSide` decides it
 * is ASSEMBLY rather than placement, so a third status-bar region or a change
 * to what `resourceSide` means had to be made in two files or the preset card
 * and the Settings band disagreed about the strip (R2-02).
 *
 * The bar's own BOX stays with each caller, and so does each one's answer for
 * the `header` placement, because those two genuinely differ: the miniature
 * draws no strip at all, the page's band draws a sentence saying where it went.
 */
export function AppFrameStatusBarRow({
  values,
  arrangement,
}: AppFrame): ReactNode {
  const monitor = (
    <AppFrameRegion
      regionId="resourceMonitor"
      values={values}
      arrangement={arrangement}
      hostContext={null}
    />
  );
  return (
    <>
      {arrangement.resourceSide === "left" ? monitor : null}
      <AppFrameRegion
        regionId="usageLimits"
        values={values}
        arrangement={arrangement}
        hostContext={null}
      />
      <span className="flex-1" />
      {arrangement.resourceSide === "right" ? monitor : null}
    </>
  );
}

/**
 * The real rail: the arrangement's own entries, dividers included (L-25), in
 * the order the list beside them is in. Each panel brings its own rail frame,
 * so this adds no spacing of its own.
 *
 * A panel the user hid leaves a gap exactly as it leaves one in the rail;
 * `auto` is not off, so only `hidden` does.
 */
export function AppFrameRailEntries({
  values,
  arrangement,
}: AppFrame): ReactNode {
  return arrangement.rail.map((entry) => (
    <AppFrameRailEntry
      key={entry.id}
      entry={entry}
      values={values}
      arrangement={arrangement}
    />
  ));
}

function AppFrameRailEntry(props: {
  readonly entry: RailEntry;
  readonly values: LayoutValues;
  readonly arrangement: LayoutArrangement;
}): ReactNode {
  const { entry, values, arrangement } = props;
  if (entry.kind === "divider") {
    // Nothing, which is the parity answer (L-11): a preset card is a picture of
    // the app AT REST, and at rest a group break IS the rail's own `gap-1` and
    // no element (L-140). The hairline drawn here was a picture of something
    // the sidebar no longer draws.
    return null;
  }
  const railValues = values[entry.id];
  if (railValues.shown === "hidden") return null;
  return <span>{depictRegion(entry.id, railValues, arrangement, null)}</span>;
}

/**
 * One region, drawn only where the surface really draws it.
 *
 * There are exactly TWO askers of "is this drawn", and they ask different
 * questions: this one, whose regions have a two-state `shown`, and
 * `AppFrameRailEntry` above, because `RailValues.shown` is
 * `auto | shown | hidden` and `auto` is the shipped default for all nine
 * panels (L-93) - so `!== "shown"` would hide every panel nobody has touched.
 *
 * The parameter excludes `RailRegionId` for that reason (R2-06): the signature
 * used to invite a caller to draw a rail panel through here, and every
 * untouched panel would have vanished from that picture with nothing red
 * anywhere.
 */
export function AppFrameRegion<
  K extends Exclude<RegionId, RailRegionId>,
>(props: {
  readonly regionId: K;
  readonly values: LayoutValues;
  readonly arrangement: LayoutArrangement;
  readonly hostContext: HostContextId | null;
}): ReactNode {
  const { regionId, values, arrangement, hostContext } = props;
  const regionValues = values[regionId];
  if (regionValues.shown !== "shown") return null;
  return depictRegion(regionId, regionValues, arrangement, hostContext);
}
