import type { ReactNode } from "react";
import { OrderGroupList } from "@/components/layout-editor/inspector/rows/order-group-list";
import type { LayoutArrangement } from "@/lib/layout/layout-arrangement";
import type { LayoutValues } from "@/lib/layout/layout-values";

/**
 * Usage limits' own second level (L-26): the same provider list the
 * `usageProviders` order group draws, with the rows opening a provider where
 * there is a level to open.
 */
export function ProvidersChildrenRow(props: {
  readonly values: LayoutValues;
  readonly arrangement: LayoutArrangement;
  readonly host: "inspector" | "page";
  readonly onOpenProvider: ((providerId: string) => void) | null;
}): ReactNode {
  const { values, arrangement, host, onOpenProvider } = props;
  const opensSecondLevel = host === "inspector" && onOpenProvider !== null;
  return (
    <div className="border-t border-border px-3.5 py-3">
      <div className="mb-2 text-overline text-muted-foreground uppercase">
        Providers
      </div>
      <OrderGroupList
        group="usageProviders"
        selectedId={null}
        values={values}
        arrangement={arrangement}
        onOpenProvider={
          opensSecondLevel
            ? (providerId) => {
                onOpenProvider(providerId);
              }
            : null
        }
      />
      {opensSecondLevel ? (
        <p className="mt-1.5 text-ui-xs text-muted-foreground">
          Open a provider for its limits.
        </p>
      ) : null}
    </div>
  );
}
