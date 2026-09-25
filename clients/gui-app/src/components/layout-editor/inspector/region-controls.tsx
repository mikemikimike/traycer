import { useIsMobileViewport } from "@/hooks/ui/use-mobile-viewport";
import { useSettingsAvailabilityContext } from "@/hooks/settings/use-settings-availability-context";
import { isVoiceInputRowAvailable } from "@/lib/settings/settings-availability";
import { useSettingsStore } from "@/stores/settings/settings-store";
import { useId, type ReactNode } from "react";
import { SegmentedControl } from "@/components/layout-editor/inspector/segmented-control";
import {
  readControlValue,
  writeControlValue,
} from "@/components/layout-editor/inspector/region-control-io";
import {
  isRailRegionId,
  regionShownOnValue,
  setRegionShown,
} from "@/components/layout-editor/layout-gestures";
import { regionFacts } from "@/components/layout-editor/regions/region-facts";
import {
  BAR_HOST_OPTIONS,
  EDGE_SIDE_OPTIONS,
  edgeSideOptions,
  SIZE_OPTIONS,
} from "@/components/layout-editor/regions/region-grammar";
import { Switch } from "@/components/ui/switch";
import { writeArrangement } from "@/lib/layout/arrangement-gestures";
import {
  asBarRegionId,
  barPlacement,
  withBarHost,
  withBarSide,
  type BarRegionId,
  type LayoutArrangement,
} from "@/lib/layout/layout-arrangement";
import { PRESET_VALUES } from "@/lib/layout/layout-presets";
import {
  regionValuesHidden,
  type LayoutValues,
} from "@/lib/layout/layout-values";
import type { RegionId } from "@/lib/layout/region-id";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import { useLayoutStore } from "@/stores/layout/layout-store";

/**
 * The bare controls the layout form's settings are operated with, with no row
 * around them.
 *
 * They are split out from the rows that used to own them because the two hosts
 * FRAME the same setting differently: in the dock a region's section gives
 * Shown a header and Size a labelled row, and on the page both sit inline on
 * the region's row inside its surface list (L-95). Framing is the difference
 * the two hosts are allowed to have; the control is not, and a second copy of
 * one is how two vocabularies for one value get built (D5).
 */

/**
 * A region's ONE visibility control, and the only one anywhere on either host.
 *
 * Tri-state for every rail panel (L-47, L-93): the VALUE is three-state for all
 * nine, so a two-position switch could not reach "shown, pinned open" at all
 * and its on position meant `auto` on seven panels and `shown` on none of them.
 * That is also why the eye button on the rail's list rows is gone: it wrote
 * through `regionShownOnValue`, so clicking it twice silently turned a pinned
 * "Shown" back into "Auto" (D5).
 */
export function RegionShownControl(props: {
  readonly regionId: RegionId;
  readonly values: LayoutValues;
}): ReactNode {
  const { regionId, values } = props;
  const facts = regionFacts(regionId);
  if (regionId === "mic")
    return <MicrophoneVisibilityControl values={values} page={false} />;
  if (!regionHides(regionId)) return null;
  const shownValue = String(readControlValue(values[regionId], "shown"));
  if (!offersAuto(regionId)) {
    return (
      <Switch
        aria-label={`Show ${facts.name}`}
        checked={shownValue !== "hidden"}
        onCheckedChange={() => {
          setRegionShown(regionId, shownValue === "hidden");
        }}
      />
    );
  }
  return (
    <SegmentedControl
      ariaLabel={`${facts.name} visibility`}
      value={shownValue}
      options={RAIL_VISIBILITY_OPTIONS}
      onChange={(next) => {
        writeRailVisibility(regionId, next);
      }}
    />
  );
}

/**
 * The PAGE row's ONE state control (L-121), merging what the dock keeps as two
 * rows.
 *
 * A page row is the whole of a region, and it used to carry `Full row | Chip`
 * AND a switch AND a chevron, with the size control staying live and
 * meaningful-looking while the switch was off. One control with two or three
 * options says the same thing once:
 *
 * | Row kind | Options |
 * | --- | --- |
 * | rail panel | `Auto` `Shown` `Hidden` (L-47, L-93) |
 * | sizeable | `Full row` `Chip` `Hidden` |
 * | everything else | `Shown` `Hidden` |
 *
 * `Full row / Chip / Hidden` is not a new value: it is `size` and `shown` read
 * together and written apart. `Hidden` writes `shown` and leaves `size` alone,
 * so a hidden chip still materialises as a chip ghost (L-113) and comes back
 * as a chip when it is shown again; `Full row` or `Chip` writes both in one
 * gesture, so the round trip is lossless and one undo step.
 *
 * The DOCK is deliberately not this control (L-128): the owner approved the
 * artifact's grammar for the inspector, so {@link RegionShownControl} and
 * {@link RegionSizeControl} keep drawing Shown and Size there. Both hosts
 * write the same two stored values, which is the part that is not allowed to
 * fork.
 */
export function RegionDisplayControl(props: {
  readonly regionId: RegionId;
  readonly values: LayoutValues;
}): ReactNode {
  const { regionId, values } = props;
  const facts = regionFacts(regionId);
  const regionValues = values[regionId];
  const hidden = regionValuesHidden(regionValues);
  const narrow = useIsMobileViewport();
  if (regionId === "mic")
    return <MicrophoneVisibilityControl values={values} page />;
  if (regionId === "access" && narrow) return null;
  // One wording for all three option sets, so every row on the page has the
  // same accessible-name pattern whatever its options are.
  const ariaLabel = `${facts.name} display`;

  if (offersAuto(regionId)) {
    return (
      <SegmentedControl
        ariaLabel={ariaLabel}
        value={String(readControlValue(regionValues, "shown"))}
        options={RAIL_VISIBILITY_OPTIONS}
        onChange={(next) => {
          writeRailVisibility(regionId, next);
        }}
      />
    );
  }
  if (facts.rows.some((row) => row.kind === "size")) {
    return (
      <SegmentedControl
        ariaLabel={ariaLabel}
        value={
          hidden ? "hidden" : String(readControlValue(regionValues, "size"))
        }
        options={
          regionHides(regionId) ? SIZEABLE_DISPLAY_OPTIONS : SIZE_OPTIONS
        }
        onChange={(next) => {
          if (next === "hidden") {
            setRegionShown(regionId, false);
            return;
          }
          writeSizeShown(regionId, next);
        }}
      />
    );
  }
  if (!regionHides(regionId)) return null;
  return (
    <SegmentedControl
      ariaLabel={ariaLabel}
      value={hidden ? "hidden" : "shown"}
      options={SHOWN_HIDDEN_OPTIONS}
      onChange={(next) => {
        setRegionShown(regionId, next === "shown");
      }}
    />
  );
}

/**
 * Whether a region can be hidden at all: it has a `shown` leaf. Access and
 * Model do not - each is a floor the composer always draws (G6) - so they get
 * no Shown control and no Hidden option.
 */
function regionHides(regionId: RegionId): boolean {
  return "shown" in PRESET_VALUES.default[regionId];
}

/**
 * Whether a region's Shown has an `Auto` worth offering: a rail panel with a
 * presence rule of its own (L-47). Seven of the nine panels have none - their
 * rule is "always" - so `Auto` and `Shown` drew the same rail and the third
 * option was a choice with no effect (G6). Those get the plain Shown control,
 * whose "on" is still `auto` (`regionShownOnValue`), so nothing stored moves.
 */
function offersAuto(regionId: RegionId): boolean {
  return isRailRegionId(regionId) && regionFacts(regionId).hint !== null;
}

/** The rail's three-state write, from either host's control. */
function writeRailVisibility(regionId: RegionId, next: string): void {
  if (next !== "auto" && next !== "shown" && next !== "hidden") return;
  useLayoutEditorStore.getState().recordGesture(() => {
    useLayoutStore.getState().setRegionValues(regionId, { shown: next });
  });
}

/**
 * Size and Shown as ONE gesture, which is what makes the merged control one
 * undo step rather than two.
 *
 * `Reflect.set` for the same reason `region-control-io.ts` uses it: `keyof
 * LayoutValues[K]` collapses to the one field all twenty-three regions share
 * once the region is a plain `RegionId`, and `setRegionValues` parses the
 * merged patch through the same total resolver a rehydrate uses, so a wrong
 * key cannot persist. Shown goes through `regionShownOnValue` rather than the
 * literal, so there is still one rule for what "on" means (L-47).
 */
function writeSizeShown(regionId: RegionId, size: string): void {
  useLayoutEditorStore.getState().recordGesture(() => {
    const patch: Partial<LayoutValues[RegionId]> = {};
    Reflect.set(patch, "size", size);
    if (regionHides(regionId)) {
      Reflect.set(patch, "shown", regionShownOnValue(regionId));
    }
    useLayoutStore.getState().setRegionValues(regionId, patch);
  });
}

const RAIL_VISIBILITY_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "shown", label: "Shown" },
  { value: "hidden", label: "Hidden" },
];

const HIDDEN_OPTION = { value: "hidden", label: "Hidden" };

const SHOWN_HIDDEN_OPTIONS = [
  { value: "shown", label: "Shown" },
  HIDDEN_OPTION,
];

/**
 * The size words verbatim from the grammar's own set, plus Hidden.
 *
 * Written this way rather than with a third literal so the two hosts cannot
 * end up calling the same stored value "Full row" in one and "Full" in the
 * other.
 */
const SIZEABLE_DISPLAY_OPTIONS = [...SIZE_OPTIONS, HIDDEN_OPTION];

/** Full row or chip, for the elements that shrink rather than disappear. */
export function RegionSizeControl(props: {
  readonly regionId: RegionId;
  readonly regionValues: LayoutValues[RegionId];
}): ReactNode {
  const { regionId, regionValues } = props;
  return (
    <SegmentedControl
      ariaLabel={`${regionFacts(regionId).name} size`}
      options={SIZE_OPTIONS}
      value={String(readControlValue(regionValues, "size"))}
      onChange={(next) => {
        writeControlValue(regionId, "size", next);
      }}
    />
  );
}

/**
 * Which end of its surface an edge-anchored region sits at.
 *
 * Three regions have a side and they are not all the same kind of thing: the
 * minimap's is an edge of the transcript, and the two bar readings' is an end
 * of whichever bar each of them is in (L-156). The write is the model's, so
 * neither answer is spelled as a field name here.
 */
export function RegionSideControl(props: {
  readonly regionId: RegionId;
  readonly arrangement: LayoutArrangement;
}): ReactNode {
  const { regionId, arrangement } = props;
  const bar = asBarRegionId(regionId);
  const narrow = useIsMobileViewport();
  const placement = bar === null ? null : barPlacement(arrangement, bar);
  const host = narrow ? "status-bar" : placement?.host;
  return (
    <SegmentedControl
      ariaLabel={`${regionFacts(regionId).name} side`}
      options={
        placement === null
          ? EDGE_SIDE_OPTIONS
          : edgeSideOptions(host ?? "status-bar", arrangement.tabStripPlacement)
      }
      value={placement === null ? arrangement.minimapSide : placement.side}
      onChange={(next) => {
        if (next !== "left" && next !== "right") return;
        writeArrangement(
          bar === null
            ? { ...arrangement, minimapSide: next }
            : withBarSide(arrangement, bar, next),
        );
      }}
    />
  );
}

/**
 * Which of the two bars one reading lives in (L-156).
 *
 * Its own region's answer and nothing else's: usage limits and the resource
 * monitor each carry this control, and writing one leaves the other exactly
 * where it is.
 */
export function BarHostControl(props: {
  readonly regionId: BarRegionId;
  readonly arrangement: LayoutArrangement;
}): ReactNode {
  const { regionId, arrangement } = props;
  return (
    <SegmentedControl
      ariaLabel={`${regionFacts(regionId).name} position`}
      options={BAR_HOST_OPTIONS}
      value={barPlacement(arrangement, regionId).host}
      onChange={(next) => {
        if (next !== "status-bar" && next !== "header") return;
        writeArrangement(withBarHost(arrangement, regionId, next));
      }}
    />
  );
}

function MicrophoneVisibilityControl(props: {
  readonly values: LayoutValues;
  readonly page: boolean;
}): ReactNode {
  const availability = useSettingsAvailabilityContext();
  const enabled = useSettingsStore((state) => state.voiceInputEnabled);
  const reasonId = useId();
  if (!isVoiceInputRowAvailable(availability)) return null;
  const shown = props.values.mic.shown !== "hidden";
  return (
    <div className="flex min-w-0 flex-col items-start gap-1.5">
      {props.page ? (
        <SegmentedControl
          ariaLabel="Microphone display"
          value={shown ? "shown" : "hidden"}
          options={SHOWN_HIDDEN_OPTIONS.map((option) => ({
            ...option,
            disabled: !enabled,
            describedBy: enabled ? undefined : reasonId,
          }))}
          onChange={(next) => {
            setRegionShown("mic", next === "shown");
          }}
        />
      ) : (
        <Switch
          aria-label="Show Microphone"
          aria-describedby={enabled ? undefined : reasonId}
          disabled={!enabled}
          checked={shown}
          onCheckedChange={(next) => {
            setRegionShown("mic", next);
          }}
        />
      )}
      {!enabled ? (
        <p
          id={reasonId}
          className="whitespace-normal text-ui-xs text-muted-foreground"
        >
          Enable Voice input in General settings to show the microphone.
        </p>
      ) : null}
    </div>
  );
}
