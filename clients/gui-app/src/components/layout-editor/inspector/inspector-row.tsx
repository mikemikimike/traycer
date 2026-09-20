import type { ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { cn } from "@/lib/utils";

interface InspectorRowProps {
  readonly label: string;
  readonly description?: string;
  readonly control: ReactNode;
  /** Present only when this row's value differs from the base preset. */
  readonly onRevert?: () => void;
  readonly revertLabel?: string;
  /** The control drops to its own line under the label (a sortable list, checks). */
  readonly stacked?: boolean;
  /** No top border - the first row under a section header. */
  readonly top?: boolean;
}

/**
 * The Settings row shape (`SettingsRow`) drawn at the inspector's own
 * density: `.srow` in the prototype - a label (plus an optional muted
 * description) on the left, a control and an optional per-row revert on the
 * right, or beneath the label when `stacked`.
 *
 * A narrower sibling of `SettingsRow` rather than a reuse of it: that
 * component's `row: SettingsRowDefinition` ties it to the Settings-search
 * index, which a region section's grammar row is not part of (L-08's rows are
 * fixed structure, not searchable settings entries of their own).
 */
export function InspectorRow(props: InspectorRowProps): ReactNode {
  const { label, description, control, onRevert, revertLabel, stacked, top } =
    props;
  return (
    <div
      className={cn(
        "flex min-h-11 flex-wrap items-center gap-x-3 gap-y-2 border-t border-border px-3.5 py-2.5",
        top && "border-t-0",
        stacked && "block",
      )}
    >
      <div className={cn("min-w-0 flex-1", stacked && "flex items-center gap-1.5")}>
        <span className="text-ui-sm">{label}</span>
        {onRevert ? (
          <RevertButton
            onRevert={onRevert}
            label={revertLabel ?? `Revert ${label}`}
          />
        ) : null}
        {description ? (
          <p className="mt-0.5 text-ui-xs text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      <div
        className={cn(
          "flex shrink-0 items-center gap-1.5",
          stacked && "mt-2 block w-full",
        )}
      >
        {control}
        {!stacked && onRevert ? (
          <RevertButton
            onRevert={onRevert}
            label={revertLabel ?? `Revert ${label}`}
          />
        ) : null}
      </div>
    </div>
  );
}

function RevertButton(props: {
  readonly onRevert: () => void;
  readonly label: string;
}): ReactNode {
  return (
    <TooltipWrapper
      label={props.label}
      side="top"
      sideOffset={undefined}
      align={undefined}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={props.label}
        onClick={props.onRevert}
      >
        <RotateCcw />
      </Button>
    </TooltipWrapper>
  );
}
