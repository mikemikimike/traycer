import {
  useMemo,
  useRef,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import { Search, X } from "lucide-react";
import {
  useLayoutFormHost,
  type LayoutFormHost,
} from "@/components/layout-editor/inspector/layout-form-host";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { mergeRefs } from "@/lib/merge-refs";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";

interface RegionFilterProps {
  readonly ref: Ref<HTMLInputElement>;
  /**
   * ArrowDown from the field moves to the first row below it (L-31), or `null`
   * for a host with nowhere for it to go.
   *
   * The same shape and the same reason as `onEnter`: a key is only TAKEN -
   * `preventDefault` - by a host that is going to act on it, and the page used
   * to take this one and drop it (R2-04).
   *
   * Whether the walk also lights the canvas's keyboard mode is the HANDLER's
   * to decide, not this field's. `keyboardNav` is a fact about an editor
   * SESSION, and the field is drawn in a host that has none.
   */
  readonly onArrowDown: (() => void) | null;
  /**
   * Enter opens the first match, without a trip through the rows, or `null`
   * for a host with nowhere for Enter to go.
   *
   * `null` is not the same as a handler that does nothing: the page host
   * (`layout-settings-panel.tsx`) has no "first match" to open, and swallowing
   * Enter there left the key doing nothing at all, unable to reach a form or
   * the Settings modal around it.
   */
  readonly onEnter: (() => void) | null;
}

interface FilterCopy {
  readonly placeholder: string;
  readonly label: string;
}

/**
 * What the field says it filters, which is a fact about the HOST (L-125).
 *
 * The inspector's field sits above an index OF regions, so it says so. The
 * page has no index: a card whose regions all fall out disappears whole, so
 * what a person filters there is the settings in front of them.
 */
const FILTER_COPY: Readonly<Record<LayoutFormHost, FilterCopy>> = {
  inspector: { placeholder: "Filter", label: "Filter regions" },
  page: {
    placeholder: "Filter these settings",
    label: "Filter these settings",
  },
};

/**
 * The gutter the field sits in, which is a fact about the HOST as much as the
 * copy above is (L-154).
 *
 * The inspector's field is the only thing at its level, so it carries its own
 * horizontal inset. The page's column already has one, and its CARDS draw the
 * content edge: a field indented inside that edge reads as a narrower thing
 * than the settings it filters, and the band behind it then has to bleed back
 * out to reach the cards - which is exactly the full-bleed stripe L-154 is
 * about. The page keeps the vertical padding, which is the band's own height.
 */
const FIELD_GUTTER: Readonly<Record<LayoutFormHost, string>> = {
  inspector: "px-3 py-2",
  page: "py-2",
};

/**
 * The index's filter field (L-07): `.filterwrap` / `input.filter` in the
 * prototype. Matches labels and keywords through `regionMatchesFilter` and
 * auto-expands Fine-tune on a fine-tune match - both read by
 * `inspector-index.tsx` and `region-section.tsx` off `filter` directly, so
 * this component only owns the field itself and the store write.
 *
 * `InputGroup variant="search"` rather than a hand-placed icon over an
 * `Input`: it is the app's own filter-field shape, and it has the slot the
 * clear button needs. Escape has always cleared the field and nothing said so
 * (L-125), which is a keyboard-only affordance on a page whose whole point is
 * that it is also the pointer and touch path.
 *
 * Takes its ref as a plain prop (React 19) so `inspector-index.tsx` can
 * return focus to it: L-31's "ArrowUp from the first row returns to the
 * filter" needs the field itself, not a store flag. The field is merged with
 * one of this component's own, because clearing has to put focus back where
 * the user was typing.
 */
export function RegionFilter(props: RegionFilterProps): ReactNode {
  const { ref } = props;
  const filter = useLayoutEditorStore((state) => state.filter);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const fieldRef = useMemo(() => mergeRefs(ref, inputRef), [ref]);
  const host = useLayoutFormHost();
  const copy = FILTER_COPY[host];

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown") {
      const onArrowDown = props.onArrowDown;
      if (onArrowDown === null) return;
      event.preventDefault();
      onArrowDown();
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
    <div className={FIELD_GUTTER[host]}>
      <InputGroup variant="search">
        <InputGroupAddon align="inline-start">
          <Search aria-hidden className="size-3.5" />
        </InputGroupAddon>
        <InputGroupInput
          ref={fieldRef}
          type="text"
          placeholder={copy.placeholder}
          aria-label={copy.label}
          autoComplete="off"
          value={filter}
          onChange={(event) => {
            useLayoutEditorStore.getState().setFilter(event.target.value);
          }}
          onKeyDown={handleKeyDown}
        />
        {filter.length === 0 ? null : (
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              type="button"
              size="icon-xs"
              aria-label="Clear filter"
              onClick={() => {
                useLayoutEditorStore.getState().setFilter("");
                inputRef.current?.focus();
              }}
            >
              <X aria-hidden className="size-3.5" />
            </InputGroupButton>
          </InputGroupAddon>
        )}
      </InputGroup>
    </div>
  );
}
