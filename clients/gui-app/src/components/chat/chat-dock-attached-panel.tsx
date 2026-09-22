import {
  createContext,
  useContext,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useChatDockCompactStrip } from "@/components/chat/chat-dock-compact-context";
import {
  CHAT_DOCK_SECTION_NAME,
  type ChatDockSection,
} from "@/lib/chat/chat-dock-sections";
import { useSettingsStore } from "@/stores/settings/settings-store";
import {
  CHAT_DOCK_PANEL_DEFAULT_HEIGHT_RATIO,
  CHAT_DOCK_PANEL_MAX_HEIGHT_RATIO,
  CHAT_DOCK_PANEL_MIN_HEIGHT_RATIO,
  chatDockPanelHeightCss,
  chatDockPanelPaneHeight,
  clampChatDockPanelHeightRatio,
} from "@/lib/chat/chat-dock-panel-height";
import { cn } from "@/lib/utils";

/**
 * The node in the pill row that an OPEN pill's actions are portalled into.
 *
 * L-142 puts "Review all / Undo all", "Stop all" and the queue's Pause/Resume
 * at the right end of the pill row rather than inside the panel, so the panel
 * below the pills is pure content. A portal rather than a prop because the
 * actions are made of the panel's own state - pending mutations, gates,
 * confirm dialogs - and lifting them into the strip would mean lifting all of
 * that with them, or duplicating it.
 *
 * `null` is "no strip on this surface", which is the landing composer and the
 * new-conversation modal; their panels never attach.
 */
const ChatDockPillActionsHostContext = createContext<HTMLElement | null>(null);

export const ChatDockPillActionsHostProvider =
  ChatDockPillActionsHostContext.Provider;

/**
 * One attached panel's actions, drawn at the right end of the pill row.
 *
 * Renders nothing until the strip's host node exists, which is the same commit
 * the strip first paints in - so an attached panel's actions arrive with it
 * rather than a frame later.
 */
export function ChatDockPillActions(props: {
  readonly children: ReactNode;
}): ReactNode {
  const host = useContext(ChatDockPillActionsHostContext);
  if (host === null) return null;
  return createPortal(props.children, host);
}

/** One arrow press, ~2% of the chat pane - fine enough to land on a row. */
const KEYBOARD_STEP = 0.02;

/**
 * The attached panel's body: a resizable, scrolling box with no header of its
 * own.
 *
 * The height is one device-local preference shared by every pill panel, not a
 * per-section one: the pills are a switcher over one slot, so a slot that
 * changed size as you moved between pills would make the composer hop for a
 * reason nobody asked for.
 *
 * It is expressed as a share of the CHAT PANE rather than in pixels (L-145):
 * on a canvas with several tiles a chat is a third of the window tall, and a
 * window-relative third of it would leave no transcript at all. The pane is a
 * size container (`chat-tile.tsx`), so the share is a plain `cqh` and nothing
 * here observes or measures while the window resizes.
 *
 * No enter or exit motion, and that is a decision rather than an omission.
 * This box sits directly on top of the composer, so animating its height
 * animates the composer's position - the one element on screen whose response
 * has to be instant - and a swap between two pills would have to play that
 * animation twice, once shrinking and once growing. The pill carries the
 * feedback instead: it takes its selected tone in 120ms and presses to
 * `scale-97`, both of which reduced motion already cancels.
 */
export function ChatDockAttachedPanelBody(props: {
  readonly section: ChatDockSection;
  readonly testId: string;
  readonly children: ReactNode;
}): ReactNode {
  const strip = useChatDockCompactStrip();
  const storedRatio = useSettingsStore((state) => state.chatDockPanelHeight);
  const setStoredRatio = useSettingsStore(
    (state) => state.setChatDockPanelHeight,
  );
  // The drag stays transient until release: a store write per pointermove
  // would put a `localStorage` round trip inside the drag loop, and Escape
  // would have nothing to restore to.
  const [dragRatio, setDragRatio] = useState<number | null>(null);
  const dragStart = useRef<{
    clientY: number;
    ratio: number;
    paneHeight: number;
  } | null>(null);
  const ratio = clampChatDockPanelHeightRatio(dragRatio ?? storedRatio);
  const percent = Math.round(ratio * 100);

  const ratioAtPointer = (clientY: number): number => {
    const start = dragStart.current;
    if (start === null) return ratio;
    if (start.paneHeight <= 0) return ratio;
    // The panel grows UPWARD: its top edge is the handle, so dragging up adds
    // height. 1:1 with the pointer, offset from where the handle was grabbed,
    // against the pane the drawn share is a share of.
    return clampChatDockPanelHeightRatio(
      start.ratio + (start.clientY - clientY) / start.paneHeight,
    );
  };
  const endDrag = (): void => {
    dragStart.current = null;
    setDragRatio(null);
  };
  const handlePointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    // The one layout read of the whole gesture.
    dragStart.current = {
      clientY: event.clientY,
      ratio,
      paneHeight: chatDockPanelPaneHeight(event.currentTarget),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragRatio(ratio);
  };
  const handlePointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    if (dragStart.current === null) return;
    setDragRatio(ratioAtPointer(event.clientY));
  };
  const handlePointerUp = (event: PointerEvent<HTMLDivElement>): void => {
    if (dragStart.current === null) return;
    const next = ratioAtPointer(event.clientY);
    endDrag();
    setStoredRatio(next);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      endDrag();
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setStoredRatio(clampChatDockPanelHeightRatio(ratio + KEYBOARD_STEP));
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setStoredRatio(clampChatDockPanelHeightRatio(ratio - KEYBOARD_STEP));
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setStoredRatio(CHAT_DOCK_PANEL_MAX_HEIGHT_RATIO);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setStoredRatio(CHAT_DOCK_PANEL_MIN_HEIGHT_RATIO);
    }
  };

  const sectionName = CHAT_DOCK_SECTION_NAME[props.section];
  // Spelled out rather than keyed by `CHAT_DOCK_PANEL_HEIGHT_PROPERTY`, the
  // same way the class below spells it: a computed key is a style object the
  // design linter cannot read, and `chat-dock-panel-pane-height.test.tsx`
  // checks both spellings against that constant.
  const bodyHeightStyle = {
    "--chat-dock-panel-height": chatDockPanelHeightCss(percent),
  } as CSSProperties;
  return (
    <div
      id={strip === null ? undefined : strip.panelId}
      role="region"
      aria-label={sectionName}
      data-testid="chat-dock-attached-panel"
      data-dock-section={props.section}
      // A container of its own, because the rows inside these panels carry
      // container queries (`@max-[28rem]:hidden`) that used to resolve against
      // the collapsible they no longer have.
      className="@container flex min-w-0 flex-col"
    >
      <div
        role="separator"
        tabIndex={0}
        aria-orientation="horizontal"
        aria-label={`Resize the ${sectionName} panel`}
        aria-valuemin={Math.round(CHAT_DOCK_PANEL_MIN_HEIGHT_RATIO * 100)}
        aria-valuemax={Math.round(CHAT_DOCK_PANEL_MAX_HEIGHT_RATIO * 100)}
        aria-valuenow={percent}
        aria-valuetext={`${percent}% of the chat pane`}
        data-testid="chat-dock-attached-panel-resize"
        onDoubleClick={() => {
          setStoredRatio(CHAT_DOCK_PANEL_DEFAULT_HEIGHT_RATIO);
        }}
        onKeyDown={handleKeyDown}
        onPointerCancel={endDrag}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className={cn(
          "group/dock-resize flex h-2 shrink-0 cursor-row-resize touch-none items-center justify-center outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring/60",
        )}
      >
        {/* The grip is a child rather than a border on the grab strip, so the
            8px target stays a target while the mark stays a hairline. */}
        <span
          aria-hidden
          className={cn(
            "h-px w-8 rounded-full bg-foreground/20 transition-colors duration-120 ease-out",
            "group-hover/dock-resize:bg-foreground/40 group-focus-visible/dock-resize:bg-foreground/40",
          )}
        />
      </div>
      <div
        data-testid={props.testId}
        data-native-scrollbar="true"
        // Inline because the value is a live drag position; the formula it
        // carries (the cap, the floor, the unit) is in the height module.
        style={bodyHeightStyle}
        className="h-[var(--chat-dock-panel-height)] min-h-0 w-full overflow-y-auto"
      >
        {props.children}
      </div>
    </div>
  );
}
