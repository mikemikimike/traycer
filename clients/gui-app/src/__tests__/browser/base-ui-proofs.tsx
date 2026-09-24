// Temporary T02 proof lane — removed by T03. Positive cases move to the real-component T01 gate.
import {
  Activity,
  useState,
  useEffect,
  useCallback,
  useId,
  useRef,
  useLayoutEffect,
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { Autocomplete } from "@base-ui/react/autocomplete";
import { Dialog } from "@base-ui/react/dialog";
import { Popover } from "@base-ui/react/popover";
import { Menu } from "@base-ui/react/menu";
import { ContextMenu } from "@base-ui/react/context-menu";
import { Tooltip } from "@base-ui/react/tooltip";
import { Select } from "@base-ui/react/select";
import { commandScore } from "@/lib/command-score";

const params = new URLSearchParams(location.search);
const mode = params.get("mode") ?? "command";
const family = params.get("family") ?? "dialog";
type Row = { id: string; label: string; disabled: boolean; group: string };
const rows: Row[] = [
  { id: "tree", label: "Parent", disabled: false, group: "tree" },
  { id: "disabled", label: "Disabled", disabled: true, group: "tree" },
  ...Array.from({ length: 12 }, (_, index) => ({
    id: `r${index}`,
    label: index < 2 ? "Duplicate" : `Project ${index}`,
    disabled: false,
    group: "projects",
  })),
  { id: "exact", label: "Project", disabled: false, group: "best" },
];
const child: Row = {
  id: "child",
  label: "Child",
  disabled: false,
  group: "tree",
};
function commandPageSize(list: HTMLElement | null): number {
  const row = list?.querySelector<HTMLElement>("[role=option]");
  return Math.max(
    1,
    Math.floor((list?.clientHeight ?? 0) / (row?.offsetHeight || 36)) - 1,
  );
}
function CommandProof({ name }: { readonly name: string }): ReactNode {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState("");
  const [selected, setSelected] = useState("");
  const [expanded, setExpanded] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const source = expanded ? [rows[0], child, ...rows.slice(1)] : rows;
  const noFilter = params.get("filter") === "false";
  const scored = source
    .map((row) => ({
      row,
      score: query && !noFilter ? commandScore(row.label, query, []) : 1,
    }))
    .filter((item) => item.score > 0);
  const groups = [...new Set(source.map((row) => row.group))]
    .map((group) => ({
      label: group,
      items: scored
        .filter((item) => item.row.group === group)
        .sort((a, b) => b.score - a.score)
        .map((item) => item.row),
      score: Math.max(
        ...scored
          .filter((item) => item.row.group === group)
          .map((item) => item.score),
      ),
    }))
    .filter((group) => group.items.length > 0)
    .sort((a, b) => b.score - a.score);
  return (
    <section
      className="palette"
      data-palette={name}
      data-active={active}
      data-query={query}
      data-selected={selected}
      data-expanded={expanded}
    >
      <Autocomplete.Root
        inline
        open
        autoHighlight="always"
        keepHighlight
        items={groups}
        filteredItems={groups}
        value={query}
        onValueChange={setQuery}
        onItemHighlighted={(row: Row | undefined) => setActive(row?.id ?? "")}
        itemToStringValue={(row: Row) => row.label}
      >
        <Autocomplete.Input
          aria-label={name}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight" && active === "tree") {
              event.preventDefault();
              setExpanded(true);
            }
            if (event.key === "ArrowLeft" && active === "tree") {
              event.preventDefault();
              setExpanded(false);
            }
            if (event.key !== "PageDown" && event.key !== "PageUp") return;
            event.preventDefault();
            const el = list.current;
            if (!el) return;
            const items = [
              ...el.querySelectorAll<HTMLElement>(
                "[role=option]:not([aria-disabled=true])",
              ),
            ];
            const index = items.findIndex((item) =>
              item.hasAttribute("data-highlighted"),
            );
            const pageSize = commandPageSize(el);
            if (items.length === 0) return;
            const target =
              items[
                Math.max(
                  0,
                  Math.min(
                    items.length - 1,
                    index + (event.key === "PageDown" ? pageSize : -pageSize),
                  ),
                )
              ];
            target.dispatchEvent(
              new PointerEvent("pointermove", {
                bubbles: true,
                pointerType: "mouse",
              }),
            );
            target.dispatchEvent(
              new MouseEvent("mousemove", { bubbles: true }),
            );
            target.scrollIntoView({ block: "nearest" });
          }}
        />
        <Autocomplete.List ref={list} className="list">
          {(group: { label: string; items: Row[] }) => (
            <Autocomplete.Group
              key={group.label}
              items={group.items}
              data-group={group.label}
            >
              <Autocomplete.GroupLabel>{group.label}</Autocomplete.GroupLabel>
              <Autocomplete.Collection>
                {(row: Row) => (
                  <Autocomplete.Item
                    key={row.id}
                    value={row}
                    disabled={row.disabled}
                    data-row={row.id}
                    onClick={() => setSelected(row.id)}
                  >
                    {row.label}
                  </Autocomplete.Item>
                )}
              </Autocomplete.Collection>
            </Autocomplete.Group>
          )}
        </Autocomplete.List>
        <Autocomplete.Empty>No matches</Autocomplete.Empty>
      </Autocomplete.Root>
    </section>
  );
}

function CommandBProof({ name }: { readonly name: string }): ReactNode {
  const id = useId();
  const composition = useRef({ active: false, endedAt: -Infinity });
  const [query, setQuery] = useState("");
  const [active, setActive] = useState("tree");
  const [selected, setSelected] = useState("");
  const [expanded, setExpanded] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const source = expanded ? [rows[0], child, ...rows.slice(1)] : rows;
  const noFilter = params.get("filter") === "false";
  const scored = source
    .map((row) => ({
      row,
      score: query && !noFilter ? commandScore(row.label, query, []) : 1,
    }))
    .filter((item) => item.score > 0);
  const groups = [...new Set(source.map((row) => row.group))]
    .map((group) => ({
      label: group,
      items: scored
        .filter((item) => item.row.group === group)
        .sort((a, b) => b.score - a.score)
        .map((item) => item.row),
      score: Math.max(
        ...scored
          .filter((item) => item.row.group === group)
          .map((item) => item.score),
      ),
    }))
    .filter((group) => group.items.length > 0)
    .sort((a, b) => b.score - a.score);
  const visible = groups.flatMap((group) => group.items);
  const enabled = visible.filter((row) => !row.disabled);
  const [previousQuery, setPreviousQuery] = useState(query);
  if (previousQuery !== query) {
    setPreviousQuery(query);
    setActive(enabled[0]?.id ?? "");
  } else if (active && !enabled.some((row) => row.id === active))
    setActive(enabled[0]?.id ?? "");
  useLayoutEffect(() => {
    window.baseProof.highlight[name] = setActive;
    return () => {
      delete window.baseProof.highlight[name];
    };
  }, [name]);
  return (
    <section
      className="palette"
      data-palette={name}
      data-active={active}
      data-query={query}
      data-selected={selected}
      data-expanded={expanded}
    >
      <input
        aria-label={name}
        role="combobox"
        aria-expanded="true"
        aria-autocomplete="list"
        aria-controls={id + "-list"}
        aria-activedescendant={active ? id + "-" + active : undefined}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onCompositionStart={() => {
          composition.current.active = true;
        }}
        onCompositionEnd={(event) => {
          composition.current = { active: false, endedAt: event.timeStamp };
        }}
        onKeyDown={(event) => {
          // Composition can end just before its confirming Enter; allow a 50ms grace period.
          if (
            event.nativeEvent.isComposing ||
            composition.current.active ||
            (event.key === "Enter" &&
              event.timeStamp - composition.current.endedAt < 50)
          )
            return;
          if (event.key === "Enter") {
            event.preventDefault();
            if (enabled.some((row) => row.id === active)) setSelected(active);
            return;
          }
          if (
            active === "tree" &&
            (event.key === "ArrowRight" || event.key === "ArrowLeft")
          ) {
            event.preventDefault();
            setExpanded(event.key === "ArrowRight");
            return;
          }
          if (
            ![
              "ArrowDown",
              "ArrowUp",
              "Home",
              "End",
              "PageDown",
              "PageUp",
            ].includes(event.key)
          )
            return;
          event.preventDefault();
          const index = enabled.findIndex((row) => row.id === active);
          const pageSize = commandPageSize(list.current);
          if (enabled.length === 0) return;
          const deltas: Record<string, number> = {
            ArrowDown: 1,
            ArrowUp: -1,
            PageDown: pageSize,
            PageUp: -pageSize,
          };
          let next = Math.max(
            0,
            Math.min(enabled.length - 1, index + deltas[event.key]),
          );
          if (event.key === "Home") next = 0;
          if (event.key === "End") next = enabled.length - 1;
          const target = enabled[next];
          setActive(target.id);
          document
            .getElementById(id + "-" + target.id)
            ?.scrollIntoView({ block: "nearest" });
        }}
      />
      <div
        role="listbox"
        aria-label={name}
        id={id + "-list"}
        ref={list}
        className="list"
      >
        {groups.map((group) => (
          <div
            role="group"
            aria-label={group.label}
            key={group.label}
            data-group={group.label}
          >
            <div>{group.label}</div>
            {group.items.map((row) => (
              <div
                role="option"
                tabIndex={-1}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !row.disabled)
                    setSelected(row.id);
                }}
                aria-selected={row.id === active}
                aria-disabled={row.disabled}
                key={row.id}
                id={id + "-" + row.id}
                data-row={row.id}
                data-highlighted={row.id === active ? "" : undefined}
                onMouseMove={() => {
                  if (!row.disabled) setActive(row.id);
                }}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  if (!row.disabled) setSelected(row.id);
                }}
              >
                {row.label}
              </div>
            ))}
          </div>
        ))}
      </div>
      {visible.length === 0 ? <div role="status">No matches</div> : null}
    </section>
  );
}

function RetainedDraft(): ReactNode {
  const [value, setValue] = useState("");
  return (
    <label data-retained-draft data-value={value}>
      Retained owner draft
      <input
        aria-label="Retained owner draft"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
    </label>
  );
}

type PresentationCloseDetails = {
  reason: "presentation-loss";
  cause: "concealment" | "pane-blur";
  event: Event;
};
type OwnerChangeDetails =
  | Dialog.Root.ChangeEventDetails
  | Popover.Root.ChangeEventDetails
  | Menu.Root.ChangeEventDetails
  | ContextMenu.Root.ChangeEventDetails
  | Select.Root.ChangeEventDetails
  | PresentationCloseDetails;
type HostPresentation = {
  present: boolean;
  generation: number;
  readProbe: () => HTMLDivElement | null;
  closed: (generation: number) => void;
  claimFocus: () => void;
};
const HostPresentationContext = createContext<HostPresentation | null>(null);
function LifecycleHostBoundary(): ReactNode {
  const [presentation, setPresentation] = useState({
    present: true,
    focused: true,
    generation: 0,
  });
  const [closedGeneration, setClosedGeneration] = useState(-1);
  const probe = useRef<HTMLDivElement>(null);
  const readProbe = useCallback(() => probe.current, []);
  const closed = useCallback((generation: number): void => {
    window.baseProof.events.push(`boundary:closed:${generation}`);
    setClosedGeneration(generation);
  }, []);
  const claimFocus = useCallback(
    () =>
      setPresentation((current) =>
        current.present && !current.focused
          ? { ...current, focused: true }
          : current,
      ),
    [],
  );
  const hidden =
    params.get("loss") === "activity" &&
    !presentation.present &&
    closedGeneration === presentation.generation;
  useLayoutEffect(() => {
    window.baseProof.present = (next: boolean) =>
      flushSync(() =>
        setPresentation((current) =>
          current.present === next
            ? current
            : {
                present: next,
                focused: false,
                generation: current.generation + 1,
              },
        ),
      );
    window.baseProof.returnFocused = () =>
      flushSync(() =>
        setPresentation((current) => ({
          present: true,
          focused: true,
          generation: current.generation + 1,
        })),
      );
  }, []);
  useLayoutEffect(() => {
    window.baseProof.events.push(
      `boundary:commit:${presentation.generation}:${presentation.present}:${hidden}`,
    );
  }, [presentation.generation, presentation.present, hidden]);
  return (
    <main>
      <div
        ref={probe}
        data-host-probe
        data-generation={presentation.generation}
        data-present={presentation.present}
        data-focused={presentation.focused}
        data-hidden={hidden}
      />
      <Activity mode={hidden ? "hidden" : "visible"}>
        <HostPresentationContext.Provider
          value={{
            present: presentation.present,
            generation: presentation.generation,
            readProbe,
            closed,
            claimFocus,
          }}
        >
          <LifecycleOwner />
        </HostPresentationContext.Provider>
      </Activity>
      <button type="button" data-outside>
        Pane B
      </button>
      <div style={{ height: "200vh" }}>Scrollable document</div>
    </main>
  );
}
function LifecycleOwner(): ReactNode {
  const [open, setOpen] = useState(false);
  useLayoutEffect(() => {
    window.baseProof.events.push("owner:connect");
    window.baseProof.close = () => flushSync(() => setOpen(false));
    return () => {
      window.baseProof.events.push("owner:disconnect");
    };
  }, []);
  useEffect(() => {
    window.baseProof.events.push("owner-passive:connect");
    return () => {
      window.baseProof.events.push("owner-passive:disconnect");
    };
  }, []);
  return (
    <LifecycleProof
      ownedOpen={params.get("controlled") === "false" ? undefined : open}
      onOwnerChange={(next, details) => {
        setOpen(next);
        window.baseProof.events.push(
          `owner:${next}:${details.reason}:${details.reason === "presentation-loss" ? details.cause : details.event.type}`,
        );
      }}
    />
  );
}

type Cycle = {
  token: number;
  open: boolean;
  logical: boolean;
  presentationOnly: boolean;
  focusSuppressed: boolean;
  resumed: boolean;
};
// eslint-disable-next-line complexity -- This temporary fixture enumerates four distinct primitive APIs and policies.
function LifecycleProof({
  ownedOpen,
  onOwnerChange,
}: {
  readonly ownedOpen: boolean | undefined;
  readonly onOwnerChange: (next: boolean, details: OwnerChangeDetails) => void;
}): ReactNode {
  const [internalOpen, setInternalOpen] = useState(false);
  const logical = ownedOpen ?? internalOpen;
  const host = useContext(HostPresentationContext);
  if (!host) throw new Error("Missing host presentation boundary");
  const { present, generation, readProbe, closed, claimFocus } = host;
  const [draft, setDraft] = useState("staged");
  const [changes, setChanges] = useState(0);
  const [completes, setCompletes] = useState(0);
  const [initials, setInitials] = useState(0);
  const [finals, setFinals] = useState(0);
  const [baseCompletes, setBaseCompletes] = useState(0);
  const [baseFinals, setBaseFinals] = useState(0);
  const [cycle, setCycle] = useState<Cycle>({
    token: 0,
    open: false,
    logical: false,
    presentationOnly: false,
    focusSuppressed: false,
    resumed: false,
  });
  const open = logical && present;
  const selectBlur = family === "select" && params.get("loss") === "blur";
  const concealed = !present && !selectBlur;
  const genuineClose = ["menu", "context-menu", "select"].includes(family);
  const menuActions = useRef<Menu.Root.Actions>(null);
  const selectActions = useRef<Select.Root.Actions>(null);
  const unmountedCycle = useRef(-1);
  const completedCycle = useRef<string | null>(null);
  const [actions, setActions] = useState(0);
  const [value, setValue] = useState<string | null>(
    params.get("value") === "none" ? null : "one",
  );
  const setLogical = useCallback(
    (next: boolean): void => {
      setInternalOpen(next);
      onOwnerChange(next, {
        reason: "presentation-loss",
        cause: params.get("loss") === "blur" ? "pane-blur" : "concealment",
        event: new Event("traycer:overlay-presentation-loss"),
      });
    },
    [onOwnerChange],
  );
  if (cycle.open !== open || cycle.logical !== logical)
    setCycle({
      token: cycle.token + (cycle.open !== open || !genuineClose ? 1 : 0),
      open,
      logical,
      presentationOnly: !present && !genuineClose,
      focusSuppressed: !present,
      resumed: open && cycle.logical,
    });
  const committedCycle = useRef(cycle.token);
  useLayoutEffect(() => {
    committedCycle.current = cycle.token;
  }, [cycle.token]);
  useLayoutEffect(() => {
    window.baseProof.events.push("wrapper:connect");
    return () => {
      window.baseProof.events.push("wrapper:disconnect");
    };
  }, []);
  useEffect(() => {
    window.baseProof.events.push("wrapper-passive:connect");
    return () => {
      window.baseProof.events.push("wrapper-passive:disconnect");
    };
  }, []);
  const change = (
    next: boolean,
    details:
      | Dialog.Root.ChangeEventDetails
      | Popover.Root.ChangeEventDetails
      | Menu.Root.ChangeEventDetails
      | ContextMenu.Root.ChangeEventDetails
      | Select.Root.ChangeEventDetails,
  ): void => {
    window.baseProof.events.push(`change:${next}:${details.reason}:${present}`);
    if (!present) {
      details.cancel();
      return;
    }
    setChanges((count) => count + 1);
    setInternalOpen(next);
    onOwnerChange(next, details);
  };
  const complete = (next: boolean): void => {
    setBaseCompletes((count) => count + 1);
    const completion = `${cycle.token}:${next}`;
    if (
      cycle.token === committedCycle.current &&
      !cycle.presentationOnly &&
      !cycle.resumed &&
      completedCycle.current !== completion
    ) {
      completedCycle.current = completion;
      setCompletes((count) => count + 1);
    }
    window.baseProof.events.push(
      `complete:${next}:${cycle.token}:${cycle.presentationOnly}`,
    );
  };
  const finalFocus = (): boolean => {
    setBaseFinals((count) => count + 1);
    const probe = readProbe();
    const allowed =
      probe?.isConnected === true &&
      !cycle.open &&
      generation === Number(probe.dataset.generation) &&
      cycle.token === committedCycle.current &&
      !cycle.focusSuppressed &&
      probe.dataset.present === "true" &&
      probe.dataset.focused === "true";
    if (allowed) setFinals((count) => count + 1);
    window.baseProof.events.push(
      `final:${cycle.token}:${allowed}:generation:${generation}:${probe?.dataset.generation}:committed:${committedCycle.current}`,
    );
    return allowed;
  };
  const initialFocus = (): boolean => {
    const probe = readProbe();
    if (
      !present ||
      probe?.dataset.present !== "true" ||
      probe.dataset.focused !== "true"
    )
      return false;
    setInitials((count) => count + 1);
    return true;
  };
  const previousPresent = useRef(present);
  useLayoutEffect(() => {
    if (previousPresent.current === present) return;
    previousPresent.current = present;
    if (!present && genuineClose && logical) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Notify a controlled owner only after the concealment commit, never during child render.
      setChanges((count) => count + 1);
      setLogical(false);
    }
  }, [present, genuineClose, logical, setLogical]);
  useEffect(() => {
    if (
      concealed &&
      genuineClose &&
      cycle.focusSuppressed &&
      !open &&
      unmountedCycle.current !== cycle.token
    ) {
      unmountedCycle.current = cycle.token;
      if (family === "select") selectActions.current?.unmount();
      else menuActions.current?.unmount();
    }
    if (!present && !open && (!genuineClose || !logical)) {
      window.baseProof.events.push(
        `wrapper:closed:${generation}:${cycle.token}`,
      );
      closed(generation);
    }
  }, [
    concealed,
    genuineClose,
    cycle.focusSuppressed,
    cycle.token,
    open,
    present,
    logical,
    generation,
    closed,
  ]);
  const content = (
    <label>
      Draft
      <input
        aria-label="Draft"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
    </label>
  );
  const popupProps = {
    className: "popup",
    "data-popup": "lifecycle",
    "data-concealed": concealed,
    finalFocus,
  };
  let overlay: ReactNode;
  if (family === "dialog")
    overlay = (
      <Dialog.Root
        open={open}
        onOpenChange={change}
        onOpenChangeComplete={complete}
      >
        <Dialog.Trigger data-trigger>Open</Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Backdrop className="backdrop" data-concealed={concealed} />
          <Dialog.Popup
            {...popupProps}
            className="popup frame"
            initialFocus={initialFocus}
          >
            <Dialog.Title>Draft dialog</Dialog.Title>
            {content}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    );
  else if (family === "popover")
    overlay = (
      <Popover.Root
        open={open}
        onOpenChange={change}
        onOpenChangeComplete={complete}
      >
        <Popover.Trigger data-trigger>Open</Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner data-concealed={concealed}>
            <Popover.Popup {...popupProps} initialFocus={initialFocus}>
              {content}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    );
  else if (family === "context-menu")
    overlay = (
      <ContextMenu.Root
        actionsRef={menuActions}
        open={open}
        onOpenChange={change}
        onOpenChangeComplete={complete}
      >
        <ContextMenu.Trigger data-trigger tabIndex={0}>
          Context menu
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Positioner data-concealed={concealed}>
            <ContextMenu.Popup {...popupProps}>
              <ContextMenu.Item
                closeOnClick={false}
                onClick={() => setActions((count) => count + 1)}
              >
                First
              </ContextMenu.Item>
              <ContextMenu.Item
                closeOnClick={false}
                onClick={() => setActions((count) => count + 1)}
              >
                Second
              </ContextMenu.Item>
            </ContextMenu.Popup>
          </ContextMenu.Positioner>
        </ContextMenu.Portal>
      </ContextMenu.Root>
    );
  else if (family === "menu")
    overlay = (
      <Menu.Root
        actionsRef={menuActions}
        open={open}
        onOpenChange={change}
        onOpenChangeComplete={complete}
      >
        <Menu.Trigger data-trigger>Open</Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner data-concealed={concealed}>
            <Menu.Popup {...popupProps}>
              <Menu.Item closeOnClick={false}>Staged {draft}</Menu.Item>
              <Menu.Item closeOnClick={false}>Second</Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    );
  else
    overlay = (
      <Select.Root
        actionsRef={concealed ? selectActions : undefined}
        open={open}
        onOpenChange={change}
        onOpenChangeComplete={complete}
        items={{ one: "One", two: "Two" }}
        value={value}
        onValueChange={setValue}
      >
        <Select.Trigger data-trigger>
          <Select.Value />
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner
            alignItemWithTrigger={false}
            data-concealed={concealed}
          >
            <Select.Popup {...popupProps}>
              <Select.Item value="one">One</Select.Item>
              <Select.Item value="two">Two</Select.Item>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    );
  return (
    <div
      onFocusCapture={claimFocus}
      data-concealed={!present && params.get("loss") === "activity"}
    >
      <div
        data-state-output
        data-logical={logical}
        data-present={present}
        data-token={cycle.token}
        data-changes={changes}
        data-completes={completes}
        data-initials={initials}
        data-finals={finals}
        data-base-completes={baseCompletes}
        data-base-finals={baseFinals}
        data-draft={draft}
        data-value={value ?? "none"}
        data-actions={actions}
      />
      <RetainedDraft />
      {overlay}
    </div>
  );
}

type Gesture = {
  pointerId: number;
  target: EventTarget | null;
  owned: boolean;
};
const FrameRegistry = createContext<Set<object> | null>(null);
function useEligibleLayer(open: boolean): void {
  const registry = useContext(FrameRegistry);
  useLayoutEffect(() => {
    if (!open || !registry) return;
    const token = {};
    registry.add(token);
    return () => {
      registry.delete(token);
    };
  }, [registry, open]);
}
function NestedLayer(): ReactNode {
  const [open, setOpen] = useState(false);
  const [present, setPresent] = useState(true);
  const [cancel, setCancel] = useState(false);
  // Keep a boolean outside JSX: the JSX lint autofix would otherwise emit null.
  const presentedOpen = open && present;
  useEligibleLayer(presentedOpen);
  useLayoutEffect(() => {
    window.baseProof.present = (next: boolean) => {
      window.baseProof.events.push(`present:${next}`);
      flushSync(() => setPresent(next));
    };
    window.baseProof.close = () => {
      window.baseProof.events.push("child:owner-close");
      flushSync(() => setOpen(false));
    };
    window.baseProof.cancel = (next: boolean) =>
      flushSync(() => setCancel(next));
    window.baseProof.race = () =>
      document
        .querySelector("[data-backdrop]")
        ?.addEventListener(
          "pointerdown",
          () => flushSync(() => setOpen(false)),
          { once: true },
        );
  });
  const change = (
    next: boolean,
    details: { cancel: () => void; reason: string },
  ): void => {
    window.baseProof.events.push(`child:${next}:${details.reason}:${present}`);
    if (!next && cancel) {
      details.cancel();
      return;
    }
    setOpen(next);
  };
  if (family === "select")
    return (
      <Select.Root
        open={presentedOpen}
        onOpenChange={change}
        items={{ one: "One", two: "Two" }}
        defaultValue="one"
      >
        <Select.Trigger data-nested-trigger>
          <Select.Value />
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner alignItemWithTrigger={false}>
            <Select.Popup className="popup" data-nested-popup>
              <Select.Item value="one">One</Select.Item>
              <Select.Item value="two">Two</Select.Item>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    );
  return (
    <Menu.Root open={presentedOpen} onOpenChange={change}>
      <Menu.Trigger data-nested-trigger>Nested menu</Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner>
          <Menu.Popup className="popup" data-nested-popup>
            <Menu.Item>First</Menu.Item>
            <Menu.Item>Second</Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
function NestedProof(): ReactNode {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(true);
  const [tooltip, setTooltip] = useState(false);
  const [unrelated, setUnrelated] = useState(false);
  const [registry] = useState(() => new Set<object>());
  const gesture = useRef<Gesture | null>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const ownedEvents = useRef(new WeakMap<Event, boolean>());
  useLayoutEffect(() => {
    const down = (event: PointerEvent): void => {
      gesture.current = {
        pointerId: event.pointerId,
        target: event.target,
        owned: registry.size > 0,
      };
      ownedEvents.current.set(event, registry.size > 0);
    };
    const cancel = (): void => {
      gesture.current = null;
    };
    const click = (event: MouseEvent): void => {
      const start = gesture.current;
      // Virtual clicks have no pointer history: sample committed ownership afresh.
      if (event.detail === 0) ownedEvents.current.set(event, registry.size > 0);
      if (
        start &&
        event.detail > 0 &&
        event.target === start.target &&
        (!(event instanceof PointerEvent) ||
          event.pointerId === start.pointerId)
      )
        ownedEvents.current.set(event, start.owned);
      gesture.current = null;
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointercancel", cancel, true);
    document.addEventListener("click", click, true);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointercancel", cancel, true);
      document.removeEventListener("click", click, true);
    };
  }, [registry]);
  useLayoutEffect(() => {
    window.baseProof.unmount = () => flushSync(() => setMounted(false));
    window.baseProof.tooltip = () => flushSync(() => setTooltip(true));
    window.baseProof.unrelated = () => flushSync(() => setUnrelated(true));
  });
  return (
    <main>
      <Dialog.Root
        open={open}
        onOpenChange={(next, details) => {
          if (!next && details.reason === "outside-press") {
            const event = details.event;
            const matches = ownedEvents.current.has(event);
            const owned = ownedEvents.current.get(event) === true;
            window.baseProof.events.push(
              `frame:${event.type}:${matches}:${owned}:${registry.size}`,
            );
            if (owned || event.target !== backdrop.current) {
              details.cancel();
              return;
            }
          }
          setOpen(next);
        }}
      >
        <Dialog.Trigger data-trigger>Frame</Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Backdrop ref={backdrop} className="backdrop" data-backdrop />
          <Dialog.Popup className="popup frame" data-frame>
            <Dialog.Title>Frame</Dialog.Title>
            <FrameRegistry.Provider value={registry}>
              {mounted ? <NestedLayer /> : null}
            </FrameRegistry.Provider>
            <button type="button" data-body>
              Body
            </button>
            <Tooltip.Root open={tooltip}>
              <Tooltip.Trigger>Hint</Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Positioner>
                  <Tooltip.Popup className="popup" data-tooltip>
                    Passive tooltip
                  </Tooltip.Popup>
                </Tooltip.Positioner>
              </Tooltip.Portal>
            </Tooltip.Root>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
      <Menu.Root modal={false} open={unrelated} onOpenChange={setUnrelated}>
        <Menu.Trigger>Unrelated</Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner>
            <Menu.Popup className="popup" data-unrelated>
              <Menu.Item>Unrelated</Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </main>
  );
}
declare global {
  interface Window {
    baseProof: {
      returnFocused: () => void;
      present: (next: boolean) => void;
      close: () => void;
      cancel: (next: boolean) => void;
      unmount: () => void;
      tooltip: () => void;
      race: () => void;
      unrelated: () => void;
      blur: string[];
      highlight: Record<string, (value: string) => void>;
      events: string[];
      focus: string[];
    };
  }
}
window.baseProof = {
  returnFocused: () => undefined,
  present: () => undefined,
  close: () => undefined,
  cancel: () => undefined,
  unmount: () => undefined,
  tooltip: () => undefined,
  race: () => undefined,
  unrelated: () => undefined,
  blur: [],
  highlight: {},
  events: [],
  focus: [],
};
document.addEventListener("focusin", (event) => {
  if (event.target instanceof HTMLElement)
    window.baseProof.focus.push(event.target.outerHTML.slice(0, 250));
});
document.addEventListener("focusout", (event) => {
  if (event.target instanceof HTMLElement)
    window.baseProof.blur.push(event.target.outerHTML.slice(0, 250));
});
const container = document.getElementById("root");
if (!container) throw new Error("Missing root");
export function Fixture(): ReactNode {
  if (mode === "command")
    return (
      <main className="palettes">
        {params.get("design") === "a" ? (
          <>
            <CommandProof name="one" />
            <CommandProof name="two" />
          </>
        ) : (
          <>
            <CommandBProof name="one" />
            <CommandBProof name="two" />
          </>
        )}
      </main>
    );
  if (mode === "nested") return <NestedProof />;
  return <LifecycleHostBoundary />;
}
createRoot(container).render(<Fixture />);
