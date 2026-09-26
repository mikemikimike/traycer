import { afterEach, describe, expect, it } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { HostClient } from "@traycer-clients/shared/host-client/host-client";
import {
  mockHostDirectoryEntries,
  mockLocalHostEntry,
  mockRemoteHostEntry,
} from "@traycer-clients/shared/host-client/mock/mock-host-directory";
import { MockHostMessenger } from "@traycer-clients/shared/host-client/mock/mock-host-messenger";
import { createRequestContextFixture } from "@traycer-clients/shared/test-fixtures/request-context";
import type { WorktreeHostEntryV16 } from "@traycer/protocol/host/worktree-schemas";
import {
  openEnrichmentWindowCountForTest,
  sharedWorktreeEnrichmentBatcher,
} from "@/components/settings/panels/worktrees-enrichment-batcher";
import { useWorktreeEnrichmentForClient } from "@/hooks/worktree/use-worktree-enrichment-query";
import { hostRpcRegistry, type HostRpcRegistry } from "@/lib/host";
import { createAppQueryClient } from "@/lib/query-client";

/**
 * The background enrichment surfaces (History, the Epic sweep row, owner
 * cards) read activity rows per path through ONE batcher per host - so a
 * navigation that mounts several of them sends their paths together rather
 * than as one `worktree.listAllForHost` call per surface.
 */

function hostRow(worktreePath: string): WorktreeHostEntryV16 {
  return {
    worktreePath,
    branch: "feature",
    repoLabel: "acme/app",
    repoIdentifier: { owner: "acme", repo: "app" },
    inUse: false,
    uncommittedCount: 0,
    gitRemovable: true,
    scripts: null,
    owners: [],
    lastActivityAt: null,
    branchStatus: null,
    createdAt: null,
    prState: null,
    prNumber: null,
    prUrl: null,
    mergedHeadShaMatches: false,
    submodules: [],
    atBaseCommit: false,
    resolvedAt: 1,
    presence: "present",
    gitUnreadable: false,
  };
}

function paths(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `/wt/${prefix}-${index}`);
}

interface Spine {
  /** The client every requester below is a routing view over. */
  readonly spine: HostClient<HostRpcRegistry>;
  readonly messenger: MockHostMessenger<HostRpcRegistry>;
  readonly client: HostClient<HostRpcRegistry>;
  /** `activityPaths` of every selection-mode call, in order. */
  readonly calls: string[][];
}

interface Fixture extends Spine {
  readonly queryClient: QueryClient;
  readonly Wrapper: (props: { readonly children: ReactNode }) => ReactNode;
}

function createSpine(): Spine {
  const calls: string[][] = [];
  const messenger = new MockHostMessenger<HostRpcRegistry>({
    registry: hostRpcRegistry,
    requestId: () => "req-1",
    handlers: {
      "worktree.listAllForHost": (params) => {
        const requested = params.activityPaths ?? [];
        calls.push([...requested]);
        return Promise.resolve({
          worktrees: requested.map(hostRow),
          nextCursor: null,
        });
      },
    },
  });
  const spine = new HostClient<HostRpcRegistry>({
    registry: hostRpcRegistry,
    invalidator: { invalidateHostScope: () => undefined },
    findHostById: (hostId) =>
      mockHostDirectoryEntries.find((entry) => entry.hostId === hostId) ?? null,
    messenger,
  });
  spine.setRequestContext(
    createRequestContextFixture({ origin: "renderer", bearerToken: "tok-1" }),
  );
  const client = spine.createRequester(mockLocalHostEntry);
  return { spine, messenger, client, calls };
}

function createFixture(): Fixture {
  // The batcher is shared per query cache and host, so each test builds its
  // own query client and never inherits another test's batcher.
  const queryClient = createAppQueryClient();
  const Wrapper = (props: { readonly children: ReactNode }): ReactNode => (
    <QueryClientProvider client={queryClient}>
      {props.children}
    </QueryClientProvider>
  );
  return { ...createSpine(), queryClient, Wrapper };
}

afterEach(() => {
  cleanup();
});

describe("background worktree enrichment", () => {
  it("puts two surfaces' paths, mounted together, into the same call", async () => {
    const fixture = createFixture();
    const history = paths("history", 5);
    const sweepRow = paths("sweep", 3);

    const { result } = renderHook(
      () => ({
        history: useWorktreeEnrichmentForClient(fixture.client, history, true),
        sweepRow: useWorktreeEnrichmentForClient(
          fixture.client,
          sweepRow,
          true,
        ),
      }),
      { wrapper: fixture.Wrapper },
    );

    await waitFor(() => {
      expect(result.current.history.worktrees).toHaveLength(5);
      expect(result.current.sweepRow.worktrees).toHaveLength(3);
    });
    expect(fixture.calls).toHaveLength(1);
    expect([...fixture.calls[0]].sort()).toEqual(
      [...history, ...sweepRow].sort(),
    );
  });

  it("shares one batcher between requesters resolved separately for one host, and not across hosts", async () => {
    const fixture = createFixture();
    // As History and an owner card each resolve their own: two routing views
    // over one spine, neither the other's object.
    const historyClient = fixture.spine.createRequester(mockLocalHostEntry);
    const ownerClient = fixture.spine.createRequesterForHostId(
      mockLocalHostEntry.hostId,
    );
    const remoteClient = fixture.spine.createRequesterForHostId(
      mockRemoteHostEntry.hostId,
    );
    const history = paths("history", 3);
    const owned = paths("owned", 2);
    const remote = paths("remote", 2);

    const { result } = renderHook(
      () => ({
        history: useWorktreeEnrichmentForClient(historyClient, history, true),
        owned: useWorktreeEnrichmentForClient(ownerClient, owned, true),
        remote: useWorktreeEnrichmentForClient(remoteClient, remote, true),
      }),
      { wrapper: fixture.Wrapper },
    );

    await waitFor(() => {
      expect(result.current.history.worktrees).toHaveLength(3);
      expect(result.current.owned.worktrees).toHaveLength(2);
      expect(result.current.remote.worktrees).toHaveLength(2);
    });
    // The messenger logs each call's host, the handler its paths, in the same
    // order.
    const hosts = fixture.messenger.calls.map(
      (call) => call.authority.endpoint.hostId,
    );
    expect(hosts).toHaveLength(fixture.calls.length);
    const byHost = fixture.calls.map((requested, index) => ({
      hostId: hosts.at(index),
      paths: [...requested].sort(),
    }));
    expect(byHost).toHaveLength(2);
    expect(byHost).toEqual(
      expect.arrayContaining([
        {
          hostId: mockLocalHostEntry.hostId,
          paths: [...history, ...owned].sort(),
        },
        { hostId: mockRemoteHostEntry.hostId, paths: [...remote].sort() },
      ]),
    );
  });
});

describe("sharedWorktreeEnrichmentBatcher", () => {
  it("sends a window through the requester of the fetch that opened it, not one a later render built", async () => {
    const fixture = createFixture();
    const other = createSpine();
    const committed = sharedWorktreeEnrichmentBatcher(
      fixture.queryClient,
      mockLocalHostEntry.hostId,
      fixture.client,
    );
    // What a render React discards leaves behind: a batcher built over
    // another requester for the same host, never fetched through.
    sharedWorktreeEnrichmentBatcher(
      fixture.queryClient,
      mockLocalHostEntry.hostId,
      other.client,
    );

    await committed.fetchPath("/wt/app");

    expect(fixture.calls).toEqual([["/wt/app"]]);
    expect(other.calls).toEqual([]);
  });

  it("keeps no entry for a host once its reads have gone out", async () => {
    const fixture = createFixture();
    const remoteClient = fixture.spine.createRequesterForHostId(
      mockRemoteHostEntry.hostId,
    );
    const batcher = sharedWorktreeEnrichmentBatcher(
      fixture.queryClient,
      mockRemoteHostEntry.hostId,
      remoteClient,
    );
    expect(openEnrichmentWindowCountForTest(fixture.queryClient)).toBe(0);

    const read = batcher.fetchPath("/wt/remote");
    expect(openEnrichmentWindowCountForTest(fixture.queryClient)).toBe(1);
    await read;

    expect(fixture.calls).toEqual([["/wt/remote"]]);
    expect(openEnrichmentWindowCountForTest(fixture.queryClient)).toBe(0);
  });
});
