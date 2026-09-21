import { useState, type MouseEvent, type ReactNode } from "react";
import { useNavigate, type UseNavigateResult } from "@tanstack/react-router";
import { Eye, EyeOff, Layers, PanelTop } from "lucide-react";
import { toast } from "sonner";
import { CustomizeLayoutMenuItem } from "@/components/layout-editor/customize-layout-menu-item";
import { regionShownOnValue } from "@/components/layout-editor/layout-gestures";
import {
  readControlValue,
  writeControlValue,
  type RegionControlValue,
} from "@/components/layout-editor/inspector/region-control-io";
import {
  offeredQuickVerbs,
  quickVerbLabel,
  quickVerbToast,
} from "@/components/layout-editor/regions/quick-verbs";
import {
  LAYOUT_REGION_IDS,
  regionFacts,
} from "@/components/layout-editor/regions/region-facts";
import type {
  LayoutRegionIcon,
  QuickVerbId,
} from "@/components/layout-editor/regions/region-grammar";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Analytics, AnalyticsEvent } from "@/lib/analytics";
import { useRegionValues } from "@/lib/layout-overrides";
import { openLayoutEditor } from "@/lib/layout/editor-session";
import type { LayoutValues, RegionValueKey } from "@/lib/layout/layout-values";
import type { RegionId } from "@/lib/layout/region-id";

/**
 * Right-click on a piece of the app's own chrome (L-19).
 *
 * Three things live here because they are the same offer made in three
 * places: chrome that has no menu of its own gets
 * {@link LayoutRegionContextMenu}, a CONTAINER of such chrome gets
 * {@link LayoutClusterContextMenu}, and chrome that already has a menu renders
 * {@link LayoutRegionMenuItems} inside it. The choice is the call site's
 * because only it knows which of the three it is; what it must not do is give
 * a piece of chrome TWO offers for the same press, which is a menu that names
 * the region and a menu that names the row underneath it, whichever of the two
 * happens to win.
 *
 * A quick verb does NOT enter the editor: it writes the same value the
 * inspector's own switch writes, through the same `region-control-io` seam, and
 * the toast is what reverses it. "Customize layout..." is the way in, and it
 * always opens on the region that was right-clicked.
 */

/**
 * One toast id for every quick verb, so a second verb REPLACES the first's
 * toast rather than stacking beside it.
 *
 * That is what makes Undo exact with no history to consult: the only Undo on
 * screen is the one belonging to the last verb, and it carries that verb's own
 * previous value rather than a snapshot of the whole layout - so it cannot
 * take back a change made between the verb and the press, from this menu or
 * from anywhere else.
 */
const QUICK_VERB_TOAST_ID = "layout-quick-verb";

/** The plan's frozen dismiss for this toast. */
const QUICK_VERB_TOAST_DURATION_MS = 5000;

/**
 * The verb whose toast is still on screen and unresolved, so `layout_quick_verb`
 * can be sent once the toast resolves rather than once per keystroke (L-19,
 * L-46). One slot, because one toast is ever up (`QUICK_VERB_TOAST_ID`): a
 * second verb replaces the first's toast before it resolves either way, which
 * is exactly the case {@link resolvePendingQuickVerb} at the top of
 * {@link run} covers - the superseded verb stood, so it is reported
 * `undone: false` right there rather than lost.
 */
let pendingQuickVerb: {
  readonly regionId: RegionId;
  readonly verb: QuickVerbId;
} | null = null;

function resolvePendingQuickVerb(undone: boolean): void {
  const verb = pendingQuickVerb;
  if (verb === null) return;
  pendingQuickVerb = null;
  Analytics.getInstance().track(AnalyticsEvent.LayoutQuickVerb, {
    region: verb.regionId,
    verb: verb.verb,
    undone,
  });
}

const QUICK_VERB_ICON: Readonly<Record<QuickVerbId, LayoutRegionIcon>> = {
  hide: EyeOff,
  show: Eye,
  chip: Layers,
  full: PanelTop,
};

/**
 * The whole gesture behind a menu item's press, up to and including the
 * pending-verb bookkeeping above (`react-hooks/globals` bans mutating
 * module-scope state from inside a component or hook body, so this - the
 * only piece of {@link LayoutRegionMenuItems} that does - lives outside it
 * instead, called with everything it needs rather than closing over render
 * state).
 */
function runQuickVerb(input: {
  readonly regionId: RegionId;
  readonly verb: QuickVerbId;
  readonly regionName: string;
  readonly values: LayoutValues[RegionId];
  readonly navigate: UseNavigateResult<string>;
}): void {
  const { regionId, verb, regionName, values, navigate } = input;
  // A verb still pending when a new one lands never gets its own
  // dismiss/expire callback - its toast is replaced, not closed - so it is
  // resolved right here as "stood" before the new one's toast opens.
  resolvePendingQuickVerb(false);
  const key = quickVerbKey(verb);
  const previous = readControlValue(values, key);
  writeControlValue(regionId, key, quickVerbValue(verb, regionId));
  pendingQuickVerb = { regionId, verb };
  toast(quickVerbToast(verb, regionName), {
    id: QUICK_VERB_TOAST_ID,
    duration: QUICK_VERB_TOAST_DURATION_MS,
    // Neither fires for an action/cancel click (sonner calls only that
    // button's own `onClick`), only for an auto-expire or an explicit
    // dismiss - which is exactly the "stood" half of `undone`.
    onAutoClose: () => {
      resolvePendingQuickVerb(false);
    },
    onDismiss: () => {
      resolvePendingQuickVerb(false);
    },
    // Undo is the emphasised button and "Customize layout..." the quiet one,
    // which is the reverse of sonner's own order: leaving the app for the
    // editor is the larger of the two moves, and it must not be the one a
    // reflex press lands on.
    action: {
      label: "Undo",
      onClick: () => {
        writeControlValue(regionId, key, previous);
        resolvePendingQuickVerb(true);
      },
    },
    cancel: {
      label: "Customize layout...",
      onClick: () => {
        resolvePendingQuickVerb(false);
        openLayoutEditor({
          source: "direct_ui",
          entry: "pointer",
          target: regionId,
          navigate,
        });
      },
    },
  });
}

/** The region's own verbs, then the way into the editor on that region. */
export function LayoutRegionMenuItems(props: {
  readonly regionId: RegionId;
}): ReactNode {
  const { regionId } = props;
  const facts = regionFacts(regionId);
  const values = useRegionValues(regionId);
  const navigate = useNavigate();

  const hidden = readControlValue(values, "shown") === "hidden";
  // Asked only of a region whose registry entry says it has a size; a region
  // without one has no `size` leaf to read.
  const sizeable = facts.quickVerbs.includes("chip");
  const chip = sizeable && readControlValue(values, "size") === "chip";
  const verbs = offeredQuickVerbs(facts.quickVerbs, { hidden, chip });

  const run = (verb: QuickVerbId): void => {
    runQuickVerb({
      regionId,
      verb,
      regionName: facts.name,
      values,
      navigate,
    });
  };

  return (
    <>
      {verbs.map((verb) => {
        const Icon = QUICK_VERB_ICON[verb];
        return (
          <ContextMenuItem
            key={verb}
            data-testid={`layout-quick-verb-${regionId}-${verb}`}
            onSelect={() => {
              run(verb);
            }}
          >
            <Icon aria-hidden />
            {quickVerbLabel(verb, facts.name)}
          </ContextMenuItem>
        );
      })}
      {verbs.length > 0 ? <ContextMenuSeparator /> : null}
      <CustomizeLayoutMenuItem target={regionId} />
    </>
  );
}

/** A region's menu, for chrome that has none of its own. */
export function LayoutRegionContextMenu(props: {
  readonly regionId: RegionId;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <ContextMenu>
      {/* `display: contents` generates no box, so the chrome this wraps keeps
          its own place in its parent's flex or grid row; the span is only
          somewhere for Radix to hang the trigger's handlers, which the real
          control's own contextmenu event bubbles up to. Wrapping here rather
          than at each call site means a site can hand this a COMPONENT - the
          Home item, a toolbar picker - without that component having to
          forward the trigger's props to a DOM node. */}
      <ContextMenuTrigger asChild>
        <span className="contents">{props.children}</span>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <LayoutRegionMenuItems regionId={props.regionId} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

/**
 * One menu for a whole strip of regions, naming whichever one the pointer was
 * over (G3-10).
 *
 * A root per ITEM is what this replaces: the composer's two clusters draw
 * seven controls between them and every open chat tile draws both, so a
 * four-tile canvas was carrying twenty-eight Radix roots and twenty-eight
 * trigger spans for a gesture used a handful of times a session. The region is
 * resolved from the event the same way the canvas resolves a hover, so the
 * verbs are still per item.
 *
 * The child is the cluster's own box, taken `asChild`, so this adds no element
 * of its own.
 *
 * It is the right shape for any container of regions, not only a strip of
 * small controls: the dock's pill row and the joined frame of full rows each
 * take one (L-144), which is what gives every dock member its verbs for two
 * roots per tile rather than one per member. A container holds controls that
 * may own their own right-click (a file row, a queue item), and the innermost
 * menu wins with nothing written here: Radix's trigger composes the caller's
 * handler ahead of its own opener and SKIPS that opener once the event is
 * default-prevented, which the inner trigger has already done by the time the
 * event reaches this one. The quick verbs are left to the row's header and its
 * empty space, where nothing else is listening
 * (`region-quick-verbs.test.tsx` pins both halves).
 */
export function LayoutClusterContextMenu(props: {
  readonly children: ReactNode;
}): ReactNode {
  const [regionId, setRegionId] = useState<RegionId | null>(null);
  return (
    <ContextMenu>
      <ContextMenuTrigger
        asChild
        onContextMenu={(event: MouseEvent<HTMLElement>) => {
          const region = regionUnder(event.target);
          // Nothing customizable under the pointer - the strip's own gaps.
          // The same composition rule as above: defaulting the event prevented
          // leaves the gap to whatever menu an ancestor owns, or to none.
          if (region === null) event.preventDefault();
          else setRegionId(region);
        }}
      >
        {props.children}
      </ContextMenuTrigger>
      {regionId === null ? null : (
        <ContextMenuContent>
          <LayoutRegionMenuItems regionId={regionId} />
        </ContextMenuContent>
      )}
    </ContextMenu>
  );
}

function regionUnder(target: EventTarget): RegionId | null {
  if (!(target instanceof Element)) return null;
  const value = target
    .closest("[data-layout-region]")
    ?.getAttribute("data-layout-region");
  return LAYOUT_REGION_IDS.find((id) => id === value) ?? null;
}

/** Which leaf a verb writes. */
function quickVerbKey(verb: QuickVerbId): RegionValueKey {
  return verb === "chip" || verb === "full" ? "size" : "shown";
}

/** What it writes there - `show` through the one tri-state rule (L-47). */
function quickVerbValue(
  verb: QuickVerbId,
  regionId: RegionId,
): RegionControlValue {
  switch (verb) {
    case "hide":
      return "hidden";
    case "show":
      return regionShownOnValue(regionId);
    case "chip":
      return "chip";
    case "full":
      return "full";
  }
}
