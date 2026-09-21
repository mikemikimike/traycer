import type { ReactNode } from "react";
import { Gauge } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { InspectorRow } from "@/components/layout-editor/inspector/inspector-row";
import { useProviderLimitWindows } from "@/components/layout-editor/inspector/provider-limit-windows";
import { SegmentedControl } from "@/components/layout-editor/inspector/segmented-control";
import { SpecimenStage } from "@/components/layout-editor/inspector/specimen-stage";
import { depictUsageProvider } from "@/components/layout-editor/region-depiction";
import type { StatusBarRateLimitWindow } from "@/hooks/rate-limits/use-status-bar-rate-limit-segments";
import {
  AUTOMATIC_LIMIT_SELECTION,
  type LayoutArrangement,
  type StatusBarProviderLimitSelection,
} from "@/lib/layout/layout-arrangement";
import { USAGE_PROVIDER_LEVEL } from "@/components/layout-editor/regions/usage-provider-level";
import { effectiveLayoutValues } from "@/lib/layout/layout-presets";
import { providerDisplayName } from "@/lib/provider-ordering";
import type { RateLimitProviderId } from "@/lib/rate-limit-providers";
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
 * through `useProviderLimitWindows` - the strip's own read, observed
 * passively, never a query of this level's own (L-96).
 */
export function ProviderLevel(props: ProviderLevelProps): ReactNode {
  const { providerId } = props;
  const basePreset = useLayoutStore((state) => state.basePreset);
  const overrides = useLayoutStore((state) => state.overrides);
  const arrangement = useLayoutStore((state) => state.arrangement);
  const { windows, drawnKeys } = useProviderLimitWindows(providerId);
  const values = effectiveLayoutValues(basePreset, overrides);
  const providerName = providerDisplayName(providerId);
  const shown = !arrangement.hiddenProviders.includes(providerId);
  const selection =
    arrangement.providerLimits[providerId] ?? AUTOMATIC_LIMIT_SELECTION;
  // The two modes are exclusive by construction: `Automatic` is an empty pick
  // list and `Choose...` is a non-empty one, so "switching back to Automatic
  // clears the picks" (L-96) is not a second rule to keep - it is the only way
  // back. A pick that no longer names a live window still counts as choosing:
  // the strip falls back to the tightest for the drawing, and silently
  // demoting the level to `Automatic` would throw the pick away on a reading
  // the user never saw.
  const choosing = selection.limitKeys.length > 0;
  const picked = new Set(selection.limitKeys);
  const pickingLimits = choosing && windows.length > 0;

  return (
    <div className="flex flex-col">
      <SpecimenStage off={!shown}>
        {depictUsageProvider(
          providerId,
          values.usageLimits,
          arrangement,
          windows.filter((window) => drawnKeys.includes(window.windowKey)),
        )}
      </SpecimenStage>
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
      <div className={!shown ? "pointer-events-none opacity-40" : undefined}>
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
                options={USAGE_PROVIDER_LEVEL.limitsOptions}
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
                <p className="text-ui-xs text-muted-foreground">
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
      </div>
    </div>
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
  return { automatic: false, limitKeys: seed };
}

/** One box ticked or cleared, kept in the catalog's own order. */
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
  return { automatic: false, limitKeys: order.filter((key) => next.has(key)) };
}

function toggleHiddenProvider(
  providerId: RateLimitProviderId,
  arrangement: LayoutArrangement,
  shown: boolean,
): void {
  useLayoutEditorStore.getState().recordGesture(() => {
    const hidden = shown
      ? arrangement.hiddenProviders.filter((entry) => entry !== providerId)
      : [...arrangement.hiddenProviders, providerId];
    useLayoutStore
      .getState()
      .setArrangement({ ...arrangement, hiddenProviders: hidden });
  });
}

/**
 * One provider's whole selection, written through the existing
 * `providerLimits` arrangement seam as ONE recorded gesture - so a tick, a
 * clear and a mode switch are each one press of undo.
 */
function writeSelection(
  providerId: RateLimitProviderId,
  arrangement: LayoutArrangement,
  selection: StatusBarProviderLimitSelection,
): void {
  useLayoutEditorStore.getState().recordGesture(() => {
    useLayoutStore.getState().setArrangement({
      ...arrangement,
      providerLimits: {
        ...arrangement.providerLimits,
        [providerId]: selection,
      },
    });
  });
}
