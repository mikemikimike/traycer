import type { ReactNode } from "react";
import { Plus, Ungroup, X } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTabsStore } from "@/stores/tabs/store";
import type { TabGroup } from "@/stores/tabs/tab-groups";
import { TabColorPicker } from "./tab-appearance-menu";
import { navigateToTabIntent } from "@/lib/tab-navigation";
import { openNewEpicIntent } from "@/lib/commands/actions/new-epic";

/**
 * The body of a tab group's edit popover: name, colour, a new tab in the
 * group, close the group and ungroup. `onDone` dismisses the host popover and
 * runs before every action that ends the edit.
 */
export function TabGroupEditor(props: {
  readonly groupId: string;
  readonly group: TabGroup;
  readonly onClose: (groupId: string) => void;
  readonly onDone: () => void;
}): ReactNode {
  const navigate = useNavigate();
  const { group, groupId, onDone } = props;
  const actions = useTabsStore.getState();
  return (
    <>
      <Input
        aria-label="Group name"
        placeholder="Name this group"
        maxLength={80}
        value={group.name}
        onChange={(event) =>
          actions.updateGroup(groupId, { name: event.target.value })
        }
        onKeyDown={(event) => {
          if (event.key === "Enter") onDone();
        }}
      />
      <TabColorPicker
        menu={false}
        color={group.color}
        onChange={(color) => actions.updateGroup(groupId, { color })}
      />
      <div className="flex flex-col border-t pt-2">
        <Button
          variant="ghost"
          className="justify-start"
          onClick={() => {
            onDone();
            navigateToTabIntent(
              navigate,
              { ...openNewEpicIntent(), groupId },
              undefined,
            );
          }}
        >
          <Plus />
          New tab in group
        </Button>
        <Button
          variant="ghost"
          className="justify-start"
          onClick={() => {
            onDone();
            props.onClose(groupId);
          }}
        >
          <X />
          Close group
        </Button>
        <Button
          variant="ghost"
          className="justify-start"
          onClick={() => {
            onDone();
            actions.ungroup(groupId);
          }}
        >
          <Ungroup />
          Ungroup
        </Button>
      </div>
    </>
  );
}
