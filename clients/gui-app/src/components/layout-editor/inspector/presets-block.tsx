import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { changeCount, resetToBase } from "@/lib/layout/layout-diff";
import {
  LAYOUT_PRESET_IDS,
  PRESET_VALUES,
  type LayoutPresetId,
} from "@/lib/layout/layout-values";
import { depictRegion } from "@/lib/layout/region-depiction";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import { useLayoutStore } from "@/stores/layout/layout-store";

const PRESET_LABELS: Readonly<Record<LayoutPresetId, string>> = {
  default: "Default",
  compact: "Compact",
  detailed: "Detailed",
};

interface PresetsBlockProps {
  /**
   * Hover/arrow-focus preview without writing (L-43, L-44): `null` clears the
   * preview. The caller (the canvas, wired in a later ticket) decides how to
   * render a previewed preset; this block only reports the intent.
   */
  readonly onPreviewPreset: (presetId: LayoutPresetId | null) => void;
}

/**
 * The presets row (L-06, L-20): three faithful miniature cards, then the
 * status line ("Compact + N changes" and "Reset to Compact"). `.presets` /
 * `.statusline` in the prototype.
 */
export function PresetsBlock(props: PresetsBlockProps): ReactNode {
  // Three separate selectors, each a stable reference from the store, rather
  // than one selector returning `{ ... }`: a selector that allocates a new
  // object on every call defeats `useSyncExternalStore`'s own caching and
  // free-runs the component (React's "getSnapshot should be cached" loop).
  // `region-section.tsx`'s `useSnapshot` is the same shape for the same
  // reason.
  const basePreset = useLayoutStore((state) => state.basePreset);
  const overrides = useLayoutStore((state) => state.overrides);
  const arrangement = useLayoutStore((state) => state.arrangement);
  const snapshot = { basePreset, overrides, arrangement };
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
              document
                .getElementById(`layout-preset-${next}`)
                ?.focus();
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
  readonly on: boolean;
  readonly onCommit: () => void;
  readonly onPreview: () => void;
  readonly onClearPreview: () => void;
  readonly onArrowMove: (direction: 1 | -1) => void;
}): ReactNode {
  const { presetId, on } = props;
  return (
    // A `<div role="button">`, not a native `<button>`: the miniature draws
    // the region's own real depiction (`PresetMiniature`, below), and a few
    // regions (`runningAgents` among them) depict as a genuinely interactive
    // component with its own `<button>` - nesting that inside a native
    // button is invalid HTML and reads as two overlapping controls. The
    // miniature itself is `aria-hidden`, so nothing inside it is reachable
    // by assistive tech either way; this card is the one control.
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
      <PresetMiniature presetId={presetId} />
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
 * A faithful, uniformly-scaled miniature of the real app frame (L-43): the
 * preset's own values, drawn with the SAME `depictRegion` the specimen stage
 * uses, under the current arrangement (2.2) - never a reflowed or hand-drawn
 * lookalike. `.mini-box` / `.mini-frame` in the prototype.
 *
 * The rail and top bar carry no preset-specific state (presets are
 * density-only, L-20), so they are drawn as plain chrome rather than through
 * `depictRegion` for every rail icon - a preset card compares density, and
 * density is entirely in the composer, the chat edge and the status bar.
 */
function PresetMiniature(props: { readonly presetId: LayoutPresetId }): ReactNode {
  const arrangement = useLayoutStore((state) => state.arrangement);
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

  return (
    <div
      ref={boxRef}
      aria-hidden
      className="relative w-full overflow-hidden rounded border border-border bg-background"
      style={{ aspectRatio: `${MINIATURE_FRAME_WIDTH} / ${MINIATURE_FRAME_HEIGHT}` }}
    >
      <div
        className="pointer-events-none absolute top-0 left-0 flex origin-top-left flex-col overflow-hidden bg-background"
        style={{
          width: MINIATURE_FRAME_WIDTH,
          height: MINIATURE_FRAME_HEIGHT,
          transform: `scale(${scale})`,
        }}
      >
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
          {values.homeTab.shown === "shown"
            ? depictRegion("homeTab", values.homeTab, arrangement, null)
            : null}
          <span className="h-5 w-16 rounded-sm border border-border" />
        </div>
        <div className="flex min-h-0 flex-1">
          <div className="flex w-12 shrink-0 flex-col items-center gap-2 border-r border-border py-3">
            <span className="size-6 rounded-md border border-border" />
            <span className="size-6 rounded-md border border-border" />
            <span className="size-6 rounded-md border border-border" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 border-b border-border bg-card" />
            <div className="flex flex-col gap-1.5 px-3 py-2">
              {arrangement.dock.map((regionId) =>
                values[regionId].shown === "shown" ? (
                  <div key={regionId}>
                    {depictRegion(regionId, values[regionId], arrangement, null)}
                  </div>
                ) : null,
              )}
            </div>
            <div className="flex items-center justify-between px-3 pb-2">
              <div className="flex items-center gap-1.5">
                {arrangement.toolbarLeft.map((regionId) =>
                  values[regionId].shown === "shown" ? (
                    <span key={regionId}>
                      {depictRegion(regionId, values[regionId], arrangement, null)}
                    </span>
                  ) : null,
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {arrangement.toolbarRight.map((regionId) =>
                  values[regionId].shown === "shown" ? (
                    <span key={regionId}>
                      {depictRegion(regionId, values[regionId], arrangement, null)}
                    </span>
                  ) : null,
                )}
              </div>
            </div>
            <div className="flex items-center justify-end border-t border-border px-3 py-1.5">
              {values.contextUsage.shown === "shown"
                ? depictRegion(
                    "contextUsage",
                    values.contextUsage,
                    arrangement,
                    null,
                  )
                : null}
            </div>
          </div>
        </div>
        <div className="flex h-7 shrink-0 items-center gap-3 border-t border-border px-3">
          {values.usageLimits.shown === "shown"
            ? depictRegion("usageLimits", values.usageLimits, arrangement, null)
            : null}
          <span className="flex-1" />
          {values.resourceMonitor.shown === "shown"
            ? depictRegion(
                "resourceMonitor",
                values.resourceMonitor,
                arrangement,
                null,
              )
            : null}
        </div>
      </div>
    </div>
  );
}
