/**
 * `TooltipWrapper`'s empty-label branch was unguarded: nothing asserted that
 * `label={null | undefined | ""}` renders the child transparently instead of
 * mounting a tooltip, or that props/ref injected by an outer `asChild`
 * trigger (the component's own documented contract - see its docstring)
 * still reach the real interactive element through it.
 */
import { createRef, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";

afterEach(cleanup);

const EMPTY_LABELS: ReadonlyArray<readonly [string, ReactNode]> = [
  ["an empty string", ""],
  ["null", null],
  ["undefined", undefined],
];

describe("TooltipWrapper empty-label pass-through", () => {
  it.each(EMPTY_LABELS)(
    "renders the child with no tooltip-trigger wiring for %s label",
    (_name, label) => {
      render(
        <TooltipWrapper
          label={label}
          side="top"
          sideOffset={undefined}
          align={undefined}
        >
          <button type="button">Target</button>
        </TooltipWrapper>,
      );

      const button = screen.getByRole("button", { name: "Target" });
      fireEvent.focus(button);
      // `data-slot="tooltip-trigger"` is set synchronously by our own
      // TooltipTrigger wrapper on every render, independent of open state -
      // so this catches a tooltip that mounted but has not opened yet, which
      // a bare `queryByRole("tooltip")` check would miss.
      expect(button.getAttribute("data-slot")).not.toBe("tooltip-trigger");
      expect(screen.queryByRole("tooltip")).toBeNull();
    },
  );

  it("keeps the child's own click handler working with no outer trigger", () => {
    const onClick = vi.fn();
    render(
      <TooltipWrapper
        label={null}
        side="top"
        sideOffset={undefined}
        align={undefined}
      >
        <button type="button" onClick={onClick}>
          Target
        </button>
      </TooltipWrapper>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Target" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("composes with an outer asChild trigger: the ref DropdownMenuTrigger injects and the child's own ref resolve to the same button, and both the trigger's open handler and the child's own click handler fire", () => {
    // Exercises the contract the component's own docstring names -
    // `DropdownMenuTrigger asChild` injecting its ref/open-handler onto
    // whatever TooltipWrapper renders. With an empty label this goes through
    // useRender's merge, not the Tooltip stack - this is the central
    // useRender ref contract: an outer-injected ref and the child element's
    // own ref must merge onto one real DOM node, not two separate clones.
    const onClick = vi.fn();
    const outerRef = createRef<HTMLElement>();
    const childRef = createRef<HTMLButtonElement>();

    render(
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <TooltipWrapper
            ref={outerRef}
            label={null}
            side="top"
            sideOffset={undefined}
            align={undefined}
          >
            <button type="button" ref={childRef} onClick={onClick}>
              Menu
            </button>
          </TooltipWrapper>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Item</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    const trigger = screen.getByRole("button", { name: "Menu" });
    expect(outerRef.current).toBe(trigger);
    expect(childRef.current).toBe(trigger);

    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    fireEvent.click(trigger);

    // Both outcomes from the one composed element: the trigger's injected
    // open handler fired (the menu opened) and the child's own handler still
    // fired - composition, not replacement.
    expect(screen.getByRole("menuitem", { name: "Item" })).toBeTruthy();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
