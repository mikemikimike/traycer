import type { ReactNode } from "react";
import { SIDE_TAB_TITLE_CLASS } from "@/components/layout/tabs/side-strip/side-strip-tokens";
import { cn } from "@/lib/utils";

/**
 * The panel sheet's task header row (D12): the task's chip and its title. The
 * live panel fills it from the task's tab; the layout editor's miniature draws
 * the same row for its picture of a task.
 */
export function PanelTaskHeaderBody(props: {
  readonly testId: string | null;
  readonly chip: ReactNode;
  readonly title: string;
}): ReactNode {
  return (
    <div
      data-testid={props.testId ?? undefined}
      className="flex min-w-0 shrink-0 items-center gap-2 px-3 pt-2 pb-1.5"
    >
      {props.chip}
      <span
        className={cn(
          SIDE_TAB_TITLE_CLASS,
          "min-w-0 truncate font-semibold text-foreground",
        )}
      >
        {props.title}
      </span>
    </div>
  );
}
