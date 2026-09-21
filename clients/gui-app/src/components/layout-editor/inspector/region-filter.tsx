import type { KeyboardEvent, ReactNode, Ref } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";

interface RegionFilterProps {
  readonly ref: Ref<HTMLInputElement>;
  /** ArrowDown from the field moves to the first index row (L-31). */
  readonly onArrowDown: () => void;
  /**
   * Enter opens the first match, without a trip through the rows, or `null`
   * for a host with nowhere for Enter to go.
   *
   * `null` is not the same as a handler that does nothing: the key is only
   * taken - `preventDefault` - by a host that is going to act on it. The page
   * host (`layout-settings-panel.tsx`) has no "first match" to open, and
   * swallowing Enter there left the key doing nothing at all, unable to reach
   * a form or the Settings modal around it.
   */
  readonly onEnter: (() => void) | null;
}

/**
 * The index's filter field (L-07): `.filterwrap` / `input.filter` in the
 * prototype. Matches labels and keywords through `regionMatchesFilter` and
 * auto-expands Fine-tune on a fine-tune match - both read by
 * `inspector-index.tsx` and `region-section.tsx` off `filter` directly, so
 * this component only owns the field itself and the store write.
 *
 * Takes its ref as a plain prop (React 19) so `inspector-index.tsx` can
 * return focus to it: L-31's "ArrowUp from the first row returns to the
 * filter" needs the field itself, not a store flag.
 */
export function RegionFilter(props: RegionFilterProps): ReactNode {
  const { ref } = props;
  const filter = useLayoutEditorStore((state) => state.filter);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      useLayoutEditorStore.getState().setKeyboardNav(true);
      props.onArrowDown();
    } else if (event.key === "Enter") {
      const onEnter = props.onEnter;
      if (onEnter === null) return;
      event.preventDefault();
      onEnter();
    } else if (event.key === "Escape" && filter.length > 0) {
      event.preventDefault();
      event.stopPropagation();
      useLayoutEditorStore.getState().setFilter("");
    }
  }

  return (
    <div className="relative flex items-center px-3 py-2">
      <Search
        aria-hidden
        className="pointer-events-none absolute left-5.5 size-3.5 text-muted-foreground"
      />
      <Input
        ref={ref}
        type="text"
        size="sm"
        className="pl-7"
        placeholder="Filter"
        aria-label="Filter regions"
        autoComplete="off"
        value={filter}
        onChange={(event) => {
          useLayoutEditorStore.getState().setFilter(event.target.value);
        }}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}
