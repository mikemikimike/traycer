import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import { cn } from "@/lib/utils";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, useIsPresent } from "motion/react";
import * as m from "motion/react-m";
import {
  Bot,
  FileDiff,
  ListChecks,
  ListOrdered,
  type LucideIcon,
} from "lucide-react";
import { MessageSquareClock } from "@/components/notifications/message-square-clock";
import {
  ChatDockChipArrival,
  ChatDockCompactChip,
} from "@/components/chat/chat-dock-compact-chip";
import { LAYOUT_CLUSTER_ATTRIBUTE } from "@/components/layout-editor/canvas/region-drag";
import { LayoutClusterContextMenu } from "@/components/layout-editor/region-quick-verbs";
import { useMotionEnabled } from "@/lib/animation/use-motion-enabled";
import {
  STATUS_ANIMATION_PULSE_CADENCE_MS,
  useStatusAnimation,
} from "@/lib/animation/status-animation-clock";
import {
  ChatDockCompactStripContext,
  useChatDockCompactStrip,
  type ChatDockCompactChipGlyph,
  type ChatDockCompactChipModel,
  type ChatDockCompactStripValue,
} from "@/components/chat/chat-dock-compact-context";

export type {
  ChatDockCompactChipGlyph,
  ChatDockCompactChipModel,
  ChatDockCompactStripValue,
} from "@/components/chat/chat-dock-compact-context";

export function ChatDockCompactStripProvider(props: {
  /** `null` is "no dock on this surface", the context's own resting value. */
  readonly value: ChatDockCompactStripValue | null;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <ChatDockCompactStripContext.Provider value={props.value}>
      {props.children}
    </ChatDockCompactStripContext.Provider>
  );
}

const GLYPH_ICONS: Readonly<Record<ChatDockCompactChipGlyph, LucideIcon>> = {
  filesChanged: FileDiff,
  activeAgents: Bot,
  // The section's own mark, resting and working alike - the same
  // chat-with-a-clock `BackgroundActivityGlyph` draws for background-only
  // activity elsewhere. Never a per-kind icon and never a pause: what the rows
  // are is the panel's to draw, and whether a shell is held is stated in this
  // chip's sentence.
  background: MessageSquareClock,
  // The queue's own mark, the one its full row's header already prints beside
  // the count, and the todo's likewise: a pill and the row it folds have to be
  // recognisable as the same member.
  queue: ListOrdered,
  todo: ListChecks,
};

/**
 * One sweep a second - slow enough to read as breathing rather than blinking on
 * a 14px mark, and the cadence the rest of the window's live indicators keep.
 */
const GLYPH_SHIMMER_CYCLE_MS = 1000;

/**
 * The dimmest the glyph gets. Far enough down to read as motion at this size,
 * far enough from zero that the icon never blinks OUT - it is the only thing
 * saying which section the chip stands for, so it stays legible at every point
 * of the sweep.
 */
const GLYPH_SHIMMER_TROUGH_OPACITY = 0.35;

/**
 * The sweep: brightest at the top of the cycle, dimmest at its midpoint, on a
 * cosine so neither end is a corner.
 */
function glyphShimmerOpacity(elapsedMs: number): number {
  const phase = (elapsedMs / GLYPH_SHIMMER_CYCLE_MS) % 1;
  const dip = (1 - Math.cos(phase * 2 * Math.PI)) / 2;
  return 1 - (1 - GLYPH_SHIMMER_TROUGH_OPACITY) * dip;
}

/**
 * The lit glyph itself, shimmering on the shared status clock.
 *
 * The animated element is the lucide `<svg>` itself, with no wrapper of its
 * own: the sweep is the only thing drawn on top of the icon now, so there is
 * nothing for a box around it to hold. `useStatusAnimation` takes an SVG ref
 * for exactly this.
 *
 * Reduced motion needs no rule here. The hook never subscribes under the
 * preference and clears the inline `opacity` the moment it turns on, so the
 * glyph holds at the full `text-primary` its class gives it - tone intact,
 * sweep gone - and the chip still says "running" in the tone it shares with
 * its count.
 */
function ShimmeringGlyph(props: { readonly icon: LucideIcon }) {
  const ref = useRef<SVGSVGElement | null>(null);
  const write = useCallback((element: SVGSVGElement, elapsedMs: number) => {
    element.style.opacity = glyphShimmerOpacity(elapsedMs).toFixed(3);
  }, []);
  const clear = useCallback((element: SVGSVGElement) => {
    element.style.opacity = "";
  }, []);
  useStatusAnimation(ref, write, clear, STATUS_ANIMATION_PULSE_CADENCE_MS);
  const Icon = props.icon;
  return (
    <Icon
      ref={ref}
      data-chip-glyph-shimmer
      className="size-3.5 shrink-0 text-primary"
      aria-hidden
    />
  );
}

/**
 * The section's icon, lit while its section is busy.
 *
 * Activity is carried BY the icon rather than by a glyph that replaces it: the
 * icon is the only thing saying which section a chip stands for, and swapping
 * it for a spinner made two busy chips read as one repeated thing.
 *
 * And it is carried by the icon ALONE, now that the chip prints no word for it:
 * a chip is `[icon] N` at every width. The glyph says it twice over -
 * `text-primary` displacing the chip's muted inherit, and a shimmer sweeping
 * that tone - and the count beside it turns `primary` too, in
 * `ChatDockCompactChip`, since it is text.
 *
 * It says it in those two channels and no more. A filled dot at the glyph's
 * top-right corner, throwing the app's ping ring, was the third; at this size
 * it landed ON the icon rather than beside it, so a terminal running under a
 * mark obscuring its own corner read as neither. One mark, one meaning: the
 * icon is the section AND the state, and nothing overlaps it.
 *
 * The shimmer is clock-driven rather than a CSS `animation` - the always-on
 * indicator rule `status-animation-clock.ts` and `index.css` both record. It
 * does not subscribe under reduced motion, where the glyph simply holds its
 * full tone; the tones are unconditional, so the reduced-motion chip still
 * says "running" with no media query of its own.
 *
 * `data-chip-glyph-shimmer` on the glyph is the hook for the suites that pin
 * this; a resting chip renders the bare icon without it.
 */
function ChipGlyph(props: {
  readonly glyph: ChatDockCompactChipGlyph;
  readonly working: boolean;
}) {
  const Icon = GLYPH_ICONS[props.glyph];
  if (!props.working) {
    return <Icon className="size-3.5 shrink-0" aria-hidden />;
  }
  return <ShimmeringGlyph icon={Icon} />;
}

/**
 * A pill arriving and a pill leaving, in the values the rest of the window
 * already keeps: the leader badge's 140ms `easeOut` on the way in, a touch
 * shorter on the way out.
 *
 * `0.96` rather than `0` because a pill that grows from nothing reads as a
 * thing being BUILT beside the input; 4% is the smallest amount that still
 * says "this was not here a moment ago" while the pill stays the same object
 * throughout. Only `transform` and `opacity` move, so nothing here reflows the
 * composer underneath.
 */
const PILL_HIDDEN = { opacity: 0, scale: 0.96 } as const;
const PILL_SHOWN = { opacity: 1, scale: 1 } as const;
const PILL_ENTER_TRANSITION = { duration: 0.14, ease: "easeOut" } as const;
const PILL_EXIT = {
  ...PILL_HIDDEN,
  transition: { duration: 0.11, ease: "easeOut" },
} as const;

/**
 * What a pill does on the way out with motion turned off: goes, in the frame
 * it was removed in. Not "the same exit with a zero duration written on the
 * strip", because the exit's own duration is what holds the element in the
 * document, and a pill that lingers invisibly is still a pill the pointer can
 * be over.
 */
const PILL_EXIT_INSTANT = { opacity: 0, transition: { duration: 0 } } as const;

/**
 * One pill, and the element the Customize editor knows it by.
 *
 * The region marking is on the INNER span rather than on the animated one, and
 * it is taken off the moment this pill starts leaving. That is the whole
 * reason this is a component and not two lines in the map below: an exiting
 * `popLayout` ghost is still in the document while it fades, and a ghost still
 * wearing `data-layout-region` / `data-layout-group` is a member the canvas
 * drag would reflow against and the editor's registry would hand a rect for -
 * a dead member, out of flow, that the arrangement no longer contains.
 * `useIsPresent` flips on the exit, React hands the old ref its `null`, and
 * `useLayoutRegion` unnames and unregisters the node on the spot.
 *
 * The drag's own transforms are written on that inner span; the animated one
 * is its parent and they compose rather than fight. Nothing arrives or leaves
 * mid-drag anyway - a drag reorders the members that are there - so the two
 * never run on the same element at the same time.
 */
function ChatDockCompactPill(props: {
  readonly chip: ChatDockCompactChipModel;
  readonly editing: boolean;
  readonly expanded: boolean;
  readonly controls: string | null;
  readonly onToggle: () => void;
}): ReactNode {
  const present = useIsPresent();
  return (
    <span
      // `contents` at rest, a real box while a session is live: the hotspot
      // ref lands here, and a `display: contents` node has no rect for the
      // hover outline or the travelling ring to measure (C-06).
      className={cn(props.editing ? "inline-flex items-center" : "contents")}
      ref={present ? props.chip.hotspotRef : null}
    >
      <ChatDockCompactChip
        icon={
          <ChipGlyph glyph={props.chip.glyph} working={props.chip.working} />
        }
        text={props.chip.text}
        working={props.chip.working}
        lineDeltas={props.chip.lineDeltas}
        label={props.chip.label}
        pulseToken={props.chip.pulseToken}
        expanded={props.expanded}
        controls={props.controls}
        testId={`chat-dock-chip-${props.chip.section}`}
        onClick={props.onToggle}
      />
    </span>
  );
}

/**
 * The compact chips, side by side ABOVE the composer at its left edge (A12,
 * L-97) - the one thing the owner kept from the artifact's compact composer.
 *
 * They used to close the composer's workspace ROW, at its right edge, where
 * `overflow-hidden` clipped anything that overhung and a chip could only ever
 * appear between the workspace picker and the context-usage cluster. Above the
 * input they read as what they are: the dock's own members, folded, adjacent to
 * the rows they open.
 *
 * It wraps rather than truncates: a narrow tile gets a second line of pills,
 * which costs 24px of the transcript and is what a chip-sized member is for.
 *
 * Renders nothing outside a chat tile, and nothing inside one whose every row
 * is either on screen or empty.
 *
 * The pills are a SWITCHER (L-142): at most one of them has its panel attached
 * above the composer, clicking another replaces it, and clicking the open one
 * closes it. `actionsRef` is the node that open panel's actions are portalled
 * into - it holds the row's right end, so pills never move when actions appear
 * and never move back when they go.
 *
 * ONE quick-verb menu for the whole row (L-115, L-144), naming whichever pill
 * the pointer was over. The pills are regions like any other piece of
 * customizable chrome and the owner asked for them to answer a right-click
 * like one; a root per pill would be five roots per tile for a gesture used a
 * handful of times a session, which is the arithmetic G3-10 already settled.
 */
export function ChatDockCompactStrip(props: {
  readonly actionsRef: (node: HTMLDivElement | null) => void;
  /**
   * Whether this chat's snapshot has landed - the dock's hydration signal,
   * passed down rather than read here because the dock owns it already.
   */
  readonly snapshotLoaded: boolean;
}): ReactNode {
  // Destructured before it reaches a `ref=`: `react-hooks/refs` reads a ref
  // callback taken off a props BAG as a ref access during render.
  const { actionsRef } = props;
  const editing = useLayoutEditorStore((state) => state.session !== null);
  const value = useChatDockCompactStrip();
  const motionEnabled = useMotionEnabled();
  const hasChips = value !== null && value.chips.length > 0;
  // The strip arms itself one commit after it has drawn a pill over SETTLED
  // data, and suppresses the pulse of every pill until then. Opening a chat is
  // not an arrival: five pills reaching their first paint together rang five
  // rings at once beside the input, for nothing that had happened. A pill that
  // arrives after this has flipped still rings exactly as before, because the
  // chip reads it once in its own state initializer.
  //
  // Both halves of the condition are load-bearing, and each answers a hole the
  // other leaves. "This strip has COMMITTED" is not enough: the strip mounts
  // whenever the dock renders at all, including for a chat that has rows and
  // no pills, so an empty first commit would arm it and the next burst - every
  // pill a turn brings at once - would ring together, which is L-148's failure
  // through the other door. And "the snapshot has LOADED" is not enough
  // either, because the pills are built from five independently arriving
  // sources in `chat-tile-lower-surfaces.tsx`: the queue comes from the
  // session store and the background rows from the host's own stream, neither
  // of which waits for the snapshot, so a strip can hold a pill before the
  // snapshot lands and would then be armed for the burst the snapshot brings
  // with it (`changesPresent` and `todoHasContent` are both gated on it).
  // Requiring both means the arming commit is the first one in which this dock
  // has real data AND something to draw, and everything arriving in it is
  // hydration by construction.
  //
  // "Has committed once" is the one fact a render cannot compute, which is why
  // `react-hooks/set-state-in-effect` is turned off for this file in
  // `eslint.config.mjs` rather than worked around; the reasoning is there.
  const [settled, setSettled] = useState(false);
  const snapshotLoaded = props.snapshotLoaded;
  useEffect(() => {
    if (!snapshotLoaded || !hasChips) return;
    setSettled(true);
  }, [snapshotLoaded, hasChips]);
  if (value === null || !hasChips) return null;
  return (
    <LayoutClusterContextMenu>
      <div
        data-testid="chat-dock-compact-strip"
        {...{ [LAYOUT_CLUSTER_ATTRIBUTE]: "" }}
        className="flex min-w-0 flex-wrap items-center gap-1.5"
      >
        <ChatDockChipArrival suppressed={!settled}>
          {/* `initial={false}` is mandatory rather than stylistic: without it
              a chat opening would animate every pill it opens with, which is
              the same first-paint noise the pulse suppression above removes.
              `popLayout` takes an exiting pill out of flow so the gap closes
              in one frame exactly as it does today and only the ghost fades.
              And no `layout` prop anywhere here: this row is `flex-wrap`
              directly above the composer, so a layout animation across a wrap
              boundary would move the input. */}
          <AnimatePresence initial={false} mode="popLayout">
            {value.chips.map((chip) => (
              <m.span
                key={chip.section}
                className="inline-flex shrink-0 items-center"
                initial={motionEnabled ? PILL_HIDDEN : false}
                animate={PILL_SHOWN}
                exit={motionEnabled ? PILL_EXIT : PILL_EXIT_INSTANT}
                transition={PILL_ENTER_TRANSITION}
              >
                <ChatDockCompactPill
                  chip={chip}
                  editing={editing}
                  expanded={value.openSection === chip.section}
                  controls={
                    value.openSection === chip.section ? value.panelId : null
                  }
                  onToggle={() => {
                    value.onToggle(chip.section);
                  }}
                />
              </m.span>
            ))}
          </AnimatePresence>
        </ChatDockChipArrival>
        {/* Always mounted, empty while nothing is open: `ml-auto` on an empty
            box takes the row's slack and nothing else, so the pills sit where
            they sat before the panel opened. It wraps with the pills on a
            narrow tile rather than squeezing them. */}
        <div
          ref={actionsRef}
          data-testid="chat-dock-pill-actions"
          className="ml-auto flex shrink-0 items-center gap-1"
        />
      </div>
    </LayoutClusterContextMenu>
  );
}
