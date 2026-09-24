import {
  useEffect,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import * as Avatar from "@/components/ui/avatar";
import { ButtonGroup } from "@/components/ui/button-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import * as Radio from "@/components/ui/radio-group";
import * as Slider from "@/components/ui/slider";
import * as Tabs from "@/components/ui/tabs";
import * as Collapsible from "@/components/ui/collapsible";
import * as Sidebar from "@/components/ui/sidebar";
import * as Dialog from "@/components/ui/dialog";
import * as Sheet from "@/components/ui/sheet";
import * as Drawer from "@/components/ui/drawer";
import * as Popover from "@/components/ui/popover";
import * as Tooltip from "@/components/ui/tooltip";
import * as Hover from "@/components/ui/hover-card";
import * as Menu from "@/components/ui/dropdown-menu";
import * as Context from "@/components/ui/context-menu";
import * as Menubar from "@/components/ui/menubar";
import * as Select from "@/components/ui/select";
import * as Command from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/sonner";
import { PortalConcealmentProvider } from "@/components/ui/portal-concealment-context";
import { SurfacePresentationBoundary } from "@/components/layout/surface-presentation-boundary";
import { PromotableModalFrame } from "@/components/layout/dialogs/promotable-modal-frame";
import { useSettingsStore } from "@/stores/settings/settings-store";
import "@/lib/theme-applier";
import "@/index.css";

// Only the harness owns these controls: they model host-driven pane changes,
// never replace the pointer/keyboard gestures that open or dismiss primitives.
declare global {
  interface Window {
    primitiveGate: {
      focus: (value: boolean) => void;
      visible: (value: boolean) => void;
      conceal: (value: boolean) => void;
      focusEvents: string[];
      ownerClose: () => void;
      toast: () => void;
    };
  }
}
const params = new URLSearchParams(location.search);
const family = params.get("family") ?? "button";
const state = params.get("state") ?? "default";
const mode = params.get("mode") ?? "visual";
useSettingsStore.setState({
  theme: params.get("theme") === "dark" ? "dark" : "light",
});
const longText =
  "A carefully staged change with a long descriptive label that wraps at the available viewport edge";
const label = state === "long" ? longText : "Project settings";
const trigger = <Button data-gate-trigger>Open settings</Button>;

function MenuCase(props: {
  readonly name: string;
  readonly open: boolean | undefined;
  readonly onOpenChange: ((value: boolean) => void) | undefined;
  readonly onCloseFocus: (() => void) | undefined;
}): ReactNode {
  return (
    <Menu.DropdownMenu open={props.open} onOpenChange={props.onOpenChange}>
      <Menu.DropdownMenuTrigger asChild>
        <Button data-gate-trigger={props.name}>Open menu</Button>
      </Menu.DropdownMenuTrigger>
      <Menu.DropdownMenuContent
        data-gate-popup={props.name}
        onCloseAutoFocus={props.onCloseFocus}
      >
        <Menu.DropdownMenuLabel>Workspace</Menu.DropdownMenuLabel>
        <Menu.DropdownMenuItem
          data-gate-item
          disabled={state === "disabled"}
          variant={
            state === "muted" || state === "destructive" ? state : "default"
          }
        >
          {label}
        </Menu.DropdownMenuItem>
        <Menu.DropdownMenuCheckboxItem
          checked={
            state === "indeterminate" ? "indeterminate" : state === "checked"
          }
        >
          Show details
        </Menu.DropdownMenuCheckboxItem>
        <Menu.DropdownMenuRadioGroup value={state === "radio" ? "one" : "two"}>
          <Menu.DropdownMenuRadioItem value="one">
            First view
          </Menu.DropdownMenuRadioItem>
          <Menu.DropdownMenuRadioItem value="two">
            Second view
          </Menu.DropdownMenuRadioItem>
        </Menu.DropdownMenuRadioGroup>
        <Menu.DropdownMenuSeparator />
        <Menu.DropdownMenuSub>
          <Menu.DropdownMenuSubTrigger data-gate-subtrigger>
            More
          </Menu.DropdownMenuSubTrigger>
          <Menu.DropdownMenuSubContent
            data-gate-subpopup
            layout={state === "submenu-panel" ? "panel" : "menu"}
          >
            <Menu.DropdownMenuItem>Nested action</Menu.DropdownMenuItem>
          </Menu.DropdownMenuSubContent>
        </Menu.DropdownMenuSub>
      </Menu.DropdownMenuContent>
    </Menu.DropdownMenu>
  );
}
function SelectCase(props: {
  readonly name: string;
  readonly open: boolean | undefined;
  readonly onOpenChange: ((value: boolean) => void) | undefined;
  readonly onCloseFocus: (() => void) | undefined;
}): ReactNode {
  return (
    <Select.Select
      open={props.open}
      onOpenChange={props.onOpenChange}
      defaultValue={
        state === "selected" || mode === "conceal" ? "one" : undefined
      }
      disabled={state === "disabled"}
    >
      <Select.SelectTrigger
        data-gate-trigger={props.name}
        size={state === "sm" || state === "xs" ? state : "default"}
      >
        <Select.SelectValue placeholder="Choose a view" />
      </Select.SelectTrigger>
      <Select.SelectContent
        data-gate-popup={props.name}
        onCloseAutoFocus={props.onCloseFocus}
      >
        <Select.SelectGroup>
          <Select.SelectLabel>Views</Select.SelectLabel>
          <Select.SelectItem value="one">First view</Select.SelectItem>
          <Select.SelectItem value="two">{label}</Select.SelectItem>
          <Select.SelectItem value="three" disabled>
            Unavailable
          </Select.SelectItem>
        </Select.SelectGroup>
      </Select.SelectContent>
    </Select.Select>
  );
}
function TooltipCase(): ReactNode {
  return (
    <Tooltip.Tooltip>
      <Tooltip.TooltipTrigger
        render={<Button data-gate-trigger="tooltip">Details</Button>}
      />
      <Tooltip.TooltipContent data-gate-popup="tooltip">
        {label}
      </Tooltip.TooltipContent>
    </Tooltip.Tooltip>
  );
}
interface CaseProps {
  readonly open: boolean;
  readonly changeOpen: (value: boolean) => void;
  readonly body: ReactNode;
  readonly onOpenFocus: () => void;
  readonly onCloseFocus: () => void;
}
const cases: Partial<Record<string, (props: CaseProps) => ReactNode>> = {
  button: (): ReactNode => {
    const variants = [
      "default",
      "outline",
      "card-row",
      "secondary",
      "ghost",
      "muted",
      "muted-outline",
      "destructive-ghost",
      "muted-destructive",
      "warning-ghost",
      "success-ghost",
      "info-ghost",
      "destructive",
      "section-label",
      "link",
    ];
    const variant = (
      variants.includes(state) ? state : "default"
    ) as ComponentProps<typeof Button>["variant"];
    const size = (
      state.startsWith("size-") ? state.slice(5) : "default"
    ) as ComponentProps<typeof Button>["size"];
    return (
      <Button
        data-gate-control
        variant={variant}
        size={size}
        disabled={state === "disabled"}
        aria-pressed={state === "pressed" ? true : undefined}
        aria-checked={state === "mixed" ? "mixed" : undefined}
      >
        {state.includes("icon") ? <Plus /> : label}
      </Button>
    );
  },
  badge: (): ReactNode => {
    const smallSize = state === "size-sm" ? "sm" : "default";
    const variants = [
      "default",
      "secondary",
      "destructive",
      "outline",
      "ghost",
      "link",
      "muted",
      "success",
      "warning",
      "info",
    ];
    return (
      <Badge
        data-gate-control
        tabIndex={0}
        variant={
          (variants.includes(state) ? state : "default") as ComponentProps<
            typeof Badge
          >["variant"]
        }
        size={state === "size-xs" ? "xs" : smallSize}
        aria-disabled={state === "disabled"}
      >
        {label}
      </Badge>
    );
  },
  avatar: (): ReactNode => {
    const avatar = (
      <Avatar.Avatar
        size={state === "sm" || state === "lg" ? state : "default"}
      >
        {state === "image" ? (
          <Avatar.AvatarImage
            alt="Test avatar"
            src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect width='40' height='40' fill='%23556677'/%3E%3Ccircle cx='20' cy='17' r='9' fill='white'/%3E%3C/svg%3E"
          />
        ) : null}
        <Avatar.AvatarFallback>AB</Avatar.AvatarFallback>
        <Avatar.AvatarBadge />
      </Avatar.Avatar>
    );
    return state === "group" ? (
      <Avatar.AvatarGroup>
        {avatar}
        <Avatar.Avatar>
          <Avatar.AvatarFallback>CD</Avatar.AvatarFallback>
        </Avatar.Avatar>
        <Avatar.AvatarGroupCount>+2</Avatar.AvatarGroupCount>
      </Avatar.AvatarGroup>
    ) : (
      avatar
    );
  },
  "button-group": (): ReactNode => {
    return (
      <ButtonGroup
        orientation={state === "vertical" ? "vertical" : "horizontal"}
      >
        <Button>Previous</Button>
        {state === "select" ? (
          <SelectCase
            name="select"
            open={undefined}
            onOpenChange={undefined}
            onCloseFocus={undefined}
          />
        ) : (
          <Button>Next</Button>
        )}
      </ButtonGroup>
    );
  },
  separator: (): ReactNode => {
    return (
      <div className="flex h-20 w-full items-center gap-4">
        Before
        <Separator
          orientation={state === "vertical" ? "vertical" : "horizontal"}
        />
        After
      </div>
    );
  },
  label: (): ReactNode => {
    return (
      <div className="flex items-center gap-2">
        <Checkbox id="label-control" disabled={state === "disabled"} />
        <Label htmlFor="label-control">Show details</Label>
      </div>
    );
  },
  checkbox: (): ReactNode => {
    return (
      <Checkbox
        data-gate-control
        aria-label="Show details"
        defaultChecked={state === "checked"}
        indeterminate={state === "indeterminate"}
        disabled={state === "disabled"}
      />
    );
  },
  switch: (): ReactNode => {
    return (
      <Switch
        data-gate-control
        aria-label="Show details"
        defaultChecked={state === "checked"}
        disabled={state === "disabled"}
      />
    );
  },
  radio: (): ReactNode => {
    return (
      <Radio.RadioGroup
        defaultValue={state === "checked" ? "one" : "two"}
        disabled={state === "disabled"}
      >
        <Radio.RadioGroupItem
          data-gate-control
          value="one"
          aria-label="First view"
        />
        <Radio.RadioGroupItem value="two" aria-label="Second view" />
      </Radio.RadioGroup>
    );
  },
  slider: (): ReactNode => {
    return (
      <Slider.Slider defaultValue={40} disabled={state === "disabled"}>
        <Slider.SliderTrack size={state === "pill" ? "pill" : "default"}>
          <Slider.SliderRange />
        </Slider.SliderTrack>
        <Slider.SliderThumb
          data-gate-control
          size={state === "pill" ? "pill" : "default"}
          aria-label="Volume"
        />
      </Slider.Slider>
    );
  },
  tabs: (): ReactNode => {
    const scope = state.startsWith("scope");
    const variant = state.startsWith("line") ? "line" : "default";
    const size = state.includes("sm") ? "sm" : "default";
    const index = scope ? Number(state.slice(-1)) : 0;
    return (
      <Tabs.Tabs
        defaultValue={String(index)}
        orientation={state === "vertical" ? "vertical" : "horizontal"}
      >
        <Tabs.TabsList
          variant={scope ? "scope" : variant}
          size={scope ? "scope" : size}
          indicatorIndex={index}
        >
          {["All", "Current task", "Current workspace"].map((text, i) => (
            <Tabs.TabsTrigger
              key={text}
              data-gate-control={i === 0 ? "true" : undefined}
              value={String(i)}
              variant={scope ? "scope" : undefined}
              disabled={state === "disabled" && i === 1}
            >
              {text}
            </Tabs.TabsTrigger>
          ))}
        </Tabs.TabsList>
        {[0, 1, 2].map((i) => (
          <Tabs.TabsContent key={i} value={String(i)}>
            View {i + 1}
          </Tabs.TabsContent>
        ))}
      </Tabs.Tabs>
    );
  },
  collapsible: (): ReactNode => {
    const variant = state.startsWith("panel") ? "panel" : "default";
    const rootVariant = state.startsWith("card") ? "card" : variant;
    return (
      <Collapsible.Collapsible
        defaultOpen={state.endsWith("open")}
        variant={rootVariant}
      >
        <Collapsible.CollapsibleTrigger
          data-gate-control
          variant={state === "quiet" ? "quiet" : variant}
        >
          Show details
        </Collapsible.CollapsibleTrigger>
        <Collapsible.CollapsibleContent>
          Changes staged in the current workspace.
        </Collapsible.CollapsibleContent>
      </Collapsible.Collapsible>
    );
  },
  sidebar: (): ReactNode => {
    return (
      <Sidebar.SidebarProvider defaultOpen={state !== "rail"}>
        <Sidebar.Sidebar collapsible="icon">
          <Sidebar.SidebarContent>
            <Sidebar.SidebarGroup>
              <Sidebar.SidebarMenu>
                {state === "skeleton" ? (
                  <Sidebar.SidebarMenuSkeleton showIcon />
                ) : (
                  <Sidebar.SidebarMenuItem>
                    <Sidebar.SidebarMenuButton tooltip="Workspace">
                      <Plus />
                      <span>Workspace</span>
                    </Sidebar.SidebarMenuButton>
                  </Sidebar.SidebarMenuItem>
                )}
              </Sidebar.SidebarMenu>
            </Sidebar.SidebarGroup>
          </Sidebar.SidebarContent>
        </Sidebar.Sidebar>
        <Sidebar.SidebarTrigger data-gate-trigger="sidebar" />
      </Sidebar.SidebarProvider>
    );
  },
  dialog: ({
    open,
    changeOpen,
    body,
    onOpenFocus,
    onCloseFocus,
  }): ReactNode => {
    let nested: ReactNode = null;
    if (family === "nested" || mode === "nested") {
      if (["select", "select-in-dialog"].includes(state))
        nested = (
          <SelectCase
            name="nested"
            open={undefined}
            onOpenChange={undefined}
            onCloseFocus={undefined}
          />
        );
      else if (state === "tooltip") nested = <TooltipCase />;
      else
        nested = (
          <MenuCase
            name="nested"
            open={undefined}
            onOpenChange={undefined}
            onCloseFocus={undefined}
          />
        );
    }
    const titleSize = state === "title-lg" ? "lg" : "default";
    return (
      <Dialog.Dialog
        open={open}
        onOpenChange={changeOpen}
        modal={state !== "nonmodal"}
      >
        <Dialog.DialogTrigger asChild>{trigger}</Dialog.DialogTrigger>
        {family === "frame" || state === "menu-in-frame" ? (
          <PromotableModalFrame
            title="Workspace settings"
            icon={<Plus />}
            contentClassName="w-full max-w-[min(90vw,40rem)]"
            dataAttributes={{ "data-gate-popup": "outer" }}
            promoteAriaLabel="Open as tab"
            promoteTestId="promote"
            closeTestId="close"
            onPromote={() => undefined}
            onClose={() => changeOpen(false)}
            onEscapeKeyDown={() => undefined}
            onOpenAutoFocus={undefined}
          >
            <div className="flex w-full flex-col">
              {body}
              {nested}
            </div>
          </PromotableModalFrame>
        ) : (
          <Dialog.DialogContent
            data-gate-popup="outer"
            layout={state === "banded" ? "banded" : "padded"}
            onOpenAutoFocus={onOpenFocus}
            onCloseAutoFocus={onCloseFocus}
          >
            <Dialog.DialogHeader>
              <Dialog.DialogTitle
                size={state === "title-sm" ? "sm" : titleSize}
              >
                Workspace settings
              </Dialog.DialogTitle>
              <Dialog.DialogDescription>{label}</Dialog.DialogDescription>
            </Dialog.DialogHeader>
            {body}
            {nested}
            <Dialog.DialogFooter>
              <Button onClick={() => changeOpen(false)}>Done</Button>
            </Dialog.DialogFooter>
          </Dialog.DialogContent>
        )}
      </Dialog.Dialog>
    );
  },
  sheet: ({ open, changeOpen, body }): ReactNode => {
    return (
      <Sheet.Sheet open={open} onOpenChange={changeOpen}>
        <Sheet.SheetTrigger asChild>{trigger}</Sheet.SheetTrigger>
        <Sheet.SheetContent
          data-gate-popup="outer"
          side={
            state === "left" || state === "top" || state === "bottom"
              ? state
              : "right"
          }
        >
          <Sheet.SheetHeader>
            <Sheet.SheetTitle>Workspace settings</Sheet.SheetTitle>
            <Sheet.SheetDescription>{label}</Sheet.SheetDescription>
          </Sheet.SheetHeader>
          {body}
          {family === "nested" ? (
            <Popover.Popover>
              <Popover.PopoverTrigger asChild>
                <Button data-gate-trigger="nested">More</Button>
              </Popover.PopoverTrigger>
              <Popover.PopoverContent data-gate-popup="nested">
                Nested settings
              </Popover.PopoverContent>
            </Popover.Popover>
          ) : null}
        </Sheet.SheetContent>
      </Sheet.Sheet>
    );
  },
  drawer: ({ open, changeOpen, body }): ReactNode => {
    return (
      <Drawer.Drawer open={open} onOpenChange={changeOpen} direction="bottom">
        <Drawer.DrawerTrigger asChild>{trigger}</Drawer.DrawerTrigger>
        <Drawer.DrawerContent data-gate-popup="outer" className="max-h-[85dvh]">
          <Drawer.DrawerHeader>
            <Drawer.DrawerTitle>Workspace settings</Drawer.DrawerTitle>
            <Drawer.DrawerDescription>{label}</Drawer.DrawerDescription>
          </Drawer.DrawerHeader>
          <div className="overflow-auto pb-safe-bottom">
            {body}
            {state === "long" ? (
              <div data-vaul-no-drag className="max-h-[40dvh] overflow-auto">
                {Array.from({ length: 20 }, (_, i) => (
                  <p key={i}>File {i + 1}: staged changes</p>
                ))}
              </div>
            ) : null}
          </div>
        </Drawer.DrawerContent>
      </Drawer.Drawer>
    );
  },
  popover: ({
    open,
    changeOpen,
    body,
    onOpenFocus,
    onCloseFocus,
  }): ReactNode => {
    return (
      <Popover.Popover open={open} onOpenChange={changeOpen}>
        <Popover.PopoverTrigger asChild>{trigger}</Popover.PopoverTrigger>
        <Popover.PopoverContent
          data-gate-popup="outer"
          layout={state === "bare" || state === "panel" ? state : "padded"}
          onOpenAutoFocus={onOpenFocus}
          onCloseAutoFocus={onCloseFocus}
        >
          {label}
          {body}
          {family === "nested" ? <TooltipCase /> : null}
        </Popover.PopoverContent>
      </Popover.Popover>
    );
  },
  tooltip: (): ReactNode => {
    return <TooltipCase />;
  },
  "hover-card": (): ReactNode => {
    return (
      <Hover.HoverCard>
        <Hover.HoverCardTrigger
          render={<Button data-gate-trigger="hover">Preview</Button>}
        />
        <Hover.HoverCardContent
          data-gate-popup="hover"
          appearance={state === "tooltip" ? "tooltip" : "preview"}
        >
          {label}
        </Hover.HoverCardContent>
      </Hover.HoverCard>
    );
  },
  "dropdown-menu": ({ open, changeOpen, onCloseFocus }): ReactNode => {
    return (
      <MenuCase
        name="outer"
        open={open}
        onOpenChange={changeOpen}
        onCloseFocus={onCloseFocus}
      />
    );
  },
  "context-menu": (): ReactNode => {
    return (
      <Context.ContextMenu>
        <Context.ContextMenuTrigger data-gate-trigger="context">
          <Button>Right-click for actions</Button>
        </Context.ContextMenuTrigger>
        <Context.ContextMenuContent data-gate-popup="outer">
          <Context.ContextMenuItem
            variant={state === "destructive" ? "destructive" : "default"}
            disabled={state === "disabled"}
          >
            {label}
          </Context.ContextMenuItem>
          <Context.ContextMenuCheckboxItem checked={state === "checked"}>
            Show details
          </Context.ContextMenuCheckboxItem>
          <Context.ContextMenuSub>
            <Context.ContextMenuSubTrigger data-gate-subtrigger>
              More
            </Context.ContextMenuSubTrigger>
            <Context.ContextMenuSubContent
              data-gate-subpopup
              layout={state === "submenu-panel" ? "panel" : "menu"}
            >
              <Context.ContextMenuItem>Nested action</Context.ContextMenuItem>
            </Context.ContextMenuSubContent>
          </Context.ContextMenuSub>
        </Context.ContextMenuContent>
      </Context.ContextMenu>
    );
  },
  menubar: (): ReactNode => {
    return (
      <Menubar.Menubar>
        <Menubar.MenubarMenu>
          <Menubar.MenubarTrigger data-gate-trigger>
            Workspace
          </Menubar.MenubarTrigger>
          <Menubar.MenubarContent data-gate-popup="outer">
            <Menubar.MenubarItem disabled={state === "disabled"}>
              {label}
            </Menubar.MenubarItem>
            <Menubar.MenubarSub>
              <Menubar.MenubarSubTrigger data-gate-subtrigger>
                More
              </Menubar.MenubarSubTrigger>
              <Menubar.MenubarSubContent data-gate-subpopup>
                <Menubar.MenubarItem>Nested action</Menubar.MenubarItem>
              </Menubar.MenubarSubContent>
            </Menubar.MenubarSub>
          </Menubar.MenubarContent>
        </Menubar.MenubarMenu>
      </Menubar.Menubar>
    );
  },
  select: ({ open, changeOpen, onCloseFocus }): ReactNode => {
    return (
      <SelectCase
        name="outer"
        open={mode === "conceal" && state === "uncontrolled" ? undefined : open}
        onOpenChange={changeOpen}
        onCloseFocus={onCloseFocus}
      />
    );
  },
  command: (): ReactNode => {
    return (
      <Command.Command
        variant={state === "embedded" ? "embedded" : "standalone"}
        selection={state === "flat" ? "flat" : "lifted"}
      >
        <Command.CommandInput
          placeholder="Search actions"
          value={state === "empty" ? "zzzz" : undefined}
        />
        <Command.CommandList>
          <Command.CommandEmpty>No results</Command.CommandEmpty>
          <Command.CommandGroup heading="Workspace">
            <Command.CommandItem
              value="settings"
              disabled={state === "disabled"}
              data-checked={state === "checked"}
            >
              Settings
            </Command.CommandItem>
            <Command.CommandItem value="files">Files</Command.CommandItem>
          </Command.CommandGroup>
        </Command.CommandList>
      </Command.Command>
    );
  },
};
export function Fixture(): ReactNode {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(true);
  const [visible, setVisible] = useState(true);
  const [concealed, setConcealed] = useState(false);
  const [draft, setDraft] = useState("Staged value");
  const [changes, setChanges] = useState(0);
  const [actions, setActions] = useState(0);
  const [closeFocus, setCloseFocus] = useState(0);
  const [openFocus, setOpenFocus] = useState(0);
  const changeOpen = (value: boolean): void => {
    setOpen(value);
    setChanges((count) => count + 1);
  };
  useEffect(() => {
    const showToast = (): void => {
      toast(
        <Button
          data-gate-toast-action
          onClick={() => setActions((count) => count + 1)}
        >
          Apply update
        </Button>,
        { id: "gate-toast", duration: Infinity, description: null },
      );
    };
    const focusEvents: string[] = [];
    const recordFocus = (event: FocusEvent): void => {
      const target = event.target;
      if (target instanceof Element)
        focusEvents.push(target.matches("[data-gate-outside]") ? "B" : "A");
    };
    document.addEventListener("focusin", recordFocus);
    const transfer = (commit: () => void): void => {
      focusEvents.length = 0;
      // One host switch transaction. Record the commit and every later focus
      // event; never repair focus after waiting for library cleanup.
      flushSync(commit);
      document.querySelector<HTMLElement>("[data-gate-outside]")?.focus();
    };
    window.primitiveGate = {
      focus: (value) =>
        value ? setFocused(true) : transfer(() => setFocused(false)),
      visible: (value) =>
        value ? setVisible(true) : transfer(() => setVisible(false)),
      conceal: setConcealed,
      focusEvents,
      ownerClose: () => setOpen(false),
      toast: showToast,
    };
    return () => document.removeEventListener("focusin", recordFocus);
  }, []);
  const input = (
    <Input
      data-gate-input
      aria-label="Staged value"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
    />
  );
  const body = (
    <div className="flex min-w-0 flex-col gap-3 p-4">
      {input}
      <Button data-gate-body>Ordinary dialog control</Button>
    </div>
  );
  const nestedFamilies: Record<string, string> = {
    "menu-in-dialog": "dialog",
    "select-in-dialog": "dialog",
    "menu-in-frame": "dialog",
    "popover-in-sheet": "sheet",
    "tooltip-in-popover": "popover",
  };
  let caseFamily = family;
  if (family === "frame") caseFamily = "dialog";
  if (family === "nested") caseFamily = nestedFamilies[state];
  const render = cases[caseFamily];
  if (!render) throw new Error("Unknown gate family: " + family);
  const content = render({
    open,
    changeOpen,
    body,
    onOpenFocus: () => setOpenFocus((count) => count + 1),
    onCloseFocus: () => setCloseFocus((count) => count + 1),
  });
  if (content === undefined || content === null)
    throw new Error("Empty gate case: " + family + "/" + state);
  return (
    <Tooltip.TooltipProvider>
      <div
        data-gate-state
        data-open={String(open)}
        data-focused={String(focused)}
        data-visible={String(visible)}
        data-concealed={String(concealed)}
        data-changes={changes}
        data-actions={actions}
        data-draft={draft}
        data-open-focus={openFocus}
        data-close-focus={closeFocus}
      />
      <SurfacePresentationBoundary visible={visible} focused={focused}>
        <PortalConcealmentProvider value={concealed}>
          <main
            data-gate-stage={state === "edge" ? "edge" : "center"}
            hidden={!visible}
          >
            <div data-gate-inline>
              {mode === "conceal" ? (
                <Input
                  data-gate-owner-input
                  aria-label="Owner draft"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                />
              ) : null}
              {content}
            </div>
          </main>
        </PortalConcealmentProvider>
      </SurfacePresentationBoundary>
      <Button data-gate-outside>Ordinary outside control</Button>
      <div data-gate-scroll className="h-20 overflow-auto">
        <div className="h-[200vh]">Pane B scroll area</div>
      </div>
      {mode === "conceal" ? (
        <div className="h-[200vh]" data-gate-document-space />
      ) : null}
      {mode === "toast" ? <Toaster /> : null}
    </Tooltip.TooltipProvider>
  );
}
const root = document.getElementById("root");
if (root === null) throw new Error("Gate root missing");
createRoot(root).render(<Fixture />);
