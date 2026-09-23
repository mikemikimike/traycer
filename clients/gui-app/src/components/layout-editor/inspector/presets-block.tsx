import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDestructiveDialog } from "@/components/ui/confirm-destructive-dialog";
import { cn } from "@/lib/utils";
import {
  anythingChanged,
  changeCount,
  resetEverything,
  resetToBase,
} from "@/lib/layout/layout-diff";
import {
  sideTabStripEdge,
  statusBarHostsAnyRegion,
  type EdgeSide,
  type LayoutArrangement,
} from "@/lib/layout/layout-arrangement";
import type { LayoutSnapshot } from "@/lib/layout/layout-snapshot";
import {
  LAYOUT_PRESET_IDS,
  PRESET_VALUES,
  type LayoutPresetId,
} from "@/lib/layout/layout-presets";
import {
  type AppFrame,
  AppFramePanelTaskHeader,
  AppFrameLiveAgentItems,
  AppFrameComposerStack,
  AppFrameRailEntries,
  AppFrameRegion,
  AppFrameSideStrip,
  AppFrameStatusBarRow,
  AppFrameTopBar,
} from "@/components/layout-editor/inspector/app-frame-chrome";
import {
  SIDE_STRIP_DEFAULT_WIDTH_PX,
  SIDE_STRIP_RAIL_WIDTH_PX,
} from "@/components/layout/tabs/side-strip/side-strip-tokens";
import { DEFAULT_SIDEBAR_WIDTH_PX } from "@/stores/epics/left-panel-store";
import { useSideTabStripStore } from "@/stores/layout/side-tab-strip-store";
import { useLayoutFormHost } from "@/components/layout-editor/inspector/layout-form-host";
import { useSortableRowPadding } from "@/components/layout-editor/inspector/sortable-row-padding";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import { useSettingsStore } from "@/stores/settings/settings-store";
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
  const gutter = useSortableRowPadding();
  const dock = useLayoutFormHost() === "inspector";

  /**
   * A preset click changes the DENSITY and nothing else (L-133).
   *
   * It used to clear the per-region delta as well, which made the card a
   * second "Reset to <preset>" wearing a density's clothes - and on this
   * page, where there is no Undo (L-108), an unrecoverable one. Keeping the
   * overrides is what leaves "Reset to <preset>" beside it a distinct action
   * with something of its own to do, and the count next to it stays truthful
   * because it is measured by DIFFERENCE against whichever base is current.
   */
  function commitPreset(presetId: LayoutPresetId): void {
    props.onPreviewPreset(null);
    useLayoutEditorStore.getState().recordGesture(() => {
      useLayoutStore.getState().setBasePreset(presetId);
    });
  }

  return (
    <div className="flex flex-col">
      <div className={gutter.row}>
        {/* Capped rather than fluid, which is the one place on this page a
          width cap is the right answer: a card is a PICTURE of a window, and
          at full page width the three were ~470px each of mostly empty dark
          frame immediately under the page title - the largest object on a page
          whose subject is the list below it (P-2). `max-w-md` rather than
          `max-w-xl` (L-124): at 215px the thumbnails were already unreadable
          and the three differ only by density, so the LABEL is what identifies
          them and a smaller card reads as a chooser instead of a gallery. The
          cap never binds in the 320px dock, so the two hosts still draw the
          same card. */}
        <div className="mx-auto grid w-full max-w-md grid-cols-3 gap-1.5">
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
      </div>
      {/* The card's own row, in the row shape every other line on this page
        uses (L-127): the state on the left with the same `bg-info` dot the
        rows carry, the caption as its description, the benign counterpart
        action on the right. It is hand-built rather than an `InspectorRow`
        because the label is COMPOSITE - a preset name, a dot and a count -
        and that row takes a string. The gutter is the shared one, so the line
        sits in the same column as the rows of every other card. */}
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-border/40",
          gutter.row,
        )}
      >
        <div className="min-w-32 flex-1">
          <div className="flex items-center gap-1.5">
            {count > 0 ? (
              <span
                aria-hidden
                data-testid="preset-changed-dot"
                className="size-1.5 shrink-0 rounded-full bg-info"
              />
            ) : null}
            {/* `truncate`: the button beside it takes ~120px of a 292px row,
              so any count at all wrapped the label onto a second line
              (I-13). */}
            <span
              data-testid="preset-status-line"
              className="min-w-0 truncate font-medium text-foreground"
            >
              {PRESET_LABELS[basePreset]}
              {count > 0
                ? ` + ${count} ${count === 1 ? "change" : "changes"}`
                : ""}
            </span>
          </div>
          <p className="mt-0.5 max-w-[72ch] text-pretty text-ui-sm text-muted-foreground">
            Presets change how much is shown, not where things are.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
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
          {/* The floor is beside the preset it resets past only where it is
            REVERSIBLE (L-20's placement, redesign 4.4). On the page it is the
            one irreversible action there is, so it leaves this card for a
            `tone="danger"` card at the foot; the page renders its own. */}
          {dock ? <ResetEverythingButton snapshot={snapshot} /> : null}
        </div>
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
 * all.
 *
 * **The confirm belongs to the page and to nothing else (R1-07).** A modal
 * that says "this cannot be undone here" is true on Settings and false in the
 * docked inspector, where the write goes through `recordGesture` and Cmd+Z,
 * the Undo button and Discard all put it back. A user inside a live session
 * was being told their whole layout was about to be destroyed irreversibly,
 * and backing out of a reversible action; the inspector's own safety net is
 * the one the rest of its gestures already rely on, so the gesture applies
 * there and the sentence stays true where it is shown.
 *
 * Exported because the two hosts now PLACE it differently (redesign 4.4): the
 * dock keeps it on the presets card, beside the preset it resets past, where
 * Undo is one keystroke away; the page draws it in a `tone="danger"` card at
 * the foot of the page, which is where the house puts its one irreversible
 * action. Placement is composition, which is the only kind of difference the
 * two hosts are allowed (L-03, L-16).
 */
export function ResetEverythingButton(props: {
  readonly snapshot: LayoutSnapshot;
}): ReactNode {
  const { snapshot } = props;
  const irreversible = useLayoutFormHost() === "page";
  const [confirming, setConfirming] = useState(false);
  const taskTabLayout = useSettingsStore((state) => state.taskTabLayout);
  const changed =
    anythingChanged(snapshot) || (irreversible && taskTabLayout !== "scroll");
  // In the dock this is one control on a crowded instrument line, so an
  // inoperable one is noise and it stands down. On the page it is a card of
  // its own, and a card that vanishes takes the floor's existence with it:
  // showing the floor and saying you are standing on it is clearer (5.8).
  if (!changed && !irreversible) return null;
  function reset(): void {
    if (irreversible) useSettingsStore.getState().setTaskTabLayout("scroll");
    useLayoutEditorStore.getState().recordGesture(() => {
      useLayoutStore.getState().replaceAll(resetEverything(snapshot));
    });
  }
  return (
    <>
      <Button
        type="button"
        variant={irreversible ? "destructive" : "muted"}
        size="sm"
        disabled={!changed}
        onClick={() => {
          if (irreversible) {
            setConfirming(true);
            return;
          }
          reset();
        }}
      >
        Reset everything
      </Button>
      {irreversible ? (
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
            reset();
          }}
        />
      ) : null}
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

/**
 * A faithful, uniformly-scaled miniature of the real app frame (L-43, L-62):
 * the preset's own values, drawn with the SAME `depictRegion` the specimen
 * stage and the canvas use, under the CURRENT arrangement (2.2) - never a
 * reflowed or hand-drawn lookalike.
 *
 * The frame it is drawn into is the app's own shell: the ground, a top bar or
 * a side strip on it where the stored placement puts the tabs (S-03), and the
 * surface frame's two sheets - a task's panel (its rail across the top, its
 * header, its agents) on the stored sidebar side and the content (a
 * transcript with a few turns in it, the dock the preset produces, a composer
 * box) - then the status strip. The strip is the user's own: the 60px rail
 * while it is collapsed, its active task joined to the panel sheet where the
 * live one joins, and its live agents listed in the Activity view. That part
 * is inert static markup, and it is there because a card that was 60% empty
 * `bg-card` read as a near-black rectangle in every dark preset, where
 * `--card` and `--background` are the same colour (I-03). Everything in it
 * that is not this card's own placement comes from `app-frame-chrome.tsx`,
 * which the page's specimens draw from too, so the two pictures cannot
 * disagree about the app (R1-04).
 *
 * Platform-neutral: the real frame draws a slim title band above a vertical
 * strip on Windows, on Linux, and on macOS with the strip at the right
 * (S-04); the miniature draws none, on any platform, which is not drift for
 * ticket 12's live-vs-picture pass to report.
 *
 * Everything the arrangement decides is honoured, because the card's whole
 * claim is that it is a picture of the user's own frame under that density:
 * a chip-sized dock row draws as a chip in the compact strip rather than as a
 * full row, each bar reading sits in whichever bar it names (L-156), the
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

  const collapsed = useSideTabStripStore((state) => state.collapsed);
  const frame = { values, arrangement };
  const edge = sideTabStripEdge(arrangement.tabStripPlacement);

  const panel = <MiniaturePanel {...frame} />;
  const content = (
    <div
      data-shell-sheet="content"
      className="flex min-w-0 flex-1 flex-col overflow-clip bg-canvas"
    >
      <MiniatureChatArea {...frame} />
      <div className="px-6 py-2">
        <AppFrameComposerStack {...frame} />
      </div>
      <MiniatureComposerFoot {...frame} />
    </div>
  );
  const strip =
    edge === null ? null : (
      <MiniatureSideStrip {...frame} edge={edge} collapsed={collapsed} />
    );

  return (
    <div
      ref={boxRef}
      inert
      data-testid="preset-miniature"
      className="relative w-full overflow-hidden rounded border border-border bg-shell-ground"
      style={{
        aspectRatio: `${MINIATURE_FRAME_WIDTH} / ${MINIATURE_FRAME_HEIGHT}`,
      }}
    >
      <div
        className="absolute top-0 left-0 flex origin-top-left flex-col overflow-hidden bg-shell-ground text-canvas-foreground"
        style={{
          width: MINIATURE_FRAME_WIDTH,
          height: MINIATURE_FRAME_HEIGHT,
          transform: `scale(${scale})`,
        }}
      >
        {edge === null ? <MiniatureTopBar {...frame} /> : null}
        <div className="flex min-h-0 flex-1">
          {edge === "left" ? strip : null}
          {/* The shell's own surface frame: its margin is the ground around
              the sheets, and it gives them their border and radius. */}
          <div
            data-testid="preset-miniature-surface"
            className="task-surface-frame flex min-h-0 min-w-0 flex-1 gap-(--shell-gap)"
          >
            {arrangement.sidebarSide === "left" ? panel : null}
            {content}
            {arrangement.sidebarSide === "right" ? panel : null}
          </div>
          {edge === "right" ? strip : null}
        </div>
        <MiniatureStatusBar {...frame} />
      </div>
    </div>
  );
}

/** The app's own 40px bar on the ground, holding the frame chrome's top-bar row. */
function MiniatureTopBar({ values, arrangement }: AppFrame): ReactNode {
  return (
    <div className="flex h-10 shrink-0 items-center gap-2 px-3">
      <AppFrameTopBar values={values} arrangement={arrangement} />
    </div>
  );
}

/**
 * The vertical strip on the ground, at its real width (the rail's while it is
 * collapsed), scaled with everything else here.
 */
function MiniatureSideStrip({
  values,
  arrangement,
  edge,
  collapsed,
}: AppFrame & {
  readonly edge: EdgeSide;
  readonly collapsed: boolean;
}): ReactNode {
  return (
    <div
      className="flex h-full shrink-0 flex-col"
      style={{
        width: collapsed
          ? SIDE_STRIP_RAIL_WIDTH_PX
          : SIDE_STRIP_DEFAULT_WIDTH_PX,
      }}
    >
      <AppFrameSideStrip
        values={values}
        arrangement={arrangement}
        edge={edge}
        collapsed={collapsed}
      />
    </div>
  );
}

/** The transcript, with the minimap on the side the arrangement puts it. */
function MiniatureChatArea({ values, arrangement }: AppFrame): ReactNode {
  const side = arrangement.minimapSide;
  const minimap = (
    <AppFrameRegion
      regionId="minimap"
      values={values}
      arrangement={arrangement}
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

function MiniatureComposerFoot({ values, arrangement }: AppFrame): ReactNode {
  return (
    <div className="flex items-center justify-end px-6 pb-2">
      <AppFrameRegion
        regionId="contextUsage"
        values={values}
        arrangement={arrangement}
      />
    </div>
  );
}

/**
 * The status strip, or nothing at all: the strip is drawn for as long as
 * either reading is still in it (L-51, L-156).
 *
 * The bar's BOX is this card's; what is in it and in what order is the frame
 * chrome's one copy (R2-02).
 */
function MiniatureStatusBar({ values, arrangement }: AppFrame): ReactNode {
  if (!statusBarHostsAnyRegion(arrangement)) return null;
  return (
    <div className="flex h-7 shrink-0 items-center gap-3 border-t border-border/90 bg-canvas px-3">
      <AppFrameStatusBarRow values={values} arrangement={arrangement} />
    </div>
  );
}

/**
 * The task's panel sheet at its default width: the rail across its top as the
 * expanded panel draws it, holding the frame chrome's entries (L-155), the
 * task header (D12), and the Agents tree.
 */
function MiniaturePanel({ values, arrangement }: AppFrame): ReactNode {
  return (
    <div
      data-shell-sheet="panel"
      className="flex h-full min-h-0 shrink-0 flex-col overflow-hidden bg-background"
      style={{ width: DEFAULT_SIDEBAR_WIDTH_PX }}
    >
      {/* Each rail picture comes in the vertical rail's 48px column frame
          (`HOST_CONTEXT_CLASS.rail`); across the panel's top it hugs its
          icon instead, as the horizontal rail's tiles do. */}
      <div
        data-testid="preset-miniature-rail"
        className="flex h-10 w-full min-w-0 shrink-0 flex-row items-center justify-center-safe gap-1 overflow-hidden px-2 [&_[data-layout-depiction=rail]]:w-auto [&_[data-layout-depiction=rail]]:py-0"
      >
        <AppFrameRailEntries values={values} arrangement={arrangement} />
      </div>
      <AppFramePanelTaskHeader />
      <ul className="flex flex-col gap-0.5 px-2 pt-1">
        <AppFrameLiveAgentItems />
      </ul>
    </div>
  );
}
