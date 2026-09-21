import type { ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { useLayoutFormHost } from "@/components/layout-editor/inspector/layout-form-host";
import { Button } from "@/components/ui/button";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { cn } from "@/lib/utils";
import { useSettingsDensity } from "@/providers/settings-density-context";

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
 * A sibling of `SettingsRow` rather than a reuse of it: that component's
 * `row: SettingsRowDefinition` ties it to the Settings-search index, which a
 * region section's grammar row is not part of (L-08's rows are fixed
 * structure, not searchable settings entries of their own).
 *
 * It takes its DENSITY from the host the way `SettingsRow` and `SettingsGroup`
 * do, so one component serves both at each one's own scale (P-4): the dock's
 * own density in a 320px instrument panel, and the Settings page's at 1400px,
 * where the inspector's scale read as a foreign panel pasted into a form.
 */
export function InspectorRow(props: InspectorRowProps): ReactNode {
  const { label, description, control, onRevert, revertLabel, stacked, top } =
    props;
  const page = useLayoutFormHost() === "page";
  const compact = useSettingsDensity() === "compact";
  // The page reads at the Settings form's scale, the dock at the instrument
  // panel's; on the page the density control picks between the two page sizes.
  let padding = "px-3.5 py-2.5";
  if (page) padding = compact ? "px-4 py-2.5" : "px-5 py-3.5";
  // Exactly one, on the side the row's shape puts it: beside the label when
  // the control has a line of its own, and after the control otherwise. Both
  // used to draw on every unstacked row, which a screen reader read out as
  // two identically-named controls (I-04).
  const revert = onRevert ? (
    <RevertButton
      onRevert={onRevert}
      label={revertLabel ?? `Revert ${label}`}
    />
  ) : null;
  return (
    <div
      className={cn(
        "flex min-h-11 flex-wrap items-center gap-x-3 gap-y-2 border-t border-border",
        padding,
        top && "border-t-0",
        stacked && "block",
      )}
    >
      {/* `min-w-32` is what makes `flex-wrap` above mean anything: with
        `flex: 1 1 0%` and no floor the text column's hypothetical size is 0,
        so the row can never break and a wide control crushes the label to one
        word per line instead (I-05). The floor is the width the label and its
        description need to read as a sentence; a control that no longer fits
        beside it drops to the next line. */}
      <div
        className={cn(
          "min-w-32 flex-1",
          stacked && "flex items-center gap-1.5",
        )}
      >
        <span className={page ? "font-medium" : "text-ui-sm"}>{label}</span>
        {stacked ? revert : null}
        {description ? (
          <p
            className={cn(
              "mt-0.5 text-muted-foreground",
              page ? "text-ui-sm" : "text-ui-xs",
            )}
          >
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
        {stacked ? null : revert}
      </div>
    </div>
  );
}

/** The per-row revert glyph, also used by the Style block's own header (L-20). */
export function RevertButton(props: {
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
