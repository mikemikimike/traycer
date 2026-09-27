import { useEffect, useMemo, useState } from "react";
import { sessionKeyOf } from "@traycer-clients/shared/replica-runtime";
import { usePaneVisible } from "@/components/epic-tabs/pane-visibility-context";
import { selectChatPrewarmRefs } from "@/components/epic-canvas/chat-prewarm-selection";
import { subscribeChatTileSessionAcquired } from "@/components/epic-canvas/chat-prewarm-handoff";
import { useIsMobileViewport } from "@/hooks/ui/use-mobile-viewport";
import { useEpicParked } from "@/lib/epics/epic-parking";
import { useChatSessionHandle } from "@/lib/registries/chat-session-registry";
import { useEpicCanvas, useEpicCanvasStore } from "@/stores/epics/canvas/store";

/**
 * The persisted canvas already identifies the selected chat before the task
 * state frame arrives. Acquire its stream while that frame is in flight; the
 * tile still waits for task authority before painting and uses the same chat
 * registry entry when it mounts. A newly created chat has a pending-create
 * marker, and an initial-chat handoff uses the live canvas path instead.
 */
export function ChatStreamPrewarm(props: {
  readonly epicId: string;
  readonly tabId: string;
  readonly snapshotLoaded: boolean;
}) {
  // A task already hydrated before this shell mounted has no relay wait to
  // overlap. Keep this decision for the mount so a real prewarm survives the
  // later false→true snapshot transition and can hand its lease to the tile.
  const [openedBeforeSnapshot] = useState(() => !props.snapshotLoaded);
  return openedBeforeSnapshot ? <ActiveChatStreamPrewarm {...props} /> : null;
}

function ActiveChatStreamPrewarm(props: {
  readonly epicId: string;
  readonly tabId: string;
  readonly snapshotLoaded: boolean;
}) {
  const visible = usePaneVisible();
  const parked = useEpicParked(props.epicId);
  const mobile = useIsMobileViewport();
  const canvas = useEpicCanvas(props.tabId);
  const pendingCreateIds = useEpicCanvasStore(
    (s) => s.pendingCreateArtifactIds,
  );
  const selfDeletedIds = useEpicCanvasStore((s) => s.selfDeletedArtifactIds);
  const refs = useMemo(
    () =>
      selectChatPrewarmRefs(canvas, mobile, pendingCreateIds, selfDeletedIds),
    [canvas, mobile, pendingCreateIds, selfDeletedIds],
  );
  if (!visible || parked) {
    return null;
  }
  return refs.map((ref) => (
    <ChatStreamPrewarmLease
      key={sessionKeyOf([ref.instanceId, ref.hostId, ref.id])}
      epicId={props.epicId}
      chatId={ref.id}
      hostId={ref.hostId}
      instanceId={ref.instanceId}
      snapshotLoaded={props.snapshotLoaded}
    />
  ));
}

function ChatStreamPrewarmLease(props: {
  readonly epicId: string;
  readonly chatId: string;
  readonly hostId: string;
  readonly instanceId: string;
  readonly snapshotLoaded: boolean;
}) {
  const [startedBeforeSnapshot] = useState(() => !props.snapshotLoaded);
  const [handedOff, setHandedOff] = useState(false);
  useEffect(() => {
    if (!startedBeforeSnapshot || handedOff) return;
    return subscribeChatTileSessionAcquired(
      {
        epicId: props.epicId,
        hostId: props.hostId,
        chatId: props.chatId,
        instanceId: props.instanceId,
      },
      () => setHandedOff(true),
    );
  }, [
    props.epicId,
    props.hostId,
    props.chatId,
    props.instanceId,
    startedBeforeSnapshot,
    handedOff,
  ]);
  useEffect(() => {
    if (!props.snapshotLoaded || handedOff || !startedBeforeSnapshot) return;
    // A stale/missing tile must not keep a speculative chat leased forever.
    const timer = setTimeout(() => setHandedOff(true), 30_000);
    return () => clearTimeout(timer);
  }, [props.snapshotLoaded, handedOff, startedBeforeSnapshot]);
  useChatSessionHandle(
    props.chatId,
    props.hostId,
    startedBeforeSnapshot && !handedOff,
  );
  return null;
}
