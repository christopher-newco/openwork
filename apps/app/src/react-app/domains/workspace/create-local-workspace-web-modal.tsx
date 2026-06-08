/** @jsxImportSource react */
import { useEffect, useRef, useState } from "react";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type CreateLocalWorkspaceWebModalProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: (name: string) => void | Promise<void>;
  submitting?: boolean;
  error?: string | null;
};

/**
 * Web-only "Add workspace" modal.
 *
 * The web app has no native folder picker and intentionally does not expose the
 * remote-server option, so this collects just a name. The parent turns it into a
 * folder under the worker's persistent workspace disk (`/workspace/<name>`), and
 * the worker creates the directory. Switching between workspaces happens from the
 * sidebar.
 */
export function CreateLocalWorkspaceWebModal(props: CreateLocalWorkspaceWebModalProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState("");
  const submitting = props.submitting ?? false;

  useEffect(() => {
    if (!props.open) return;
    setName("");
    const id = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(id);
  }, [props.open]);

  const canSubmit = name.trim().length > 0 && !submitting;

  const submit = () => {
    if (!canSubmit) return;
    void props.onConfirm(name.trim());
  };

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New workspace</DialogTitle>
          <DialogDescription>
            Create a new workspace folder. You can switch between workspaces from the sidebar.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-1">
          <label htmlFor="new-workspace-name" className="text-sm font-medium">
            Workspace name
          </label>
          <Input
            id="new-workspace-name"
            ref={inputRef}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submit();
              }
            }}
            placeholder="e.g. Client research"
            disabled={submitting}
          />
          {props.error ? (
            <div className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
              {props.error}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost" disabled={submitting}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="button" onClick={submit} disabled={!canSubmit}>
            {submitting ? "Creating…" : "Create workspace"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
