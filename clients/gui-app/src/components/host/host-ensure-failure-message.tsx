import type { ReactNode } from "react";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";

/**
 * A failed ensure's message, verbatim, in a settled failure body. Clamped
 * because a CLI message can run long (a path, a nested cause), and selectable
 * with the whole text on hover, so the part the clamp hides can still be
 * copied into a search or a report.
 */
export function HostEnsureFailureMessage(props: {
  readonly message: string;
}): ReactNode {
  return (
    <TooltipWrapper
      label={props.message}
      side="top"
      sideOffset={undefined}
      align={undefined}
    >
      <p
        data-testid="host-ensure-failure-message"
        className="line-clamp-4 w-full text-ui-sm break-words text-muted-foreground select-text"
      >
        {props.message}
      </p>
    </TooltipWrapper>
  );
}
