import type { ReactNode } from "react";
import type { EpicWaitingReason } from "@/hooks/epic/use-epic-activity-status";
import type { HeaderTabAppearance } from "@/stores/tabs/types";
import type { SideTabTile } from "./side-tab-row";
import {
  SIDE_TAB_CUSTOM_ICON_PAIR_CLASS,
  SIDE_TAB_CUSTOM_ICON_SINGLE_CLASS,
} from "./side-strip-tokens";
import { firstGraphemes, tabMonogram } from "./tab-monogram";

/**
 * What a side row's tile shows (S-17): the custom icon, else the spinner while
 * the title is generating, else the monogram of the resolved title, else
 * `fallback` (the row's status glyph) for a title with no letter or digit.
 * `title` is the resolved title, never the "Untitled" placeholder.
 */
export function sideTabTileOf(input: {
  readonly appearance: HeaderTabAppearance | null;
  readonly title: string;
  readonly titleGenerating: boolean;
  readonly fallback: ReactNode;
}): SideTabTile {
  const icon = firstGraphemes(input.appearance?.icon ?? "", 2);
  if (icon.length > 0) {
    return {
      kind: "icon",
      icon: (
        <span
          aria-hidden
          data-slot="tab-custom-icon"
          className={
            icon.length === 1
              ? SIDE_TAB_CUSTOM_ICON_SINGLE_CLASS
              : SIDE_TAB_CUSTOM_ICON_PAIR_CLASS
          }
        >
          {icon.join("")}
        </span>
      ),
    };
  }
  if (input.titleGenerating) return { kind: "generating" };
  const monogram = tabMonogram(input.title);
  if (monogram !== null) return { kind: "monogram", text: monogram };
  return { kind: "icon", icon: input.fallback };
}

/** The waiting chip's one word (S-26). */
export function sideTabWaitingLabel(
  reason: EpicWaitingReason | null,
): "Approve" | "Reply" | null {
  if (reason === "reply") return "Reply";
  if (reason === "approval") return "Approve";
  return null;
}
