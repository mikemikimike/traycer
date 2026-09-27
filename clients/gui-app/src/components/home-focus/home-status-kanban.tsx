/**
 * The Home status board's Board view: a read-only kanban, one column per
 * status (Needs you · In progress · Done), a card per row. Nothing moves by
 * drag - a row's status is what its agent last wrote.
 *
 * Cards within a column keep the board's own order (newest first), because
 * the rows arrive sorted and are only partitioned here. Every card says what
 * the table row says, through the same parts (`home-status-parts.tsx`).
 *
 * The columns sit side by side and stack below `@max-[36rem]`, a CONTAINER
 * query on the board's own width, the same breakpoint the table folds at.
 */
import type { ReactNode } from "react";
import type {
  HomeStatus,
  HomeStatusRow,
} from "@traycer/protocol/notifications/home-status-room";
import { Badge } from "@/components/ui/badge";
import {
  HOME_STATUS_DISPLAY,
  HOME_STATUS_ORDER,
} from "@/lib/home-focus/home-status-display";
import {
  HomeStatusDismissButton,
  HomeStatusLastUpdate,
  HomeStatusNote,
  type HomeStatusOpenAgent,
  type HomeStatusViewProps,
} from "@/components/home-focus/home-status-parts";
import { isHomeStatusRowStaleFor } from "@/lib/home-focus/home-status-thresholds";
import { cn } from "@/lib/utils";

export function HomeStatusKanban(props: HomeStatusViewProps): ReactNode {
  const { rows, now, thresholds, onDismiss, onOpenAgent } = props;
  const byStatus = new Map<HomeStatus, HomeStatusRow[]>();
  for (const row of rows) {
    const column = byStatus.get(row.status);
    if (column === undefined) byStatus.set(row.status, [row]);
    else column.push(row);
  }
  return (
    <div className="@container">
      <div
        data-testid="home-status-kanban"
        className="grid grid-cols-3 gap-3 px-1 pt-1 @max-[36rem]:grid-cols-1"
      >
        {HOME_STATUS_ORDER.map((status) => {
          const cards = byStatus.get(status) ?? [];
          return (
            <HomeStatusColumn key={status} status={status} count={cards.length}>
              {cards.map((row) => (
                <HomeStatusCard
                  key={row.key}
                  row={row}
                  stale={isHomeStatusRowStaleFor(row, now, thresholds)}
                  onDismiss={onDismiss}
                  onOpenAgent={onOpenAgent}
                />
              ))}
            </HomeStatusColumn>
          );
        })}
      </div>
    </div>
  );
}

function HomeStatusColumn(props: {
  readonly status: HomeStatus;
  readonly count: number;
  readonly children: ReactNode;
}): ReactNode {
  const display = HOME_STATUS_DISPLAY[props.status];
  const headingId = `home-status-column-${props.status}`;
  return (
    <section
      aria-labelledby={headingId}
      data-testid="home-status-column"
      data-status={props.status}
      className="flex min-w-0 flex-col gap-2"
    >
      <h3
        id={headingId}
        className="flex items-center gap-2 text-ui-xs text-muted-foreground"
      >
        <Badge variant={display.badge} className="rounded-full">
          <span
            aria-hidden
            className={cn("size-1.5 rounded-full", display.dotClass)}
          />
          {display.label}
        </Badge>
        <span className="tabular-nums" data-testid="home-status-column-count">
          {props.count}
        </span>
      </h3>
      {props.count === 0 ? (
        <p
          className="px-1 text-ui-xs text-muted-foreground/70"
          data-testid="home-status-column-empty"
        >
          Nothing here
        </p>
      ) : (
        <ul className="flex flex-col gap-2">{props.children}</ul>
      )}
    </section>
  );
}

function HomeStatusCard(props: {
  readonly row: HomeStatusRow;
  readonly stale: boolean;
  readonly onDismiss: (key: string) => void;
  readonly onOpenAgent: HomeStatusOpenAgent;
}): ReactNode {
  const { row, stale, onDismiss, onOpenAgent } = props;
  return (
    <li
      data-testid="home-status-card"
      data-row-key={row.key}
      data-stale={stale ? "true" : undefined}
      className={cn(
        "flex min-w-0 flex-col gap-1.5 rounded-md border border-border bg-foreground/3 p-2.5 text-ui-sm transition-colors hover:bg-foreground/5",
        stale && "opacity-60",
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <span
          className="min-w-0 font-medium break-words text-foreground"
          data-testid="home-status-item"
        >
          {row.item}
        </span>
        <span className="-mt-0.5 -mr-1 shrink-0">
          <HomeStatusDismissButton row={row} onDismiss={onDismiss} />
        </span>
      </div>
      {row.note.length === 0 ? null : (
        <div
          className="min-w-0 break-words text-muted-foreground"
          data-testid="home-status-note"
        >
          <HomeStatusNote note={row.note} />
        </div>
      )}
      <HomeStatusLastUpdate
        row={row}
        stale={stale}
        folds={false}
        onOpenAgent={onOpenAgent}
      />
    </li>
  );
}
