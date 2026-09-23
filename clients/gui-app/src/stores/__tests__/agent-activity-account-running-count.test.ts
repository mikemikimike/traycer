import { afterEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  __resetAgentActivityStoreForTests,
  __setHostAgentActivityStateForTests,
  useAccountRunningAgentCount,
} from "@/stores/agent-activity-store";

/**
 * The strip foot's "N agents running" line (D6): a union over every host and
 * epic, not a sum - the same agent two hosts both report (a cloud-synced
 * union reaching both) counts once.
 */

const HOST_A = "host-a";
const HOST_B = "host-b";

afterEach(() => {
  __resetAgentActivityStoreForTests();
});

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

    const { result } = renderHook(() => useAccountRunningAgentCount());
    expect(result.current).toBe(1);
  });
});
