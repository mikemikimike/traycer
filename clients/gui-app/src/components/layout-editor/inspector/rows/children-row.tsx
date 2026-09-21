import { useState, type ReactNode } from "react";
import { useLayoutFormHost } from "@/components/layout-editor/inspector/layout-form-host";
import { ProviderLevel } from "@/components/layout-editor/inspector/provider-level";
import { OrderGroupList } from "@/components/layout-editor/inspector/rows/order-group-list";
import {
  BARE_ROW,
  type SortableRowDecoration,
} from "@/components/layout-editor/inspector/rows/order-row-items";
import { ORDER_GROUPS } from "@/components/layout-editor/regions/surface-groups";
import { providerChanged, revertProvider } from "@/lib/layout/layout-diff";
import { writeArrangement } from "@/components/layout-editor/layout-gestures";
import { RevertButton } from "@/components/layout-editor/inspector/inspector-row";
import type { LayoutArrangement } from "@/lib/layout/layout-arrangement";
import type { LayoutValues } from "@/lib/layout/layout-values";
import { providerDisplayName } from "@/lib/provider-ordering";
import type { RateLimitProviderId } from "@/lib/rate-limit-providers";

/**
 * Usage limits' own second level (L-26): the same provider list the
 * `usageProviders` order group draws, with each row opening that provider the
 * way THIS host opens a level (L-89).
 *
 * In the dock a provider is its own screen with a back row, reached through
 * `onOpenProvider`. On the page there is nowhere to go, so the row's own
 * disclosure opens `ProviderLevel` in place - which is the branch the page
 * carried a dead prop for and never rendered, and the reason per-provider
 * limits were unreachable in any window too narrow for a canvas (D6, P-10).
 */
export function ProvidersChildrenRow(props: {
  readonly values: LayoutValues;
  readonly arrangement: LayoutArrangement;
  readonly onOpenProvider: ((providerId: string) => void) | null;
}): ReactNode {
  const { values, arrangement, onOpenProvider } = props;
  const inPlace = useLayoutFormHost() === "page";
  const [open, setOpen] = useState<ReadonlyArray<string>>([]);

  return (
    <div className="border-t border-border px-3.5 py-3">
      <div className="mb-2 text-overline text-muted-foreground uppercase">
        {ORDER_GROUPS.usageProviders.label}
      </div>
      <OrderGroupList
        group="usageProviders"
        selectedId={null}
        values={values}
        arrangement={arrangement}
        onOpenProvider={
          inPlace || onOpenProvider === null
            ? null
            : (providerId) => {
                onOpenProvider(providerId);
              }
        }
        decorate={
          inPlace
            ? (id) =>
                providerRowDecoration({
                  arrangement,
                  id,
                  open: open.includes(id),
                  onToggleOpen: () => {
                    setOpen((current) =>
                      current.includes(id)
                        ? current.filter((entry) => entry !== id)
                        : [...current, id],
                    );
                  },
                })
            : null
        }
      />
      <p className="mt-1.5 text-ui-xs text-muted-foreground">
        {ORDER_GROUPS.usageProviders.description}
      </p>
    </div>
  );
}

/**
 * One provider row on the page: the provider's own level as the row's
 * disclosure, plus the changed dot and revert its arrangement-only state has
 * never had anywhere (P-6, P-7).
 */
function providerRowDecoration(input: {
  readonly arrangement: LayoutArrangement;
  readonly id: string;
  readonly open: boolean;
  readonly onToggleOpen: () => void;
}): SortableRowDecoration {
  const { arrangement, id, open, onToggleOpen } = input;
  const providerId = usageProviderId(arrangement, id);
  if (providerId === null) return BARE_ROW;
  const changed = providerChanged(arrangement, providerId);
  return {
    changed,
    hint: null,
    control: changed ? (
      <RevertButton
        label={`Revert ${providerDisplayName(providerId)}`}
        onRevert={() => {
          writeArrangement(revertProvider(arrangement, providerId));
        }}
      />
    ) : null,
    detail: <ProviderLevel providerId={providerId} />,
    open,
    onToggleOpen,
  };
}

/**
 * The row's id back as a provider id, by looking it up in the list it came
 * from - the same narrowing-by-selection the order lists use, rather than a
 * predicate that only says an arbitrary string is one (G1-23).
 */
function usageProviderId(
  arrangement: LayoutArrangement,
  id: string,
): RateLimitProviderId | null {
  return arrangement.usageProviders.find((entry) => entry === id) ?? null;
}
