import { act, cleanup, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PaneVisibilityContext } from "@/components/epic-tabs/pane-visibility-context";
import { useLayoutRegion } from "@/components/layout-editor/use-layout-region";
import type { RegionId } from "@/lib/layout/region-id";
import {
  preferredRegionInstance,
  useLayoutEditorStore,
} from "@/stores/layout/layout-editor-store";

function Region(props: {
  regionId: RegionId;
  instanceId: string | null;
  testId: string;
}): ReactElement {
  const { ref } = useLayoutRegion({
    regionId: props.regionId,
    instanceId: props.instanceId,
  });
  return <div ref={ref} data-testid={props.testId} />;
}

function openSession(preferredInstanceId: string | null): void {
  act(() => {
    useLayoutEditorStore.getState().beginSession({
      scene: "in-place",
      preferredInstanceId,
      startedAt: 0,
    });
  });
}

beforeEach(() => {
  useLayoutEditorStore.getState().endSession();
  useLayoutEditorStore.setState({ instances: new Map() });
});

afterEach(() => {
  cleanup();
  useLayoutEditorStore.getState().endSession();
});

describe("registration", () => {
  it("registers only while a session is live and stamps the node", () => {
    const view = render(
      <Region regionId="minimap" instanceId="tile-a" testId="minimap" />,
    );
    const node = view.getByTestId("minimap");

    expect(node.hasAttribute("data-layout-region")).toBe(false);
    expect(
      preferredRegionInstance(useLayoutEditorStore.getState(), "minimap"),
    ).toBeNull();

    openSession("tile-a");

    expect(node.getAttribute("data-layout-region")).toBe("minimap");
    expect(node.getAttribute("data-layout-instance")).toBe("tile-a");
    expect(
      preferredRegionInstance(useLayoutEditorStore.getState(), "minimap")?.node,
    ).toBe(node);

    act(() => {
      useLayoutEditorStore.getState().endSession();
    });

    expect(node.hasAttribute("data-layout-region")).toBe(false);
  });

  it("leaves a hidden pane's copy out of the editor", () => {
    openSession(null);
    const view = render(
      <PaneVisibilityContext value={false}>
        <Region regionId="mic" instanceId="tile-a" testId="mic" />
      </PaneVisibilityContext>,
    );

    expect(view.getByTestId("mic").hasAttribute("data-layout-region")).toBe(
      false,
    );
    expect(
      preferredRegionInstance(useLayoutEditorStore.getState(), "mic"),
    ).toBeNull();
  });

  it("unregisters and leaves the app's element as it was found", () => {
    openSession(null);
    const view = render(
      <Region regionId="mic" instanceId={null} testId="mic" />,
    );
    const node = view.getByTestId("mic");
    expect(node.getAttribute("data-layout-region")).toBe("mic");

    view.unmount();

    expect(
      preferredRegionInstance(useLayoutEditorStore.getState(), "mic"),
    ).toBeNull();
    expect(node.attributes.length).toBe(1);
    expect(node.getAttribute("data-testid")).toBe("mic");
  });
});

describe("decoration", () => {
  it("lights up every instance of a hovered region (L-23)", () => {
    openSession("tile-b");
    const view = render(
      <>
        <Region regionId="minimap" instanceId="tile-a" testId="a" />
        <Region regionId="minimap" instanceId="tile-b" testId="b" />
        <Region regionId="mic" instanceId="tile-a" testId="other" />
      </>,
    );

    act(() => {
      useLayoutEditorStore.getState().setHovered("minimap");
    });

    expect(view.getByTestId("a").getAttribute("data-hover")).toBe("1");
    expect(view.getByTestId("b").getAttribute("data-hover")).toBe("1");
    expect(view.getByTestId("other").hasAttribute("data-hover")).toBe(false);
  });

  it("anchors exactly one instance per role (C-12)", () => {
    openSession("tile-b");
    const view = render(
      <>
        <Region regionId="minimap" instanceId="tile-a" testId="a" />
        <Region regionId="minimap" instanceId="tile-b" testId="b" />
      </>,
    );

    act(() => {
      useLayoutEditorStore.getState().setHovered("minimap");
      useLayoutEditorStore.getState().select("minimap");
    });

    expect(view.getByTestId("a").hasAttribute("data-layout-anchor")).toBe(
      false,
    );
    expect(view.getByTestId("b").getAttribute("data-layout-anchor")).toBe(
      "hover selected",
    );
  });

  it("keeps the hover anchor and the selection anchor apart", () => {
    openSession(null);
    const view = render(
      <>
        <Region regionId="minimap" instanceId={null} testId="minimap" />
        <Region regionId="mic" instanceId={null} testId="mic" />
      </>,
    );

    act(() => {
      useLayoutEditorStore.getState().select("minimap");
      useLayoutEditorStore.getState().setHovered("mic");
    });

    expect(view.getByTestId("minimap").getAttribute("data-layout-anchor")).toBe(
      "selected",
    );
    expect(view.getByTestId("mic").getAttribute("data-layout-anchor")).toBe(
      "hover",
    );
  });

  it("moves the anchor onto the surviving instance when the preferred one goes", () => {
    openSession("tile-b");
    const view = render(
      <>
        <Region regionId="minimap" instanceId="tile-a" testId="a" />
        <Region regionId="minimap" instanceId="tile-b" testId="b" />
      </>,
    );
    act(() => {
      useLayoutEditorStore.getState().select("minimap");
    });
    expect(view.getByTestId("b").getAttribute("data-layout-anchor")).toBe(
      "selected",
    );

    view.rerender(<Region regionId="minimap" instanceId="tile-a" testId="a" />);

    expect(view.getByTestId("a").getAttribute("data-layout-anchor")).toBe(
      "selected",
    );
  });
});
