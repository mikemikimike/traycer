import { House } from "lucide-react";
import {
  SHOW_HIDE_VERBS,
  type LayoutRegion,
} from "@/components/layout-editor/regions/region-grammar";
import { shownStateWord } from "@/components/layout-editor/regions/region-state-words";

/** The top bar's one customizable element. */
export const HOME_TAB_REGION: LayoutRegion<"homeTab"> = {
  id: "homeTab",
  name: "Home tab",
  surface: "topBar",
  icon: House,
  where: "Top bar - left of the tabs",
  whereByHost: null,
  hint: null,
  keywords: ["home", "start", "page", "tab"],
  sampleFilled: false,
  rows: [],
  quickVerbs: SHOW_HIDE_VERBS,
  stateWord: shownStateWord,
};
