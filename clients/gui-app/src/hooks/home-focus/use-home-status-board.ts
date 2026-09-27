import { useMemo, useSyncExternalStore } from "react";
import type * as Y from "yjs";
import {
  getHomeStatusMap,
  isHomeStatusRowExpired,
  readHomeStatusRows,
  sortHomeStatusRows,
  type HomeStatusRow,
} from "@traycer/protocol/notifications/home-status-room";
import { useSampledNow } from "@/lib/relative-time";
import {
  useNotificationsReplicaOpen,
  useNotificationsStore,
} from "@/stores/notifications/notifications-store";

export interface HomeStatusBoard {
  /** Valid, unexpired rows in board order. Empty while the room is not open. */
  readonly rows: ReadonlyArray<HomeStatusRow>;
  /** The shared minute clock's sample the rows were filtered against, for
   * the per-row stale check. */
  readonly now: number;
  readonly dismiss: (key: string) => void;
}

interface HomeStatusSource {
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => ReadonlyArray<HomeStatusRow>;
}

const NO_ROWS: ReadonlyArray<HomeStatusRow> = Object.freeze([]);

/**
 * One source per replica doc. The store's `revision` tracks only the
 * notifications array, so the board observes its own map. The observer is
 * attached once, for the doc's life, so the cached rows are invalidated even
 * while nothing is subscribed; a destroyed doc takes it along.
 */
const sources = new WeakMap<Y.Doc, HomeStatusSource>();

function homeStatusSourceFor(doc: Y.Doc): HomeStatusSource {
  const existing = sources.get(doc);
  if (existing !== undefined) return existing;
  const listeners = new Set<() => void>();
  let cached: ReadonlyArray<HomeStatusRow> | null = null;
  // Rows are whole immutable values, so a shallow observer sees every set
  // and delete.
  getHomeStatusMap(doc).observe(() => {
    cached = null;
    for (const listener of listeners) listener();
  });
  const source: HomeStatusSource = {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => {
      cached ??= readHomeStatusRows(doc);
      return cached;
    },
  };
  sources.set(doc, source);
  return source;
}

/**
 * The Home status board, read from the per-user notifications room.
 *
 * Gated on a lane actually feeding the replica rather than on the feed mode:
 * the room opens in cloud mode and in cloud-authorized local mode, and in
 * neither of the others is the doc the account's live board.
 *
 * Re-filters on the shared 60s clock, so a `done` row past its TTL leaves the
 * table without a write to the room.
 */
export function useHomeStatusBoard(): HomeStatusBoard {
  const doc = useNotificationsStore((state) => state.doc);
  const replicaOpen = useNotificationsReplicaOpen();
  const dismiss = useNotificationsStore((state) => state.dismissHomeStatusRow);
  const source = useMemo(() => homeStatusSourceFor(doc), [doc]);
  const stored = useSyncExternalStore(source.subscribe, source.getSnapshot);
  const now = useSampledNow();
  const rows = useMemo(
    () =>
      replicaOpen
        ? sortHomeStatusRows(
            stored.filter((row) => !isHomeStatusRowExpired(row, now)),
          )
        : NO_ROWS,
    [replicaOpen, stored, now],
  );
  return useMemo(() => ({ rows, now, dismiss }), [rows, now, dismiss]);
}
