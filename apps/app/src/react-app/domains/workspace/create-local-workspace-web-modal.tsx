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
  serverBaseUrl?: string;
  serverToken?: string;
  workspaceId?: string;
};

/**
 * Web-only "Add workspace" modal.
 *
 * The web app has no native folder picker and intentionally does not expose the
 * remote-server option, so this collects just a name. The parent turns it into a
 * folder under the worker's persistent workspace disk (`/workspace/<name>`), and
 * the worker creates the directory. Switching between workspaces happens from the
 * sidebar.
 *
 * When serverBaseUrl + serverToken + workspaceId are provided, the modal fetches
 * existing top-level folders from the worker and offers them as quick-select options
 * in addition to the "New folder" text input.
 */
export function CreateLocalWorkspaceWebModal(props: CreateLocalWorkspaceWebModalProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState("");
  const submitting = props.submitting ?? false;

  // Existing folders fetched from the worker
  const [existingFolders, setExistingFolders] = useState<string[]>([]);
  const [fetchingFolders, setFetchingFolders] = useState(false);

  // Fetch top-level dirs when modal opens and server info is available
  useEffect(() => {
    if (!props.open) return;
    setName("");
    setExistingFolders([]);
    const id = setTimeout(() => inputRef.current?.focus(), 50);

    if (props.serverBaseUrl && props.serverToken && props.workspaceId) {
      setFetchingFolders(true);
      void fetch(
        `${props.serverBaseUrl}/workspace/${encodeURIComponent(props.workspaceId)}/files/list`,
        { headers: { Authorization: `Bearer ${props.serverToken}` } }
      )
        .then(async (res) => {
          if (!res.ok) return;
          const json = await res.json();
          const entries: Array<{ name: string; kind: string }> = json.entries ?? [];
          const dirs = entries
            .filter((e) => e.kind === "dir" && !e.name.startsWith("."))
            .map((e) => e.name);
          setExistingFolders(dirs);
        })
        .catch(() => undefined)
        .finally(() => setFetchingFolders(false));
    }

    return () => clearTimeout(id);
  }, [props.open, props.serverBaseUrl, props.serverToken, props.workspaceId]);

  const canSubmit = name.trim().length > 0 && !submitting;

  const submit = () => {
    if (!canSubmit) return;
    void props.onConfirm(name.trim());
  };

  const pickExisting = (folderName: string) => {
    void props.onConfirm(folderName);
  };

  const hasServerInfo = !!(props.serverBaseUrl && props.serverToken && props.workspaceId);

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
        <div className="space-y-4 py-1">
          {hasServerInfo && (existingFolders.length > 0 || fetchingFolders) ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Existing folders</p>
              {fetchingFolders ? (
                <p className="text-sm opacity-50">Loading…</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {existingFolders.map((folder) => (
                    <button
                      key={folder}
                      type="button"
                      disabled={submitting}
                      onClick={() => pickExisting(folder)}
                      className="rounded border px-3 py-1.5 text-sm hover:bg-black/5 disabled:opacity-50"
                    >
                      📁 {folder}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          <div className="space-y-2">
            <label htmlFor="new-workspace-name" className="text-sm font-medium">
              New folder
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
          </div>

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
