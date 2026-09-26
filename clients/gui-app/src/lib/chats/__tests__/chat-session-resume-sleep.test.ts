import { afterEach, describe, expect, it } from "vitest";
import { MockRunnerHost } from "@traycer-clients/shared/host-client/mock/mock-runner-host";
import type { IHostStreamClient } from "@traycer-clients/shared/host-transport/host-stream-client";
import { WAKE_FORCE_RECONNECT_AFTER_BACKGROUND_MS } from "@traycer-clients/shared/host-transport/remote/index";
import type { HostStreamRpcRegistry } from "@traycer/protocol/host/registry";
import {
  createChatSessionStore,
  type ChatSessionStoreHandle,
} from "@/stores/chats/chat-session-store";
import { IMMEDIATE_STREAM_FLUSH_COORDINATOR } from "@/stores/chats/stream-flush-coordinator";
import { CHAT_STORE_TEST_ENVIRONMENT } from "@/stores/chats/test-support/chat-store-test-environment";
import {
  __getChatSessionRegistryForTests,
  disposeAllChatSessions,
} from "@/lib/registries/chat-session-registry";
import { subscribeWarmChatSleepOnResume } from "@/lib/chats/chat-session-resume-sleep";
import { subscribeChatSessionWakeRetry } from "@/lib/chats/chat-session-wake-retry";
import {
  resetRemoteResumeSweepForTest,
  subscribeStreamWakeReconnect,
} from "@/lib/host/stream-wake-reconnect";
import {
  DESKTOP_RETENTION_PROFILE,
  MOBILE_RETENTION_PROFILE,
  setRetentionProfile,
} from "@/stores/replica-memory/retention-profile";

const EPIC_ID = "epic-resume-sleep";
const HOST_ID = "host-resume-sleep";
const LONG_BACKGROUND_MS = WAKE_FORCE_RECONNECT_AFTER_BACKGROUND_MS;

interface Harness {
  readonly handle: ChatSessionStoreHandle;
  readonly opens: () => number;
  readonly closes: () => number;
}

function createHarness(chatId: string): Harness {
  let opens = 0;
  let closes = 0;
  const handle = createChatSessionStore({
    environment: CHAT_STORE_TEST_ENVIRONMENT,
    hostId: HOST_ID,
    epicId: EPIC_ID,
    chatId,
    userId: "user-resume-sleep",
    onAuthError: null,
    onProviderAuthError: null,
    wakeTransport: null,
    streamFlushCoordinator: IMMEDIATE_STREAM_FLUSH_COORDINATOR,
    streamClientFactory: () => {
      opens += 1;
      return {
        sendAction: () => undefined,
        sameTurnSteeringProtocolSupported: () => false,
        draftBlobBridgeSupported: () => false,
        requestTranscriptRange: () => undefined,
        requestResnapshot: () => undefined,
        close: () => {
          closes += 1;
        },
      };
    },
  });
  return { handle, opens: () => opens, closes: () => closes };
}

/** A chat in the registry; `leased: false` releases it to the warm pool. */
function openChat(chatId: string, leased: boolean): Harness {
  const harness = createHarness(chatId);
  const registry = __getChatSessionRegistryForTests();
  registry.acquire(
    { epicId: EPIC_ID, chatId, hostId: HOST_ID, scopeKey: "resume-scope" },
    () => harness.handle,
  );
  if (!leased) registry.release(EPIC_ID, chatId, HOST_ID);
  return harness;
}

function makeRunnerHost(): MockRunnerHost {
  return new MockRunnerHost({
    signInUrl: "https://auth.traycer.invalid/sign-in",
    authnBaseUrl: "http://localhost:5005",
    localHost: null,
    hosts: [],
    workspaceFolderPickerPaths: undefined,
    hasLocalHost: undefined,
    traycerCli: undefined,
  });
}

afterEach(() => {
  disposeAllChatSessions();
  setRetentionProfile(DESKTOP_RETENTION_PROFILE);
  resetRemoteResumeSweepForTest();
});

describe("subscribeWarmChatSleepOnResume", () => {
  it("after a long background, leaves lease-free idle chats asleep and the leased one connected", () => {
    setRetentionProfile(MOBILE_RETENTION_PROFILE);
    const runnerHost = makeRunnerHost();
    const warm = openChat("chat-warm", false);
    const onScreen = openChat("chat-on-screen", true);
    const dispose = subscribeWarmChatSleepOnResume(runnerHost);

    runnerHost.emitSystemResumed({ backgroundedForMs: LONG_BACKGROUND_MS });

    expect(warm.handle.store.getState().asleep).toBe(true);
    expect(warm.closes()).toBe(1);
    expect(onScreen.handle.store.getState().asleep).toBe(false);
    expect(onScreen.closes()).toBe(0);
    dispose();
  });

  it("keeps a lease-free chat with work in flight connected", () => {
    setRetentionProfile(MOBILE_RETENTION_PROFILE);
    const runnerHost = makeRunnerHost();
    const busy = openChat("chat-busy", true);
    busy.handle.store.setState({ runStatus: "running" });
    __getChatSessionRegistryForTests().release(EPIC_ID, "chat-busy", HOST_ID);
    const dispose = subscribeWarmChatSleepOnResume(runnerHost);

    runnerHost.emitSystemResumed({ backgroundedForMs: LONG_BACKGROUND_MS });

    expect(busy.handle.store.getState().asleep).toBe(false);
    expect(busy.closes()).toBe(0);
    dispose();
  });

  it("reconnects a chat left asleep once a tile leases it", () => {
    setRetentionProfile(MOBILE_RETENTION_PROFILE);
    const runnerHost = makeRunnerHost();
    const warm = openChat("chat-warm", false);
    const dispose = subscribeWarmChatSleepOnResume(runnerHost);
    runnerHost.emitSystemResumed({ backgroundedForMs: LONG_BACKGROUND_MS });
    expect(warm.opens()).toBe(1);

    __getChatSessionRegistryForTests().acquire(
      {
        epicId: EPIC_ID,
        chatId: "chat-warm",
        hostId: HOST_ID,
        scopeKey: "resume-scope",
      },
      () => createHarness("chat-warm").handle,
    );

    expect(warm.opens()).toBe(2);
    expect(warm.handle.store.getState().asleep).toBe(false);
    dispose();
  });

  it("leaves warm chats alone after a quick app switch, whose sockets may have survived", () => {
    setRetentionProfile(MOBILE_RETENTION_PROFILE);
    const runnerHost = makeRunnerHost();
    const warm = openChat("chat-warm", false);
    const dispose = subscribeWarmChatSleepOnResume(runnerHost);

    runnerHost.emitSystemResumed({
      backgroundedForMs: WAKE_FORCE_RECONNECT_AFTER_BACKGROUND_MS - 1,
    });
    runnerHost.emitSystemResumed({ backgroundedForMs: null });

    expect(warm.handle.store.getState().asleep).toBe(false);
    expect(warm.closes()).toBe(0);
    dispose();
  });

  it("does nothing on a profile without a sleep threshold", () => {
    const runnerHost = makeRunnerHost();
    const warm = openChat("chat-warm", false);
    const dispose = subscribeWarmChatSleepOnResume(runnerHost);

    runnerHost.emitSystemResumed({ backgroundedForMs: LONG_BACKGROUND_MS });

    expect(warm.handle.store.getState().asleep).toBe(false);
    expect(warm.closes()).toBe(0);
    dispose();
  });

  it("stops listening once disposed", () => {
    setRetentionProfile(MOBILE_RETENTION_PROFILE);
    const runnerHost = makeRunnerHost();
    const warm = openChat("chat-warm", false);
    const dispose = subscribeWarmChatSleepOnResume(runnerHost);
    dispose();

    runnerHost.emitSystemResumed({ backgroundedForMs: LONG_BACKGROUND_MS });

    expect(warm.handle.store.getState().asleep).toBe(false);
  });
});

/**
 * A chat whose stream client rides a transport wired to the resume edge the
 * way the durable transport is (`subscribeStreamWakeReconnect`), and counts the
 * `chat.subscribe` frames it would send: one when the stream opens, and one
 * more for every forced wake re-dial of a transport that is still open.
 * Closing the stream disposes the wake wiring first and then the socket, in
 * the durable transport's order.
 */
function openWiredChat(
  chatId: string,
  runnerHost: MockRunnerHost,
): { readonly handle: ChatSessionStoreHandle; readonly frames: () => number } {
  let frames = 0;
  const handle = createChatSessionStore({
    environment: CHAT_STORE_TEST_ENVIRONMENT,
    hostId: HOST_ID,
    epicId: EPIC_ID,
    chatId,
    userId: "user-resume-sleep",
    onAuthError: null,
    onProviderAuthError: null,
    wakeTransport: null,
    streamFlushCoordinator: IMMEDIATE_STREAM_FLUSH_COORDINATOR,
    streamClientFactory: () => {
      let closed = false;
      frames += 1;
      const transport: IHostStreamClient<HostStreamRpcRegistry> = {
        subscribe: () => {
          throw new Error("unused");
        },
        subscribeWithParamsProvider: () => {
          throw new Error("unused");
        },
        close: () => {
          closed = true;
        },
        isClosed: () => closed,
        getClosedReason: () => null,
        onClosed: () => () => undefined,
        instanceId: `transport-${chatId}`,
        notifyBearerRotated: () => undefined,
        notifyCloudVerdictChanged: () => undefined,
        reconnectAll: (_reason, options) => {
          // A closed client ignores the wake, as `WsStreamClient` does.
          if (closed || options.probeFirst) return;
          frames += 1;
        },
        isReady: () => !closed,
        getMethodSupport: () => "unknown",
        subscribeMethodSupport: () => () => undefined,
        getMethodSchemaVersion: () => null,
        subscribeAvailabilityRecovered: () => () => undefined,
      };
      const disposeWake = subscribeStreamWakeReconnect(transport, runnerHost);
      return {
        sendAction: () => undefined,
        sameTurnSteeringProtocolSupported: () => false,
        draftBlobBridgeSupported: () => false,
        requestTranscriptRange: () => undefined,
        requestResnapshot: () => undefined,
        close: () => {
          disposeWake();
          transport.close("chat-stream-closed");
        },
      };
    },
  });
  const registry = __getChatSessionRegistryForTests();
  registry.acquire(
    { epicId: EPIC_ID, chatId, hostId: HOST_ID, scopeKey: "resume-scope" },
    () => handle,
  );
  registry.release(EPIC_ID, chatId, HOST_ID);
  return { handle, frames: () => frames };
}

// The resume edge reaches three handlers: each chat transport's own wake
// re-dial, the closed-session wake retry, and the resume sleep. The shell runs
// them in subscription order, and which came first depends on whether the
// chat opened before or after the controller mounted.
describe("subscribeWarmChatSleepOnResume against the wake reconnect", () => {
  it("wake reconnect first: the re-dial goes out, then the chat is left asleep", () => {
    setRetentionProfile(MOBILE_RETENTION_PROFILE);
    const runnerHost = makeRunnerHost();
    const warm = openWiredChat("chat-wake-first", runnerHost);
    const disposeRetry = subscribeChatSessionWakeRetry(runnerHost);
    const disposeSleep = subscribeWarmChatSleepOnResume(runnerHost);

    runnerHost.emitSystemResumed({ backgroundedForMs: LONG_BACKGROUND_MS });

    const state = warm.handle.store.getState();
    expect(state.asleep).toBe(true);
    expect(state.connectionStatus).toBe("closed");
    // The opening subscribe and the wake's forced re-dial; the wake retry
    // does not re-dial a sleeping chat.
    expect(warm.frames()).toBe(2);
    disposeSleep();
    disposeRetry();
  });

  it("resume sleep first: the chat is left asleep and no re-dial goes out", () => {
    setRetentionProfile(MOBILE_RETENTION_PROFILE);
    const runnerHost = makeRunnerHost();
    const disposeSleep = subscribeWarmChatSleepOnResume(runnerHost);
    const disposeRetry = subscribeChatSessionWakeRetry(runnerHost);
    const warm = openWiredChat("chat-sleep-first", runnerHost);

    runnerHost.emitSystemResumed({ backgroundedForMs: LONG_BACKGROUND_MS });

    const state = warm.handle.store.getState();
    expect(state.asleep).toBe(true);
    expect(state.connectionStatus).toBe("closed");
    expect(warm.frames()).toBe(1);
    disposeRetry();
    disposeSleep();
  });
});
