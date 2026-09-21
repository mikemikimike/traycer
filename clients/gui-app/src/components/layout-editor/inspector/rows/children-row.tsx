import type { ReactNode } from "react";
import { OrderGroupList } from "@/components/layout-editor/inspector/rows/order-group-list";
import { useSortableRowPadding } from "@/components/layout-editor/inspector/sortable-row-padding";
import {
  ORDER_GROUPS,
  orderGroupInstruction,
} from "@/components/layout-editor/regions/surface-groups";
import type { LayoutArrangement } from "@/lib/layout/layout-arrangement";
import type { LayoutValues } from "@/lib/layout/layout-values";

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
  readonly onOpenProvider: ((providerId: string) => void) | null;
}): ReactNode {
  const { values, arrangement, onOpenProvider } = props;
  const gutter = useSortableRowPadding();
  return (
    <div className="flex flex-col border-t border-border">
      {/* The house's row shape rather than `text-overline uppercase`, which is
        used nowhere else in the settings tree (L-127), and the operating
        instruction as the header's description rather than a footnote under
        the list. */}
      <div className={gutter.row}>
        <h3 className="font-medium text-foreground">
          {ORDER_GROUPS.usageProviders.label}
        </h3>
        <p className="mt-0.5 max-w-[72ch] text-pretty text-ui-xs text-muted-foreground">
          {orderGroupInstruction("usageProviders")}
        </p>
      </div>
      <OrderGroupList
        group="usageProviders"
        selectedId={null}
        values={values}
        arrangement={arrangement}
        onOpenProvider={
          onOpenProvider === null
            ? null
            : (providerId) => {
                onOpenProvider(providerId);
              }
        }
        decorate={null}
      />
    </div>
  );
}
