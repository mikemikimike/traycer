import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { changeCount, resetToBase } from "@/lib/layout/layout-diff";
import type { LayoutArrangement } from "@/lib/layout/layout-arrangement";
import type { RailEntry } from "@/lib/layout/rail";
import { type LayoutValues } from "@/lib/layout/layout-values";
import {
  LAYOUT_PRESET_IDS,
  PRESET_VALUES,
  type LayoutPresetId,
} from "@/lib/layout/layout-presets";
import {
  depictRegion,
  type HostContextId,
} from "@/components/layout-editor/region-depiction";
import type { RegionId, ToolbarRegionId } from "@/lib/layout/region-id";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import {
  useLayoutSnapshot,
  useLayoutStore,
} from "@/stores/layout/layout-store";

const PRESET_LABELS: Readonly<Record<LayoutPresetId, string>> = {
  default: "Default",
  compact: "Compact",
  detailed: "Detailed",
};

interface PresetsBlockProps {
  /**
   * Hover/arrow-focus preview without writing (L-43, L-44, L-65): `null`
   * clears the preview. The docked inspector routes this into the editor
   * store's session-only preview tier, which the override seam prefers while
   * it is set; the full-width Settings host has no canvas to preview onto and
   * passes a no-op.
   */
  readonly onPreviewPreset: (presetId: LayoutPresetId | null) => void;
}

/**
 * The presets row (L-06, L-20): three faithful miniature cards, then the
 * status line ("Compact + N changes" and "Reset to Compact"). `.presets` /
 * `.statusline` in the prototype.
 */
export function PresetsBlock(props: PresetsBlockProps): ReactNode {
  const snapshot = useLayoutSnapshot();
  const basePreset = snapshot.basePreset;
  const count = changeCount(snapshot);

  function commitPreset(presetId: LayoutPresetId): void {
    props.onPreviewPreset(null);
    useLayoutEditorStore.getState().recordGesture(() => {
      useLayoutStore.getState().setBasePreset(presetId);
    });
  }

  return (
    <div className="border-b border-border px-3.5 py-3.5">
      <div className="grid grid-cols-3 gap-1.5">
        {LAYOUT_PRESET_IDS.map((presetId, index) => (
          <PresetCard
            key={presetId}
            presetId={presetId}
            arrangement={snapshot.arrangement}
            on={basePreset === presetId}
            onCommit={() => {
              commitPreset(presetId);
            }}
            onPreview={() => {
              props.onPreviewPreset(presetId);
            }}
            onClearPreview={() => {
              props.onPreviewPreset(null);
            }}
            onArrowMove={(direction) => {
              const next =
                LAYOUT_PRESET_IDS[
                  Math.min(
                    Math.max(index + direction, 0),
                    LAYOUT_PRESET_IDS.length - 1,
                  )
                ];
              document.getElementById(`layout-preset-${next}`)?.focus();
            }}
          />
        ))}
      </div>
      <p className="mt-2 text-ui-xs text-muted-foreground">
        Presets change how much is shown, not where things are.
      </p>
      <div className="mt-2.5 flex items-center gap-2 text-ui-sm text-muted-foreground">
        <span data-testid="preset-status-line" className="min-w-0 flex-1">
          {PRESET_LABELS[basePreset]}
          {count > 0 ? ` + ${count} ${count === 1 ? "change" : "changes"}` : ""}
        </span>
        {count > 0 ? (
          <Button
            type="button"
            variant="muted"
            size="sm"
            onClick={() => {
              useLayoutEditorStore.getState().recordGesture(() => {
                useLayoutStore.getState().replaceAll(resetToBase(snapshot));
              });
            }}
          >
            Reset to {PRESET_LABELS[basePreset]}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function PresetCard(props: {
  readonly presetId: LayoutPresetId;
  readonly arrangement: LayoutArrangement;
  readonly on: boolean;
  readonly onCommit: () => void;
  readonly onPreview: () => void;
  readonly onClearPreview: () => void;
  readonly onArrowMove: (direction: 1 | -1) => void;
}): ReactNode {
  const { presetId, arrangement, on } = props;
  return (
    // A `<div role="button">`, not a native `<button>`: the miniature draws
    // the region's own real depiction (`PresetMiniature`, below), and a few
    // regions (`runningAgents` among them) depict as a genuinely interactive
    // component with its own `<button>` - nesting that inside a native
    // button is invalid HTML and reads as two overlapping controls. The
    // miniature is `inert`, so nothing inside it is focusable, hit-testable
    // or in the a11y tree; this card is the one control.
    <div
      id={`layout-preset-${presetId}`}
      role="button"
      tabIndex={0}
      aria-pressed={on}
      aria-label={`${PRESET_LABELS[presetId]} preset`}
      className={cn(
        "flex flex-col items-stretch gap-1.5 rounded-lg border border-border bg-card p-1 pb-1.5 transition-colors active:press-scrim",
        on && "border-foreground",
      )}
      onClick={props.onCommit}
      onMouseEnter={props.onPreview}
      onMouseLeave={props.onClearPreview}
      onFocus={() => {
        if (useLayoutEditorStore.getState().keyboardNav) props.onPreview();
      }}
      onBlur={props.onClearPreview}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          props.onCommit();
          return;
        }
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        useLayoutEditorStore.getState().setKeyboardNav(true);
        props.onArrowMove(event.key === "ArrowRight" ? 1 : -1);
      }}
    >
      <PresetMiniature presetId={presetId} arrangement={arrangement} />
      <span
        className={cn(
          "text-center text-ui-xs text-muted-foreground",
          on && "text-foreground",
        )}
      >
        {PRESET_LABELS[presetId]}
      </span>
    </div>
  );
}

const MINIATURE_FRAME_WIDTH = 1000;
const MINIATURE_FRAME_HEIGHT = 620;

/**
 * A faithful, uniformly-scaled miniature of the real app frame (L-43, L-62):
 * the preset's own values, drawn with the SAME `depictRegion` the specimen
 * stage and the canvas use, under the CURRENT arrangement (2.2) - never a
 * reflowed or hand-drawn lookalike.
 *
 * Everything the arrangement decides is honoured, because the card's whole
 * claim is that it is a picture of the user's own frame under that density:
 * a chip-sized dock row draws as a chip in the compact strip rather than as a
 * full row, the usage cluster sits in whichever surface `usageHost` names, the
 * resource readout and the minimap take the sides they are on, and the rail is
 * the real rail with its real dividers. The three cards then differ by density
 * and by nothing else, which is what makes them comparable.
 *
 * `inert`: several depictions render a real `<button>`, and `aria-hidden`
 * would have left every one of them in the tab order at 1/12 scale (G1-06).
 */
function PresetMiniature(props: {
  readonly presetId: LayoutPresetId;
  readonly arrangement: LayoutArrangement;
}): ReactNode {
  const { arrangement } = props;
  const values = PRESET_VALUES[props.presetId];
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (box === null) return;
    const update = () => {
      setScale(box.clientWidth / MINIATURE_FRAME_WIDTH);
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  const frame = { values, arrangement };

  return (
    <div
      ref={boxRef}
      inert
      data-testid="preset-miniature"
      className="relative w-full overflow-hidden rounded border border-border bg-background"
      style={{
        aspectRatio: `${MINIATURE_FRAME_WIDTH} / ${MINIATURE_FRAME_HEIGHT}`,
      }}
    >
      <div
        className="absolute top-0 left-0 flex origin-top-left flex-col overflow-hidden bg-background"
        style={{
          width: MINIATURE_FRAME_WIDTH,
          height: MINIATURE_FRAME_HEIGHT,
          transform: `scale(${scale})`,
        }}
      >
        <MiniatureTopBar {...frame} />
        <div className="flex min-h-0 flex-1">
          <MiniatureRail {...frame} />
          <div className="flex min-w-0 flex-1 flex-col">
            <MiniatureChatArea {...frame} />
            <MiniatureDock {...frame} />
            <MiniatureToolbar {...frame} />
            <MiniatureComposerFoot {...frame} />
          </div>
        </div>
        <MiniatureStatusBar {...frame} />
      </div>
    </div>
  );
}

/** Everything a miniature part needs: the preset's values and the arrangement. */
interface MiniatureFrame {
  readonly values: LayoutValues;
  readonly arrangement: LayoutArrangement;
}

/**
 * The top bar, which under the `header` usage placement is where BOTH
 * status-bar regions live - exactly as `HeaderUsageControls` renders them
 * (L-51's `statusBarShown`).
 */
function MiniatureTopBar({ values, arrangement }: MiniatureFrame): ReactNode {
  const inHeader = arrangement.usageHost === "header";
  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
      <MiniatureRegion
        regionId="homeTab"
        values={values}
        arrangement={arrangement}
        hostContext={null}
      />
      {/* The tab strip and the header's icon cluster are not regions and carry
        no preset-specific state, so they are the frame's own chrome rather
        than depictions. */}
      <span className="h-5 w-16 rounded-sm border border-border" />
      <span className="h-5 w-16 rounded-sm border border-border" />
      <span className="flex-1" />
      {inHeader ? (
        <>
          <MiniatureRegion
            regionId="usageLimits"
            values={values}
            arrangement={arrangement}
            hostContext="top-bar"
          />
          <MiniatureRegion
            regionId="resourceMonitor"
            values={values}
            arrangement={arrangement}
            hostContext="top-bar"
          />
        </>
      ) : null}
      <span className="size-5 rounded-sm border border-border" />
      <span className="size-5 rounded-sm border border-border" />
    </div>
  );
}

/** The transcript, with the minimap on the side the arrangement puts it. */
function MiniatureChatArea({ values, arrangement }: MiniatureFrame): ReactNode {
  const side = arrangement.minimapSide;
  const minimap = (
    <MiniatureRegion
      regionId="minimap"
      values={values}
      arrangement={arrangement}
      hostContext={null}
    />
  );
  return (
    <div className="flex min-h-0 flex-1">
      {side === "left" ? minimap : null}
      <div className="min-h-0 flex-1 border-b border-border bg-card" />
      {side === "right" ? minimap : null}
    </div>
  );
}

/**
 * The dock, split the way the canvas splits it: a chip-sized row draws in the
 * compact strip's own host context. The Compact card's whole claim is that the
 * dock folds to chips, so the miniature has to make that claim too (G1-02).
 */
function MiniatureDock({ values, arrangement }: MiniatureFrame): ReactNode {
  const shown = arrangement.dock.filter(
    (regionId) => values[regionId].shown === "shown",
  );
  const rows = shown.filter((regionId) => values[regionId].size === "full");
  const chips = shown.filter((regionId) => values[regionId].size === "chip");
  return (
    <div className="flex flex-col gap-1.5 px-3 py-2">
      {rows.map((regionId) => (
        <div key={regionId}>
          {depictRegion(regionId, values[regionId], arrangement, null)}
        </div>
      ))}
      {chips.length === 0 ? null : (
        <div className="flex items-center gap-1">
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
    </div>
  );
}

function MiniatureToolbar({ values, arrangement }: MiniatureFrame): ReactNode {
  return (
    <div className="flex items-center justify-between px-3 pb-2">
      <MiniatureToolbarCluster
        regionIds={arrangement.toolbarLeft}
        values={values}
        arrangement={arrangement}
      />
      <MiniatureToolbarCluster
        regionIds={arrangement.toolbarRight}
        values={values}
        arrangement={arrangement}
      />
    </div>
  );
}

function MiniatureToolbarCluster(props: {
  readonly regionIds: ReadonlyArray<ToolbarRegionId>;
  readonly values: LayoutValues;
  readonly arrangement: LayoutArrangement;
}): ReactNode {
  const { regionIds, values, arrangement } = props;
  return (
    <div className="flex items-center gap-1.5">
      {regionIds.map((regionId) => (
        <MiniatureRegion
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

function MiniatureComposerFoot({
  values,
  arrangement,
}: MiniatureFrame): ReactNode {
  return (
    <div className="flex items-center justify-end border-t border-border px-3 py-1.5">
      <MiniatureRegion
        regionId="contextUsage"
        values={values}
        arrangement={arrangement}
        hostContext={null}
      />
    </div>
  );
}

/**
 * The status strip, or nothing at all: under the `header` placement the strip
 * is not drawn and both of its regions have moved up (L-51).
 */
function MiniatureStatusBar({
  values,
  arrangement,
}: MiniatureFrame): ReactNode {
  if (arrangement.usageHost === "header") return null;
  const monitor = (
    <MiniatureRegion
      regionId="resourceMonitor"
      values={values}
      arrangement={arrangement}
      hostContext={null}
    />
  );
  return (
    <div className="flex h-7 shrink-0 items-center gap-3 border-t border-border px-3">
      {arrangement.resourceSide === "left" ? monitor : null}
      <MiniatureRegion
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

/**
 * One region, drawn only when this preset shows it - the single place the
 * miniature asks that question, so no part of the frame can forget to.
 */
function MiniatureRegion<K extends RegionId>(props: {
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

/** The real rail: the arrangement's own entries, dividers included (L-25). */
function MiniatureRail({ values, arrangement }: MiniatureFrame): ReactNode {
  return (
    <div className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-border py-3">
      {arrangement.rail.map((entry) => (
        <MiniatureRailEntry
          key={entry.id}
          entry={entry}
          values={values}
          arrangement={arrangement}
        />
      ))}
    </div>
  );
}

function MiniatureRailEntry(props: {
  readonly entry: RailEntry;
  readonly values: LayoutValues;
  readonly arrangement: LayoutArrangement;
}): ReactNode {
  const { entry, values, arrangement } = props;
  if (entry.kind === "divider") {
    return <span className="my-1 h-px w-6 bg-border" />;
  }
  const railValues = values[entry.id];
  // A panel the user hid leaves a gap in the miniature exactly as it leaves one
  // in the rail; the density preset is not what hid it.
  if (railValues.shown === "hidden") return null;
  return <span>{depictRegion(entry.id, railValues, arrangement, null)}</span>;
}
