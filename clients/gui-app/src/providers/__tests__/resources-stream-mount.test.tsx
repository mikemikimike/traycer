import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { ResourcesStreamMount } from "@/providers/resources-stream-mount";
import { __setResourcesStreamClientFactoryForTests } from "@/providers/resources-stream-factory-override";
import { resourcesRegistry } from "@/stores/resources/resources-registry";
import { useLayoutStore } from "@/stores/layout/layout-store";

function installStubFactory(): void {
  __setResourcesStreamClientFactoryForTests(() => ({
    close: () => undefined,
    setDemand: () => undefined,
  }));
}

/**
 * One switch owns the readings now (L-48): the resource monitor's `shown` is
 * what the stream follows, and the sidebar's chips read the same projection.
 */
function setResourceMonitorShown(shown: boolean): void {
  useLayoutStore
    .getState()
    .setRegionValues("resourceMonitor", { shown: shown ? "shown" : "hidden" });
}

afterEach(() => {
  cleanup();
  __setResourcesStreamClientFactoryForTests(null);
  resourcesRegistry.disposeAll();
  setResourceMonitorShown(true);
});

describe("<ResourcesStreamMount />", () => {
  it("acquires nothing while the resource monitor is hidden", () => {
    installStubFactory();
    setResourceMonitorShown(false);

    render(<ResourcesStreamMount epicId="epic-1" />);

    expect(resourcesRegistry.get("epic-1")).toBeNull();
  });

  it("acquires the registry entry while the resource monitor is shown", () => {
    installStubFactory();
    setResourceMonitorShown(true);

    render(<ResourcesStreamMount epicId="epic-1" />);

    expect(resourcesRegistry.get("epic-1")).not.toBeNull();
  });

  it("acquires live when the monitor is shown mid-session, without remounting", () => {
    installStubFactory();
    setResourceMonitorShown(false);

    render(<ResourcesStreamMount epicId="epic-1" />);
    expect(resourcesRegistry.get("epic-1")).toBeNull();

    act(() => {
      setResourceMonitorShown(true);
    });

    expect(resourcesRegistry.get("epic-1")).not.toBeNull();
  });

  it("releases live when the monitor is hidden mid-session", () => {
    installStubFactory();
    setResourceMonitorShown(true);

    render(<ResourcesStreamMount epicId="epic-1" />);
    expect(resourcesRegistry.get("epic-1")).not.toBeNull();

    act(() => {
      setResourceMonitorShown(false);
    });

    expect(resourcesRegistry.get("epic-1")).toBeNull();
  });

  it("releases the entry on unmount", () => {
    installStubFactory();
    setResourceMonitorShown(true);

    const { unmount } = render(<ResourcesStreamMount epicId="epic-1" />);
    expect(resourcesRegistry.get("epic-1")).not.toBeNull();

    unmount();

    expect(resourcesRegistry.get("epic-1")).toBeNull();
  });
});
