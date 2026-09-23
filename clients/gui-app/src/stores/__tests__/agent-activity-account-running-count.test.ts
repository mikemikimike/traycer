import { afterEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  __resetAgentActivityStoreForTests,
  __setHostAgentActivityHealthForTests,
  __setHostAgentActivityStateForTests,
  useAccountRunningAgentCount,
} from "@/stores/agent-activity-store";

/**
 * The strip foot's "N agents running" line (D6): a union over every host and
 * epic, not a sum - the same agent two hosts both report (a cloud-synced
 * union reaching both) counts once. Only a slice that has attested its union
 * THIS epoch (open, with a `state` frame seen) counts; a retained reconnecting
 * or closed snapshot is a stale number, not a live one (F8).
 */

const HOST_A = "host-a";
const HOST_B = "host-b";

afterEach(() => {
  __resetAgentActivityStoreForTests();
});

/** Marks a host's slice as attesting its current union, as a real `open` stream would. */
function attestHost(hostId: string): void {
  __setHostAgentActivityHealthForTests(hostId, {
    connectionStatus: "open",
    stateFrameSeenThisEpoch: true,
  });
}

describe("useAccountRunningAgentCount", () => {
  it("is 0 with no activity reported anywhere", () => {
    const { result } = renderHook(() => useAccountRunningAgentCount());
    expect(result.current).toBe(0);
  });

  it("counts working agents across every epic on one host", () => {
    __setHostAgentActivityStateForTests(
      HOST_A,
      {
        "epic-1": { working: ["agent-1"], turn: ["agent-1"] },
        "epic-2": { working: ["agent-2"], turn: [] },
      },
      "local",
      null,
    );
    attestHost(HOST_A);

    const { result } = renderHook(() => useAccountRunningAgentCount());
    expect(result.current).toBe(2);
  });

  it("unions across hosts instead of summing", () => {
    __setHostAgentActivityStateForTests(
      HOST_A,
      { "epic-1": { working: ["agent-1"], turn: [] } },
      "local",
      null,
    );
    __setHostAgentActivityStateForTests(
      HOST_B,
      { "epic-1": { working: ["agent-2"], turn: [] } },
      "local",
      null,
    );
    attestHost(HOST_A);
    attestHost(HOST_B);

    const { result } = renderHook(() => useAccountRunningAgentCount());
    expect(result.current).toBe(2);
  });

  it("counts the same agent once when two hosts both report it", () => {
    __setHostAgentActivityStateForTests(
      HOST_A,
      { "epic-1": { working: ["shared-agent"], turn: [] } },
      "local",
      null,
    );
    __setHostAgentActivityStateForTests(
      HOST_B,
      { "epic-1": { working: ["shared-agent"], turn: [] } },
      "cloud",
      "connected",
    );
    attestHost(HOST_A);
    attestHost(HOST_B);

    const { result } = renderHook(() => useAccountRunningAgentCount());
    expect(result.current).toBe(1);
  });

  it("does not count a slice that has not attested its union this epoch, even with a working set on record", () => {
    __setHostAgentActivityStateForTests(
      HOST_A,
      { "epic-1": { working: ["agent-1"], turn: ["agent-1"] } },
      "local",
      null,
    );
    // Deliberately no `attestHost`: the slice keeps its working set (a
    // reconnect must not flicker the row) but the stream has not reopened
    // with a frame of its own, so the count must not include it.

    const { result } = renderHook(() => useAccountRunningAgentCount());
    expect(result.current).toBe(0);
  });

  it("drops a reconnecting host's retained agent from the count but keeps a still-open host's", () => {
    __setHostAgentActivityStateForTests(
      HOST_A,
      { "epic-1": { working: ["agent-a"], turn: ["agent-a"] } },
      "local",
      null,
    );
    __setHostAgentActivityStateForTests(
      HOST_B,
      { "epic-1": { working: ["agent-b"], turn: ["agent-b"] } },
      "local",
      null,
    );
    attestHost(HOST_A);
    attestHost(HOST_B);
    expect(renderHook(() => useAccountRunningAgentCount()).result.current).toBe(
      2,
    );

    // HOST_B drops off this epoch's attestation (a reconnect), keeping its
    // last-known working set on record.
    __setHostAgentActivityHealthForTests(HOST_B, {
      connectionStatus: "reconnecting",
      stateFrameSeenThisEpoch: false,
    });

    const { result } = renderHook(() => useAccountRunningAgentCount());
    expect(result.current).toBe(1);
  });
});
