/**
 * The Home status board's Table view: one row per item, drawn by
 * `HomeStatusSection` under its header.
 *
 * A real `<table>` at its own container's width that folds into the phone
 * layout below `@max-[36rem]` - a CONTAINER query, like the Home rows', so a
 * slim Home tile folds exactly as a phone does. Folded, each `<tr>` becomes a
 * two-column grid: the status dot, then item, note and `agent · time`
 * stacked, with dismiss pinned to the first line.
 *
 * Column widths: Note is the one column that takes the slack (`w-full`).
 * Status and Last update never wrap, and the agent chip truncates, so neither
 * can squeeze it. An Item is sized to its own text up to 14rem (`w-max
 * max-w-56`), which is also its min-content, so a short name stays on one line
 * and only a genuinely long one wraps.
 *
 * Ordering is the board's (needs you, in progress, done; newest first) - this
 * file renders, it does not sort.
 */
import type { ReactNode } from "react";
import type { HomeStatusRow } from "@traycer/protocol/notifications/home-status-room";
import { Badge } from "@/components/ui/badge";
import { HOME_STATUS_DISPLAY } from "@/lib/home-focus/home-status-display";
import {
  HomeStatusDismissButton,
  HomeStatusLastUpdate,
  HomeStatusNote,
  type HomeStatusOpenAgent,
  type HomeStatusViewProps,
} from "@/components/home-focus/home-status-parts";
import { isHomeStatusRowStaleFor } from "@/lib/home-focus/home-status-thresholds";
import { cn } from "@/lib/utils";

// Folded below this container width. Wider than the Home rows' 30rem because
// four columns need more room than one row's single line does.
const FOLDED_ROW =
  "@max-[36rem]:grid @max-[36rem]:grid-cols-[auto_minmax(0,1fr)_auto] @max-[36rem]:gap-x-3 @max-[36rem]:px-1 @max-[36rem]:py-2.5";
const FOLDED_BODY_CELL = "@max-[36rem]:col-start-2 @max-[36rem]:p-0";

export function HomeStatusTable(props: HomeStatusViewProps): ReactNode {
  const { rows, now, thresholds, onDismiss, onOpenAgent } = props;
  return (
    <div className="@container">
      <table
        data-testid="home-status-table"
        className="w-full border-collapse text-left text-ui-sm"
      >
        <thead className="@max-[36rem]:sr-only">
          <tr className="border-b border-border text-ui-xs text-muted-foreground">
            <th scope="col" className="px-3 py-2 font-medium">
              Status
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Item
            </th>
            <th scope="col" className="w-full px-3 py-2 font-medium">
              Note
            </th>
            <th scope="col" className="px-3 py-2 font-medium whitespace-nowrap">
              Last update
            </th>
            <th scope="col" className="w-0 p-0">
              <span className="sr-only">Dismiss</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <HomeStatusTableRow
              key={row.key}
              row={row}
              stale={isHomeStatusRowStaleFor(row, now, thresholds)}
              onDismiss={onDismiss}
              onOpenAgent={onOpenAgent}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HomeStatusTableRow(props: {
  readonly row: HomeStatusRow;
  readonly stale: boolean;
  readonly onDismiss: (key: string) => void;
  readonly onOpenAgent: HomeStatusOpenAgent;
}): ReactNode {
  const { row, stale, onDismiss, onOpenAgent } = props;
  const display = HOME_STATUS_DISPLAY[row.status];
  return (
    <tr
      data-testid="home-status-row"
      data-row-key={row.key}
      data-status={row.status}
      data-stale={stale ? "true" : undefined}
      className={cn(
        "border-b border-border align-top transition-colors hover:bg-foreground/3",
        FOLDED_ROW,
        stale && "opacity-60",
      )}
    >
      <td className="px-3 py-2.5 whitespace-nowrap @max-[36rem]:row-span-3 @max-[36rem]:p-0 @max-[36rem]:pt-1.5">
        <Badge
          variant={display.badge}
          className="rounded-full @max-[36rem]:hidden"
          data-testid="home-status-chip"
        >
          <span
            aria-hidden
            className={cn("size-1.5 rounded-full", display.dotClass)}
          />
          {display.label}
        </Badge>
        <span
          role="img"
          aria-label={display.label}
          className={cn(
            "hidden size-2 rounded-full @max-[36rem]:block",
            display.dotClass,
          )}
        />
      </td>
      <td
        className={cn(
          "px-3 py-2.5 font-medium break-words text-foreground",
          FOLDED_BODY_CELL,
        )}
        data-testid="home-status-item"
      >
        <span className="block w-max max-w-56 @max-[36rem]:w-auto @max-[36rem]:max-w-none">
          {row.item}
        </span>
      </td>
      <td
        className={cn(
          "w-full min-w-0 px-3 py-2.5 break-words text-muted-foreground",
          FOLDED_BODY_CELL,
          "@max-[36rem]:mt-0.5",
        )}
        data-testid="home-status-note"
      >
        <HomeStatusNote note={row.note} />
      </td>
      <td
        className={cn(
          "px-3 py-2.5 whitespace-nowrap",
          FOLDED_BODY_CELL,
          "@max-[36rem]:mt-1",
        )}
      >
        <HomeStatusLastUpdate
          row={row}
          stale={stale}
          folds
          onOpenAgent={onOpenAgent}
        />
      </td>
      <td className="py-1.5 pr-1 @max-[36rem]:col-start-3 @max-[36rem]:row-start-1 @max-[36rem]:p-0">
        <HomeStatusDismissButton row={row} onDismiss={onDismiss} />
      </td>
    </tr>
  );
}
