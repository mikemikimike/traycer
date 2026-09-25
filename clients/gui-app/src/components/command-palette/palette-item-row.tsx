import * as React from "react";
import { CommandItem } from "@/components/ui/command";

/** Action palettes have no chosen-value checkmark. */
export function PaletteItemRow(
  props: React.ComponentProps<typeof CommandItem>,
) {
  return <CommandItem {...props} showCheck={false} />;
}
