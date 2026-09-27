import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ListTaskLight } from "@traycer/protocol/host/epic/unary-schemas";
import type { HistoryItem } from "@/components/home/data/home-page.data";
import {
  observeActiveHistoryEdges,
  observeOwnHistoryRecordChange,
  projectOptimisticHistoryItems,
  requestHistoryActivityRefresh,
  settleHistoryActivity,
  useOptimisticActivityHistoryItems,
} from "@/hooks/home/use-optimistic-activity-history-items";

const hookState = vi.hoisted(() => ({
  workingEpicIds: new Set<string>(),
  contextRequests: [] as string[][],
  contexts: new Map<string, ListTaskLight>(),
}));

vi.mock("@/stores/use-working-epic-ids", () => ({
  useTurnEpicIds: () => hookState.workingEpicIds,
}));

vi.mock("@/stores/auth/auth-store", () => ({
  authorizesCloudCapability: () => true,
  useAuthStore: (selector: (state: { status: string }) => boolean) =>
    selector({ status: "authenticated" }),
}));

vi.mock("@/hooks/epic/use-epic-get-task-contexts-query", () => ({
  useEpicGetTaskContexts: (ids: readonly string[]) => {
    hookState.contextRequests.push([...ids]);
    return {
      tasksById: new Map(
        ids.flatMap((id) => {
          const task = hookState.contexts.get(id);
          return task === undefined ? [] : [[id, task] as const];
        }),
      ),
      localHomedTaskIds: new Set<string>(),
    };
  },
}));

function historyItem(
  epicId: string,
  updatedAtMs: number,
  recentAtMs: number | undefined,
): HistoryItem {
  const effectiveRecentAtMs = recentAtMs ?? updatedAtMs;
  return {
    id: epicId,
    epicId,
    taskType: "epic",
    title: epicId,
    initialUserPrompt: "",
    updatedAtMs,
    updatedLabel: "old edit",
    updatedBucket: "earlier",
    recentAtMs: effectiveRecentAtMs,
    recentLabel: "old activity",
    recentBucket: "earlier",
    linkedRepos: [],
    linkedWorkspaces: [],
    chatHostIds: null,
    pullRequestNumbers: [],
    worktreeBranches: [],
    worktreePaths: [],
    ownership: "mine",
    permissionRole: "owner",
    isPinned: false,
  };
}

function taskContext(epicId: string): ListTaskLight {
  return {
    epic: {
      light: {
        id: epicId,
        title: epicId,
        initialUserPrompt: "",
        ticketCount: 0,
        specCount: 0,
        storyCount: 0,
        reviewCount: 0,
        status: "draft",
        createdAt: 10,
        updatedAt: 20,
        createdBy: "owner",
        version: "1.0.0",
      },
      permission: null,
      repos: [],
      workspaces: [],
      roomInfo: null,
    },
    pinned: false,
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  hookState.workingEpicIds = new Set();
  hookState.contextRequests = [];
  hookState.contexts = new Map();
});

describe("optimistic activity history projection", () => {
  it("stamps a new active edge once and does not re-arm after durable catch-up", () => {
    const userId = `stable-${crypto.randomUUID()}`;
    const working = new Set(["active-epic"]);

    expect(observeActiveHistoryEdges(userId, working, 100)).toBe(true);
    expect(observeActiveHistoryEdges(userId, working, 200)).toBe(false);

    settleHistoryActivity(userId, [historyItem("active-epic", 150, 100)]);
    expect(observeActiveHistoryEdges(userId, working, 300)).toBe(false);

    expect(observeActiveHistoryEdges(userId, new Set(), 400)).toBe(false);
    expect(observeActiveHistoryEdges(userId, working, 500)).toBe(true);
  });

  it("limits optimistic stamps to the newest 64 active rows", () => {
    const userId = `bounded-${crypto.randomUUID()}`;
    const ids = Array.from({ length: 70 }, (_, index) => `epic-${index}`);
    expect(observeActiveHistoryEdges(userId, new Set(ids), 1000)).toBe(true);

    const projected = projectOptimisticHistoryItems(
      userId,
      ids.map((id) => historyItem(id, 1, undefined)),
      [],
      1000,
    );
    expect(projected).toHaveLength(70);
    expect(projected.filter((item) => item.recentAtMs === 1000)).toHaveLength(
      64,
    );
  });

  it("projects active timestamps into Recent ordering and removes them at durable catch-up", () => {
    const userId = `ordering-${crypto.randomUUID()}`;
    const working = new Set(["active-a", "active-b"]);
    observeActiveHistoryEdges(userId, working, 300);
    const pageItems = [
      historyItem("older", 250, undefined),
      historyItem("active-a", 100, undefined),
    ];
    const backfilled = [historyItem("active-b", 50, undefined)];

    const projected = projectOptimisticHistoryItems(
      userId,
      pageItems,
      backfilled,
      300,
    );
    expect(projected.map((item) => item.epicId)).toEqual([
      "active-b",
      "active-a",
      "older",
    ]);
    expect(projected[0].recentAtMs).toBe(300);
    expect(projected[1].recentAtMs).toBe(300);

    settleHistoryActivity(userId, [historyItem("active-a", 100, 300)]);
    const afterCatchUp = projectOptimisticHistoryItems(
      userId,
      pageItems,
      backfilled,
      300,
    );
    expect(
      afterCatchUp.find((item) => item.epicId === "active-a")?.recentAtMs,
    ).toBe(100);
    expect(
      afterCatchUp.find((item) => item.epicId === "active-b")?.recentAtMs,
    ).toBe(300);
  });

  it("requests missing active rows in one context batch", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    hookState.workingEpicIds = new Set(["missing-a", "missing-b"]);
    const userId = `batch-${crypto.randomUUID()}`;
    const refetch = vi.fn(() => Promise.resolve());

    renderHook(() =>
      useOptimisticActivityHistoryItems({
        items: [],
        userId,
        hostId: "host-test",
        enabled: true,
        refetch,
      }),
    );

    expect(hookState.contextRequests.length).toBeGreaterThan(0);
    expect(hookState.contextRequests.at(-1)).toEqual([
      "missing-a",
      "missing-b",
    ]);
    expect(hookState.contextRequests.every((ids) => ids.length === 2)).toBe(
      true,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(750);
    });
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("keeps an idle active row while the outbox is delayed, retries, then settles", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const userId = `delayed-${crypto.randomUUID()}`;
    hookState.workingEpicIds = new Set(["delayed-epic"]);
    hookState.contexts.set("delayed-epic", taskContext("delayed-epic"));
    const refetch = vi.fn(() => Promise.resolve());
    const { result, rerender } = renderHook(
      ({ working, items }) => {
        hookState.workingEpicIds = working;
        return useOptimisticActivityHistoryItems({
          items,
          userId,
          hostId: "host-delayed",
          enabled: true,
          refetch,
        });
      },
      {
        initialProps: {
          working: new Set(["delayed-epic"]),
          items: [] as readonly HistoryItem[],
        },
      },
    );

    rerender({ working: new Set(), items: [] });

    expect(hookState.contextRequests.at(-1)).toEqual(["delayed-epic"]);
    expect(result.current.map((item) => item.epicId)).toContain("delayed-epic");
    expect(result.current[0]?.recentAtMs).toBe(10_000);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(750);
    });
    expect(refetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(refetch).toHaveBeenCalledTimes(2);

    rerender({
      working: new Set(),
      items: [historyItem("delayed-epic", 11_000, 10_500)],
    });
    expect(result.current[0]?.recentAtMs).toBe(10_500);
  });

  it("refreshes once when two consumers share the same user and host scope", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(20_000);
    const userId = `shared-${crypto.randomUUID()}`;
    requestHistoryActivityRefresh(userId);
    const firstRefetch = vi.fn(() => Promise.resolve());
    const secondRefetch = vi.fn(() => Promise.resolve());

    const first = renderHook(() =>
      useOptimisticActivityHistoryItems({
        items: [],
        userId,
        hostId: "host-shared",
        enabled: true,
        refetch: firstRefetch,
      }),
    );
    const second = renderHook(() =>
      useOptimisticActivityHistoryItems({
        items: [],
        userId,
        hostId: "host-shared",
        enabled: true,
        refetch: secondRefetch,
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(750);
    });
    expect(
      firstRefetch.mock.calls.length + secondRefetch.mock.calls.length,
    ).toBe(1);
    first.unmount();
    second.unmount();
  });

  it("refreshes a scope when it becomes enabled after an own idle record change", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(30_000);
    const userId = `reenabled-${crypto.randomUUID()}`;
    const refetch = vi.fn(() => Promise.resolve());
    const { rerender } = renderHook(
      ({ enabled }) =>
        useOptimisticActivityHistoryItems({
          items: [],
          userId,
          hostId: "host-reenabled",
          enabled,
          refetch,
        }),
      { initialProps: { enabled: false } },
    );

    act(() => observeOwnHistoryRecordChange(userId, "idle-epic", 30_000));
    rerender({ enabled: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(750);
    });

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("expires a mounted optimistic stamp at its TTL without a new edge", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(100);
    const userId = `ttl-${crypto.randomUUID()}`;
    hookState.workingEpicIds = new Set(["ttl-epic"]);
    const refetch = vi.fn(() => Promise.resolve());
    const { result, rerender } = renderHook(() =>
      useOptimisticActivityHistoryItems({
        items: [historyItem("ttl-epic", 1, undefined)],
        userId,
        hostId: "host-ttl",
        enabled: true,
        refetch,
      }),
    );
    expect(result.current[0]?.recentAtMs).toBe(100);

    hookState.workingEpicIds = new Set();
    rerender();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600_001);
    });

    expect(result.current[0]?.recentAtMs).toBe(1);
  });

  it("refreshes when an own record delta arrives for an idle task", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(40_000);
    const userId = `idle-delta-${crypto.randomUUID()}`;
    const refetch = vi.fn(() => Promise.resolve());
    const { result } = renderHook(() =>
      useOptimisticActivityHistoryItems({
        items: [historyItem("idle-epic", 5, undefined)],
        userId,
        hostId: "host-idle-delta",
        enabled: true,
        refetch,
      }),
    );

    act(() => observeOwnHistoryRecordChange(userId, "idle-epic", 40_000));

    expect(result.current[0]?.recentAtMs).toBe(40_000);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(750);
    });
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
