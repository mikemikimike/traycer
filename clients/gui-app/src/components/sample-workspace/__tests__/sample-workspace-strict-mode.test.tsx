import { act, cleanup, render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SampleWorkspaceSurface } from "@/components/sample-workspace/sample-workspace-surface";
import { emptyTabStripLayout, tabItemId } from "@/stores/tabs/layout";
import { useTabsStore } from "@/stores/tabs/store";
import { tabCommandCoordinator } from "@/stores/tabs/tab-command-coordinator";
import type { TabRef } from "@/stores/tabs/types";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";

vi.mock("@/components/sample-workspace/sample-workspace-body", () => ({
  SampleWorkspaceBody: () => <div data-testid="sample-body" />,
}));

const EPIC_REF: TabRef = { kind: "epic", id: "tab-a" };
const SAMPLE_REF: TabRef = { kind: "sample-workspace", id: "sample-workspace" };
const EPIC_ITEM_ID = tabItemId(EPIC_REF);
const SAMPLE_ITEM_ID = tabItemId(SAMPLE_REF);

function sampleTabCount(): number {
  return useTabsStore
    .getState()
    .items.filter(
      (item) => item.kind === "tab" && item.ref.kind === "sample-workspace",
    ).length;
}

/** Both tabs materialized through the ordinary tab machinery, `activeItemId` chosen. */
function seed(activeItemId: string): void {
  useTabsStore.setState({
    ...emptyTabStripLayout(),
    items: [
      { kind: "tab", id: EPIC_ITEM_ID, ref: EPIC_REF },
      { kind: "tab", id: SAMPLE_ITEM_ID, ref: SAMPLE_REF },
    ],
    activeItemId,
    stripOrder: [EPIC_REF, SAMPLE_REF],
  });
}

function beginSampleSession() {
  useLayoutEditorStore.getState().beginSession({
    scene: "sample",
    entry: "pointer",
    preferredInstanceId: null,
    startedAt: 0,
  });
  return useLayoutEditorStore.getState().session;
}

async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function renderStrict() {
  return render(
    <StrictMode>
      <SampleWorkspaceSurface tabId="sample-workspace" />
    </StrictMode>,
  );
}

beforeEach(() => {
  useLayoutEditorStore.getState().endSession();
  tabCommandCoordinator.resetReconciliationForTesting();
});

afterEach(() => {
  cleanup();
  useLayoutEditorStore.getState().endSession();
  useTabsStore.setState({ ...emptyTabStripLayout(), stripOrder: [] });
});

describe("S3 - StrictMode's synchronous double-invoke is one logical entry", () => {
  it("an active sample session survives the double-invoke with no premature end", async () => {
    seed(SAMPLE_ITEM_ID);
    const session = beginSampleSession();

    renderStrict();
    await flushMicrotasks();

    expect(useLayoutEditorStore.getState().session).toBe(session);
  });

  it("an inactive sample tab never touches the session, even under StrictMode", async () => {
    seed(EPIC_ITEM_ID);
    const session = beginSampleSession();

    renderStrict();
    await flushMicrotasks();

    expect(useLayoutEditorStore.getState().session).toBe(session);
  });
});

describe("S3 - a REAL exit still cleans up", () => {
  it("unmounting ends the session exactly once", async () => {
    seed(SAMPLE_ITEM_ID);
    beginSampleSession();
    const view = renderStrict();
    await flushMicrotasks();

    view.unmount();
    await flushMicrotasks();

    expect(useLayoutEditorStore.getState().session).toBeNull();
  });

  it("unmount alone does not remove the tab - the tab machinery owns that separately", async () => {
    seed(SAMPLE_ITEM_ID);
    beginSampleSession();
    const view = renderStrict();
    await flushMicrotasks();

    view.unmount();
    await flushMicrotasks();

    expect(sampleTabCount()).toBe(1);
  });

  it("an immediate unmount + replacement mount (before the microtask) keeps ONE logical session", async () => {
    seed(SAMPLE_ITEM_ID);
    const session = beginSampleSession();
    const first = render(<SampleWorkspaceSurface tabId="sample-workspace" />);

    // A different component instance takes over in the same tick, e.g. the
    // host re-keying the surface. No await in between.
    first.unmount();
    render(<SampleWorkspaceSurface tabId="sample-workspace" />);
    await flushMicrotasks();

    expect(useLayoutEditorStore.getState().session).toBe(session);
  });

  it("after such a replacement, the replacement's REAL unmount still cleans up", async () => {
    seed(SAMPLE_ITEM_ID);
    beginSampleSession();
    const first = render(<SampleWorkspaceSurface tabId="sample-workspace" />);
    first.unmount();
    const second = render(<SampleWorkspaceSurface tabId="sample-workspace" />);
    await flushMicrotasks();

    second.unmount();
    await flushMicrotasks();

    expect(useLayoutEditorStore.getState().session).toBeNull();
  });

  it("closes the tab when it is active but the editor opened somewhere else", () => {
    seed(SAMPLE_ITEM_ID);
    render(<SampleWorkspaceSurface tabId="sample-workspace" />);
    expect(sampleTabCount()).toBe(1);

    // The editor's door opened an in-place session (a different tab's own
    // canvas), so this stale sample tab is not what the session is for.
    act(() => {
      useLayoutEditorStore.getState().beginSession({
        scene: "in-place",
        entry: "pointer",
        preferredInstanceId: null,
        startedAt: 0,
      });
    });

    expect(sampleTabCount()).toBe(0);
  });
});
