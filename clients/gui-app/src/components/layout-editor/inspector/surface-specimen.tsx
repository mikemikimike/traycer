import type { ReactNode } from "react";
import {
  type AppFrame,
  AppFrameComposerStack,
  AppFrameRailEntries,
  AppFrameRegion,
  AppFrameTopBar,
} from "@/components/layout-editor/inspector/app-frame-chrome";
import { SpecimenStage } from "@/components/layout-editor/inspector/specimen-stage";
import type { SurfaceGroupId } from "@/components/layout-editor/regions/region-grammar";
import type { LayoutArrangement } from "@/lib/layout/layout-arrangement";
import type { LayoutValues } from "@/lib/layout/layout-values";

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
 * icon cluster, the composer's own box - is the surface's own chrome, and it
 * comes from `app-frame-chrome.tsx`, the one copy the preset miniature draws
 * from as well (R1-04), because two blank rectangles are not a picture of a
 * top bar (I-03) and two copies are not a picture of one app.
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

/** The top bar's row, at the stage's full width. */
function TopBarSpecimen({ values, arrangement }: AppFrame): ReactNode {
  return (
    <div className="flex w-full items-center gap-2">
      <AppFrameTopBar values={values} arrangement={arrangement} />
    </div>
  );
}

/** The rail, which is a column and therefore the one specimen that is narrow. */
function SidebarSpecimen({ values, arrangement }: AppFrame): ReactNode {
  return (
    <div className="flex flex-col items-center">
      <AppFrameRailEntries values={values} arrangement={arrangement} />
    </div>
  );
}

/**
 * The composer as the app assembles it (L-97): the compact chips above its
 * left edge, the full-size rows in one joined frame tucked under it, and the
 * two toolbar clusters inside the box.
 */
function ComposerSpecimen({ values, arrangement }: AppFrame): ReactNode {
  return <AppFrameComposerStack values={values} arrangement={arrangement} />;
}

/**
 * The status strip, or the line that says where it went: under the `header`
 * placement the strip is not drawn at all and both of its regions have moved
 * up (L-51, D7).
 */
function StatusBarSpecimen({ values, arrangement }: AppFrame): ReactNode {
  if (arrangement.usageHost === "header") {
    return (
      <p className="text-ui-sm text-muted-foreground">
        Both of these are in the top bar, so there is no status bar to draw.
      </p>
    );
  }
  const monitor = (
    <AppFrameRegion
      regionId="resourceMonitor"
      values={values}
      arrangement={arrangement}
      hostContext={null}
    />
  );
  return (
    <div className="flex h-6 w-full items-center gap-3">
      {arrangement.resourceSide === "left" ? monitor : null}
      <AppFrameRegion
        regionId="usageLimits"
        values={values}
        arrangement={arrangement}
        hostContext={null}
      />
      <span className="flex-1" />
      {arrangement.resourceSide === "right" ? monitor : null}
    </div>
  );
}
