import { useId, type ReactNode } from "react";
import { Gauge } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { InspectorRow } from "@/components/layout-editor/inspector/inspector-row";
import {
  ProviderLimitWindowsReader,
  type ProviderLimitWindows,
} from "@/components/layout-editor/inspector/provider-limit-windows";
import { SegmentedControl } from "@/components/layout-editor/inspector/segmented-control";
import { useLayoutUsage } from "@/components/layout-editor/inspector/use-layout-usage";
import { SpecimenStage } from "@/components/layout-editor/inspector/specimen-stage";
import { toggleHiddenProvider } from "@/components/layout-editor/layout-gestures";
import { depictUsageProvider } from "@/components/layout-editor/region-depiction";
import type { StatusBarRateLimitWindow } from "@/hooks/rate-limits/use-status-bar-rate-limit-segments";
import {
  AUTOMATIC_LIMIT_SELECTION,
  isAutomaticLimitSelection,
  type LayoutArrangement,
  type StatusBarProviderLimitSelection,
} from "@/lib/layout/layout-arrangement";
import { USAGE_PROVIDER_LEVEL } from "@/components/layout-editor/regions/usage-provider-level";
import { effectiveLayoutValues } from "@/lib/layout/layout-presets";
import { providerDisplayName } from "@/lib/provider-ordering";
import type { RateLimitProviderId } from "@/lib/rate-limit-providers";
import { isWindowedRateLimitProvider } from "@/lib/rate-limits/rate-limit-window-catalog";
import { cn } from "@/lib/utils";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import { useLayoutStore } from "@/stores/layout/layout-store";

interface ProviderLevelProps {
  readonly providerId: RateLimitProviderId;
}

/**
 * One provider's own screen (L-26): that provider's own segment on the
 * specimen stage, a Shown switch writing `hiddenProviders`, and the Limits
 * pick (`Automatic` the default). The way back is the shell's shared
 * `InspectorBackRow` (L-89), not a breadcrumb of this level's own - drawing
 * one here is what left the section level, which asked for none, with no way
 * back at all (I-01).
 *
 * The prototype's "Segment details" block is a known, deliberate deviation NOT
 * carried over (C-23, upheld by L-96): two of its three rows wrote a global
 * usage-limits value from a per-provider screen.
 *
 * `Choose...` opens a checklist of this provider's OWN live windows, read
 * through `ProviderLimitWindowsReader` - the strip's own read, observed
 * passively, never a query of this level's own (L-96).
 *
 * The level asks for those windows ONCE and hands them down (R3-15): the stage
 * draws what the strip is drawing and the pick below it operates on the same
 * list, so two subscriptions to the same provider were two answers to one
 * question.
 */
export function ProviderLevel(props: ProviderLevelProps): ReactNode {
  return (
    <ProviderLimitWindowsReader providerId={props.providerId}>
      {(limits) => (
        <ProviderLevelBody providerId={props.providerId} limits={limits} />
      )}
    </ProviderLimitWindowsReader>
  );
}

function ProviderLevelBody(
  props: ProviderLevelProps & {
    readonly limits: ProviderLimitWindows;
  },
): ReactNode {
  const { providerId, limits } = props;
  const basePreset = useLayoutStore((state) => state.basePreset);
  const overrides = useLayoutStore((state) => state.overrides);
  const arrangement = useLayoutStore((state) => state.arrangement);
  const { windows, drawnKeys } = limits;
  const { hostName } = useLayoutUsage();
  const drawnWindows = windows.filter((window) =>
    drawnKeys.includes(window.windowKey),
  );
  const values = effectiveLayoutValues(basePreset, overrides);
  const providerName = providerDisplayName(providerId);
  const shown = !arrangement.hiddenProviders.includes(providerId);

  return (
    <div className="flex flex-col">
      {isWindowedRateLimitProvider(providerId) ? (
        <SpecimenStage
          off={!shown}
          label={drawnWindows.length > 0 ? `Live · ${hostName}` : null}
        >
          {depictUsageProvider(
            providerId,
            values.usageLimits,
            arrangement,
            drawnWindows,
          )}
        </SpecimenStage>
      ) : null}
      <div className="flex items-start gap-2.5 px-3.5 pt-3.5 pb-3">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-foreground">
          <Gauge className="size-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-ui-sm font-medium">{providerName}</div>
          <div className="mt-0.5 text-ui-xs text-muted-foreground">
            {USAGE_PROVIDER_LEVEL.where}
          </div>
        </div>
        <Switch
          aria-label={`Show ${providerName}`}
          checked={shown}
          onCheckedChange={(next) => {
            toggleHiddenProvider(providerId, arrangement, next);
          }}
        />
      </div>
      <ProviderLimitsPick providerId={providerId} limits={limits} />
    </div>
  );
}

/**
 * The Limits pick alone: `Automatic` or `Choose...` plus that provider's own
 * window checklist, with nothing around it (L-96, L-123).
 *
 * The part both hosts draw, and the whole of what the PAGE draws: a provider
 * row there already names the provider and carries its `Shown | Hidden`
 * control, so a stage and an icon-tile header repeating both inside the row's
 * own disclosure was the "page inside a row inside a row" that put a
 * provider's limits five levels down. {@link ProviderLevel} is this plus the
 * stage and the header, for the dock, where the level IS the screen.
 *
 * The dim belongs here rather than to either host: "everything below Shown is
 * greyed" is the grammar's own rule (L-08), and it is the same rule whichever
 * control above it wrote `hiddenProviders`.
 *
 * The PAGE's entry point, and the whole of what it draws: a provider row there
 * has no stage above it to share a reading with, so this is where the windows
 * are read for that host. {@link ProviderLevel} has a stage, so it reads them
 * once itself and passes them straight to {@link ProviderLimitsPick} (R3-15).
 */
export function ProviderLimitsControl(props: ProviderLevelProps): ReactNode {
  return (
    <ProviderLimitWindowsReader providerId={props.providerId}>
      {(limits) => (
        <ProviderLimitsPick providerId={props.providerId} limits={limits} />
      )}
    </ProviderLimitWindowsReader>
  );
}

/** The pick itself, over windows its caller has already read. */
function ProviderLimitsPick(props: {
  readonly providerId: RateLimitProviderId;
  readonly limits: ProviderLimitWindows;
}): ReactNode {
  const { providerId, limits } = props;
  const emptyReasonId = useId();
  const { windows, drawnKeys } = limits;
  const arrangement = useLayoutStore((state) => state.arrangement);
  const shown = !arrangement.hiddenProviders.includes(providerId);
  const selection =
    arrangement.providerLimits[providerId] ?? AUTOMATIC_LIMIT_SELECTION;
  // The two modes are exclusive by construction: `Automatic` is an empty pick
  // list and `Choose...` is a non-empty one, so "switching back to Automatic
  // clears the picks" (L-96) is not a second rule to keep - it is the only way
  // back. With no windows the control displays Automatic, but retains stored
  // picks so they return when the watched host reports those windows again.
  const choosing = windows.length > 0 && selection.limitKeys.length > 0;
  const picked = new Set(selection.limitKeys);
  const pickingLimits = choosing;

  if (!isWindowedRateLimitProvider(providerId)) return null;

  return (
    // GREYED IN PLACE, which is what L-08 asks for and what `inert` was not
    // (R3-16): `inert` takes the subtree out of the accessibility tree
    // altogether, so a screen-reader user who turned a provider off could no
    // longer read what its greyed limits say.
    //
    // A disabled `fieldset` is the one element that turns every control inside
    // it off without hiding any of them: the mode pick's buttons and the window
    // checkboxes stop being operable by pointer OR keyboard, and each is still
    // announced, with its state. The four utilities undo the UA's own fieldset
    // box, which Tailwind's preflight does not reset.
    <fieldset
      disabled={!shown}
      aria-disabled={!shown}
      className={cn(
        "m-0 min-w-0 border-0 p-0",
        !shown && "pointer-events-none opacity-40",
      )}
    >
      <InspectorRow
        top
        // The two options read "Automatic (recommended)" and "Choose...",
        // about 200px of a 292px content box: inline, the label column was
        // handed what was left and broke at every space (I-05). A control
        // too wide for its row goes on its own line, which is the
        // prototype's own answer for the same shape (`.srow.stacked`).
        stacked
        label={USAGE_PROVIDER_LEVEL.limitsLabel}
        description={USAGE_PROVIDER_LEVEL.limitsDescription}
        control={
          <div className="flex flex-col gap-2.5">
            <SegmentedControl
              ariaLabel={USAGE_PROVIDER_LEVEL.limitsLabel}
              options={USAGE_PROVIDER_LEVEL.limitsOptions.map((option) => ({
                ...option,
                disabled: option.value === "choose" && windows.length === 0,
                describedBy:
                  option.value === "choose" && windows.length === 0
                    ? emptyReasonId
                    : undefined,
              }))}
              value={choosing ? "choose" : "automatic"}
              onChange={(next) => {
                if (next !== "choose") {
                  writeSelection(
                    providerId,
                    arrangement,
                    AUTOMATIC_LIMIT_SELECTION,
                  );
                  return;
                }
                // Nothing reported yet: there is no list to open and an
                // empty pick would be a selection that draws nothing, so
                // the level stays on Automatic and says why (L-96).
                if (windows.length === 0) return;
                writeSelection(
                  providerId,
                  arrangement,
                  chosenSelection(drawnKeys, windows),
                );
              }}
            />
            {windows.length === 0 ? (
              <p
                id={emptyReasonId}
                className="text-ui-xs text-muted-foreground"
              >
                {USAGE_PROVIDER_LEVEL.limitsEmpty}
              </p>
            ) : null}
            {pickingLimits ? (
              <div
                role="group"
                aria-label={USAGE_PROVIDER_LEVEL.limitsPickLabel}
                className="flex flex-col gap-1.5"
              >
                {windows.map((window) => {
                  const checked = picked.has(window.windowKey);
                  // The last one on screen cannot be unticked: a selection
                  // that draws nothing is what the Shown switch above is
                  // for, and the store refuses it anyway (L-96).
                  const last = checked && picked.size <= 1;
                  return (
                    <label
                      key={window.windowKey}
                      className="flex items-center gap-2 text-ui-sm"
                    >
                      <Checkbox
                        checked={checked}
                        disabled={last}
                        onCheckedChange={(next) => {
                          writeSelection(
                            providerId,
                            arrangement,
                            togglePick(
                              selection,
                              windows.map((entry) => entry.windowKey),
                              window.windowKey,
                              next === true,
                            ),
                          );
                        }}
                      />
                      {window.label}
                    </label>
                  );
                })}
              </div>
            ) : null}
          </div>
        }
      />
    </fieldset>
  );
}

/**
 * What `Choose...` starts from: whatever the strip is drawing for this
 * provider right now, so taking control of the pick does not change the
 * picture in the same gesture. A provider with a reading but no resolved
 * window falls back to its first, because the mode IS the pick list being
 * non-empty and an empty one would bounce straight back to `Automatic`.
 */
function chosenSelection(
  drawnKeys: ReadonlyArray<string>,
  windows: ReadonlyArray<StatusBarRateLimitWindow>,
): StatusBarProviderLimitSelection {
  const seed =
    drawnKeys.length > 0
      ? drawnKeys
      : windows.slice(0, 1).map((window) => window.windowKey);
  return { limitKeys: seed };
}

/**
 * One box ticked or cleared, kept in the catalog's own order.
 *
 * A pick the host no longer reports is KEPT, appended after the live ones: the
 * comment above says a stale pick survives because demoting it would throw the
 * pick away on a reading the user never saw, and filtering the whole list
 * through the live keys made the next tick do exactly that (R1-16). The live
 * ones lead so the stored order still reads as the catalog's.
 */
function togglePick(
  selection: StatusBarProviderLimitSelection,
  order: ReadonlyArray<string>,
  windowKey: string,
  checked: boolean,
): StatusBarProviderLimitSelection {
  const next = new Set(selection.limitKeys);
  if (checked) next.add(windowKey);
  else next.delete(windowKey);
  if (next.size === 0) return selection;
  const live = order.filter((key) => next.has(key));
  const stale = selection.limitKeys.filter(
    (key) => next.has(key) && !order.includes(key),
  );
  return { limitKeys: [...live, ...stale] };
}

/**
 * One provider's whole selection, written through the existing
 * `providerLimits` arrangement seam as ONE recorded gesture - so a tick, a
 * clear and a mode switch are each one press of undo.
 *
 * Automatic is written by DELETING the key, exactly as `revertProvider` puts a
 * provider back: the entry and its absence mean the same thing to every reader
 * (`statusBarProviderLimitSelection`), so storing one was a mark on the
 * arrangement with nothing behind it (R1-03).
 */
function writeSelection(
  providerId: RateLimitProviderId,
  arrangement: LayoutArrangement,
  selection: StatusBarProviderLimitSelection,
): void {
  useLayoutEditorStore.getState().recordGesture(() => {
    const providerLimits = { ...arrangement.providerLimits };
    if (isAutomaticLimitSelection(selection)) delete providerLimits[providerId];
    else providerLimits[providerId] = selection;
    useLayoutStore
      .getState()
      .setArrangement({ ...arrangement, providerLimits });
  });
}
