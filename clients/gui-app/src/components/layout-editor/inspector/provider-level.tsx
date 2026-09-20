import type { ReactNode } from "react";
import { ChevronRight, Gauge } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { InspectorRow } from "@/components/layout-editor/inspector/inspector-row";
import { SegmentedControl } from "@/components/layout-editor/inspector/segmented-control";
import { SpecimenStage } from "@/components/layout-editor/inspector/specimen-stage";
import { depictUsageProviderSegment } from "@/lib/layout/region-depiction";
import {
  AUTOMATIC_LIMIT_SELECTION,
  type LayoutArrangement,
} from "@/lib/layout/layout-arrangement";
import { USAGE_PROVIDER_LEVEL } from "@/lib/layout/layout-regions";
import { effectiveLayoutValues } from "@/lib/layout/layout-values";
import { providerDisplayName } from "@/lib/provider-ordering";
import type { RateLimitProviderId } from "@/lib/rate-limit-providers";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import { useLayoutStore } from "@/stores/layout/layout-store";

interface ProviderLevelProps {
  readonly providerId: RateLimitProviderId;
  /**
   * `null` embeds this as its own card, with no breadcrumb (L-26: "the
   * full-width host renders each provider as its own card instead of a
   * second level"); a function draws the breadcrumb back row and calls it
   * (the docked inspector's second level).
   */
  readonly onBack: (() => void) | null;
}

/**
 * One provider's own screen (L-26): a breadcrumb, that provider's own segment
 * on the specimen stage, a Shown switch writing `hiddenProviders`, and the
 * Limits pick (`Automatic` the default). The prototype's "Segment details"
 * block is a known, deliberate deviation NOT carried over (C-23): two of its
 * three rows wrote a global usage-limits value from a per-provider screen.
 *
 * The window checkboxes under `Choose...` need the provider's own live
 * rate-limit windows, which is a host query this ticket does not wire -
 * `Choose...` is reachable and persists the pick, but its window list is left
 * for the ticket that adds the read.
 */
export function ProviderLevel(props: ProviderLevelProps): ReactNode {
  const { providerId, onBack } = props;
  const basePreset = useLayoutStore((state) => state.basePreset);
  const overrides = useLayoutStore((state) => state.overrides);
  const arrangement = useLayoutStore((state) => state.arrangement);
  const values = effectiveLayoutValues(basePreset, overrides);
  const providerName = providerDisplayName(providerId);
  const shown = !arrangement.hiddenProviders.includes(providerId);
  const selection = arrangement.providerLimits[providerId] ?? AUTOMATIC_LIMIT_SELECTION;

  return (
    <div className="flex flex-col">
      {onBack ? (
        <button
          type="button"
          className="flex w-full items-center gap-1.5 border-b border-border px-3.5 py-2.5 text-left text-ui-sm text-muted-foreground hover:text-foreground"
          onClick={onBack}
        >
          <ChevronRight aria-hidden className="size-3.5 rotate-180" />
          <span>{USAGE_PROVIDER_LEVEL.breadcrumb(providerName)}</span>
        </button>
      ) : null}
      <SpecimenStage off={!shown}>
        {depictUsageProviderSegment(providerId, values.usageLimits)}
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
          label={USAGE_PROVIDER_LEVEL.limitsLabel}
          description={USAGE_PROVIDER_LEVEL.limitsDescription}
          control={
            <SegmentedControl
              ariaLabel={USAGE_PROVIDER_LEVEL.limitsLabel}
              options={USAGE_PROVIDER_LEVEL.limitsOptions}
              value={selection.automatic ? "automatic" : "choose"}
              onChange={(next) => {
                setProviderLimitAutomatic(providerId, arrangement, next === "automatic");
              }}
            />
          }
        />
      </div>
    </div>
  );
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
    useLayoutStore.getState().setArrangement({ ...arrangement, hiddenProviders: hidden });
  });
}

function setProviderLimitAutomatic(
  providerId: RateLimitProviderId,
  arrangement: LayoutArrangement,
  automatic: boolean,
): void {
  useLayoutEditorStore.getState().recordGesture(() => {
    const current = arrangement.providerLimits[providerId] ?? AUTOMATIC_LIMIT_SELECTION;
    useLayoutStore.getState().setArrangement({
      ...arrangement,
      providerLimits: {
        ...arrangement.providerLimits,
        [providerId]: { ...current, automatic },
      },
    });
  });
}
