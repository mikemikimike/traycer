import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Bell, History, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDestructiveDialog } from "@/components/ui/confirm-destructive-dialog";
import { cn } from "@/lib/utils";
import {
  anythingChanged,
  changeCount,
  resetEverything,
  resetToBase,
} from "@/lib/layout/layout-diff";
import type { LayoutArrangement } from "@/lib/layout/layout-arrangement";
import type { LayoutSnapshot } from "@/lib/layout/layout-snapshot";
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
      {/* Capped rather than fluid, which is the one place on this page a width
        cap is the right answer: a card is a PICTURE of a window, and at full
        page width the three were ~470px each of mostly empty dark frame
        immediately under the page title - the largest object on a page whose
        subject is the list below it (P-2). The cap never binds in the 320px
        dock, so the two hosts still draw the same card. */}
      <div className="mx-auto grid w-full max-w-xl grid-cols-3 gap-1.5">
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
        {/* `truncate`: the button beside it takes ~120px of a 292px row, so
          any count at all wrapped the label onto a second line (I-13). */}
        <span
          data-testid="preset-status-line"
          className="min-w-0 flex-1 truncate"
        >
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
        <ResetEverythingButton snapshot={snapshot} />
      </div>
    </div>
  );
}

/**
 * The floor under everything else (L-20): the preset, every value AND the whole
 * arrangement back to what shipped.
 *
 * It exists here rather than only on the page because both hosts need the same
 * floor, but the page is why it had to be built: with no session there is no
 * Undo, no Discard and no Cmd+Z (P-6), "Reset to Default" is values-only by
 * construction (L-57), and three arrangement fields had no revert anywhere at
 * all. Confirmed, because on this host it is irreversible.
 */
function ResetEverythingButton(props: {
  readonly snapshot: LayoutSnapshot;
}): ReactNode {
  const { snapshot } = props;
  const [confirming, setConfirming] = useState(false);
  if (!anythingChanged(snapshot)) return null;
  return (
    <>
      <Button
        type="button"
        variant="muted"
        size="sm"
        onClick={() => {
          setConfirming(true);
        }}
      >
        Reset everything
      </Button>
      <ConfirmDestructiveDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Reset the whole layout?"
        description="Every setting, and where everything sits, go back to how the app shipped. This cannot be undone here."
        cascadeSummary={null}
        actionLabel="Reset everything"
        isPending={false}
        blockedReason={null}
        onConfirm={() => {
          setConfirming(false);
          useLayoutEditorStore.getState().recordGesture(() => {
            useLayoutStore.getState().replaceAll(resetEverything(snapshot));
          });
        }}
      />
    </>
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
 * The ratio a card in the 320px dock lands on, which is the frame's scale
 * until the box has been measured - the prototype's `transform: scale(.08)`,
 * "corrected to the exact ratio on the next frame".
 *
 * Seeded rather than left at 0 because a box that measures zero at layout time
 * - inside a collapsed group, a hidden tab, a container that has not laid out
 * - never measures again, and a frame at `scale(0)` is an empty card (I-18).
 */
const MINIATURE_SEED_SCALE = 0.081;

/**
 * A few turns of a conversation, as the transcript draws them.
 *
 * Inert static markup with no depictions of its own: the card is what makes a
 * preset legible, and at this scale what carries that is the SHAPE of a page
 * of chat - user bubbles against the right, assistant paragraphs running the
 * column's width, a tool line between them. The three cards mount ~30
 * `HostContextFrame`s between them already, and each one costs a
 * `ResizeObserver` and a layout read (G1-21), so nothing here is a region.
 */
const MINIATURE_TRANSCRIPT: ReadonlyArray<{
  readonly id: string;
  readonly kind: "user" | "assistant" | "tool";
  readonly text: string;
}> = [
  { id: "u1", kind: "user", text: "Make the task list easier to scan." },
  {
    id: "t1",
    kind: "tool",
    text: "Read src/task-list.tsx",
  },
  {
    id: "a1",
    kind: "assistant",
    text: "I'll group related tasks, give the titles more room, and keep the progress visible beside each item. The changes can stay inside the existing list component.",
  },
  {
    id: "u2",
    kind: "user",
    text: "Keep the layout comfortable on smaller windows.",
  },
  {
    id: "a2",
    kind: "assistant",
    text: "The list now uses the available width. Long titles wrap, metadata stays beside its task, and the controls keep their touch targets.",
  },
];

/** The tabs beside the home tab, which are chrome rather than regions. */
const MINIATURE_TABS: ReadonlyArray<{
  readonly label: string;
  readonly active: boolean;
}> = [
  { label: "Start page", active: false },
  { label: "Sample chat", active: true },
];

/**
 * A faithful, uniformly-scaled miniature of the real app frame (L-43, L-62):
 * the preset's own values, drawn with the SAME `depictRegion` the specimen
 * stage and the canvas use, under the CURRENT arrangement (2.2) - never a
 * reflowed or hand-drawn lookalike.
 *
 * The frame it is drawn into is the app's own: a top bar with real tab labels,
 * a transcript with a few turns in it, the dock the preset produces, a
 * composer box and the status strip. That part is inert static markup, and it
 * is there because a card that was 60% empty `bg-card` read as a near-black
 * rectangle in every dark preset, where `--card` and `--background` are the
 * same colour (I-03).
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
  const [scale, setScale] = useState(MINIATURE_SEED_SCALE);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (box === null) return;
    const update = () => {
      // A width of 0 is "not laid out", not "this card is zero wide": taking
      // it would replace the seed with a scale that draws nothing (I-18).
      const width = box.clientWidth;
      if (width === 0) return;
      setScale(width / MINIATURE_FRAME_WIDTH);
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
            <MiniatureComposer {...frame} />
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
        than depictions - drawn with their real labels, because two blank
        rectangles are not a picture of a top bar (I-03). */}
      {MINIATURE_TABS.map((tab) => (
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
      <History className="size-4 shrink-0 text-muted-foreground" />
      <Bell className="size-4 shrink-0 text-muted-foreground" />
      <span className="size-5 shrink-0 rounded-full border border-border bg-foreground/10" />
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
    <div className="flex min-h-0 flex-1 border-b border-border">
      {side === "left" ? minimap : null}
      {/* Clipped rather than scrolled, exactly as the real transcript's top is
        off-screen: the card is a window onto a conversation in progress. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden px-6 pt-5">
        {MINIATURE_TRANSCRIPT.map((message) => (
          <MiniatureMessage key={message.id} kind={message.kind}>
            {message.text}
          </MiniatureMessage>
        ))}
      </div>
      {side === "right" ? minimap : null}
    </div>
  );
}

/** One turn: a bubble against the right, a paragraph, or a tool line. */
function MiniatureMessage(props: {
  readonly kind: "user" | "assistant" | "tool";
  readonly children: string;
}): ReactNode {
  if (props.kind === "user") {
    return (
      <span className="max-w-[78%] shrink-0 self-end rounded-lg border border-border bg-foreground/5 px-3.5 py-2.5 text-ui-sm">
        {props.children}
      </span>
    );
  }
  if (props.kind === "tool") {
    return (
      <span className="flex shrink-0 items-center gap-2 text-ui-xs text-muted-foreground">
        <Wrench className="size-3.5 shrink-0" />
        {props.children}
      </span>
    );
  }
  return (
    <span className="shrink-0 text-ui-sm leading-relaxed">
      {props.children}
    </span>
  );
}

/**
 * The dock, split the way the canvas splits it, and placed the way the app
 * places it (L-97).
 *
 * The full-size rows are ONE joined frame whose bottom edge disappears under
 * the composer - today's `ChatLowerDock`, which the owner kept - and the
 * chip-sized members are small pills above the composer's left edge, which is
 * the one thing L-97 took from the artifact. Drawn as separate cards, the
 * Compact card had nothing left to claim: the fold to chips IS the claim
 * (G1-02), so the two shapes have to look different from each other here.
 *
 * The pills go ABOVE the joined frame because the tuck only exists while the
 * frame touches the composer; both still sit above it, at its left edge.
 */
function MiniatureDock({ values, arrangement }: MiniatureFrame): ReactNode {
  const shown = arrangement.dock.filter(
    (regionId) => values[regionId].shown === "shown",
  );
  const rows = shown.filter((regionId) => values[regionId].size === "full");
  const chips = shown.filter((regionId) => values[regionId].size === "chip");
  if (rows.length === 0 && chips.length === 0) return null;
  return (
    <div data-testid="preset-dock" className="flex flex-col gap-1.5 px-6 pt-2">
      {chips.length === 0 ? null : (
        <div
          data-testid="preset-dock-chips"
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
      {rows.length === 0 ? null : (
        // `-mb-px` over a frame with no bottom border: the seam between the
        // dock and the composer is one line, not two touching ones.
        <div
          data-testid="preset-dock-frame"
          className="-mb-px rounded-t-lg border border-b-0 border-border bg-foreground/3 px-3 py-2"
        >
          <div className="flex flex-col gap-1.5">
            {rows.map((regionId) => (
              <div key={regionId}>
                {depictRegion(regionId, values[regionId], arrangement, null)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The composer: a box with the prompt line above its two toolbar clusters.
 *
 * A box and nothing more. The toolbar clusters were drawn loose on the frame,
 * so the preset's own composer buttons floated in empty space with no composer
 * around them (I-03); what the composer LOOKS like inside is the depictions'
 * business, and ticket C3 carries the new design into them.
 *
 * `bg-foreground/3` rather than `bg-card`, for the reason I-03 exists: every
 * dark preset defines `--card` as `--background`, so a `bg-card` box on this
 * frame is a border around nothing. It is also the real composer shell's own
 * material.
 */
function MiniatureComposer({ values, arrangement }: MiniatureFrame): ReactNode {
  return (
    <div data-testid="preset-composer" className="px-6 pb-2">
      <div className="rounded-xl border border-border bg-foreground/3 px-3 pt-2.5 pb-2">
        <div className="pb-4 text-ui-sm text-muted-foreground">
          Describe the next change...
        </div>
        <div className="flex items-center">
          <MiniatureToolbarCluster
            regionIds={arrangement.toolbarLeft}
            values={values}
            arrangement={arrangement}
          />
          <span className="flex-1" />
          <MiniatureToolbarCluster
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
    <div className="flex items-center justify-end px-6 pb-2">
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
