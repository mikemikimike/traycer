import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { openLayoutEditor } from "@/lib/layout/editor-session";
import type { CommandItem, ReactCommandSource } from "@/lib/commands/types";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";

/**
 * "Customize layout" in the palette (L-15, L-33).
 *
 * One item, not two: the sample workspace is no longer something to open, it
 * is the scene the door falls back to when there is no real chat to decorate,
 * so a second row would be asking the user to make a choice the session
 * already makes for them.
 *
 * `entry: "keyboard"` unconditionally - the palette is reached by typing, and
 * the entry method gates the View Transition as well as being reported (L-30,
 * L-54). A palette row selected with the mouse is still a palette row.
 */
export const customizeSource: ReactCommandSource = {
  id: "customize",
  useItems: () => {
    const navigate = useNavigate();
    const editing = useLayoutEditorStore((state) => state.session !== null);
    const locked = useLayoutEditorStore(
      (state) => state.lockedBy === "other-window",
    );
    return useMemo<ReadonlyArray<CommandItem>>(() => {
      // Nothing to offer from inside a session: the editor is already open and
      // its own chrome is how it is left.
      if (editing) return [];
      const item = {
        id: "customize:layout",
        label: "Customize layout",
        keywords: ["layout", "customize", "appearance", "chrome", "arrange"],
        group: "actions",
        scope: "actions",
        shortcut: null,
        actionId: null,
        subpage: null,
      } as const;
      // Said rather than silently refused: the door declines while another
      // window holds the lease (L-32), and a row that does nothing when
      // pressed is worse than a row that explains itself.
      if (locked) {
        return [
          {
            ...item,
            description: "Open in another window. Your layout is saved there.",
            disabled: true,
            run: () => undefined,
          },
        ];
      }
      return [
        {
          ...item,
          description: "Rearrange the app's chrome in a sample workspace",
          run: () => {
            openLayoutEditor({
              source: "command_palette",
              entry: "keyboard",
              target: null,
              navigate,
            });
          },
        },
      ];
    }, [editing, locked, navigate]);
  },
};
