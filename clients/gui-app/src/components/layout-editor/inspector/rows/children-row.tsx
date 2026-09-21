import type { ReactNode } from "react";
import {
  OrderGroupHeader,
  OrderGroupList,
} from "@/components/layout-editor/inspector/rows/order-group-list";
import type { LayoutArrangement } from "@/lib/layout/layout-arrangement";
import type { LayoutValues } from "@/lib/layout/layout-values";
import type { RateLimitProviderId } from "@/lib/rate-limit-providers";

/**
 * Usage limits' own second level in the DOCK (L-26): the provider list, each
 * row opening that provider's own screen with a back row (L-89).
 *
 * Dock-only now. On the page the same list is a headed list in the Status bar
 * card, a sibling of the two region rows rather than a disclosure inside one
 * of them (L-123): a provider's limits used to be five levels down - Usage
 * limits row, disclosure, Providers list, provider row, disclosure - and are
 * two now. That is why this component no longer has a host branch, a
 * `useState` or a row decorator: they existed only for the in-place branch the
 * page no longer takes.
 */
export function ProvidersChildrenRow(props: {
  readonly values: LayoutValues;
  readonly arrangement: LayoutArrangement;
  /**
   * How a provider's own screen is opened. Nullable because `GrammarRowView`'s
   * prop is: the page composes that switch too, and passes `null` because it
   * draws this list itself, a level up.
   */
  readonly onOpenProvider: ((providerId: RateLimitProviderId) => void) | null;
}): ReactNode {
  const { values, arrangement, onOpenProvider } = props;
  return (
    <div className="flex flex-col border-t border-border">
      {/* The list's own header, drawn from the one component both hosts compose
        (R3-11): the house's row shape rather than `text-overline uppercase`,
        which is used nowhere else in the settings tree (L-127), and the
        operating instruction as the header's description rather than a
        footnote under the list. No verb beside it - a group revert belongs to
        the page, where there is no Undo. */}
      <OrderGroupHeader group="usageProviders" action={null} />
      <OrderGroupList
        group="usageProviders"
        selectedId={null}
        values={values}
        arrangement={arrangement}
        onOpenProvider={onOpenProvider}
        decorate={null}
      />
    </div>
  );
}
