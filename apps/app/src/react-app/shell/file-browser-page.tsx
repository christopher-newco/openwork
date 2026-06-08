/** @jsxImportSource react */
import * as React from "react";

import { createOpenworkServerClient } from "@/app/lib/openwork-server";
import { resolveOpenworkConnection } from "./openwork-connection";

type Entry = { name: string; path: string; kind: "dir" | "file"; size: number; updatedAt: number };
type Conn = { baseUrl: string; token: string; hostToken: string; workspaceId: string };
type PreviewKind = "text" | "image" | "pdf" | "none";

const TEXT_EXT = new Set([
  "txt", "md", "markdown", "json", "js", "jsx", "ts", "tsx", "css", "scss", "html", "htm",
  "csv", "tsv", "log", "yml", "yaml", "xml", "toml", "ini", "env", "sh", "bash", "py", "rb",
  "go", "rs", "java", "c", "h", "cpp", "sql", "svg",
]);
const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "avif"]);

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

function previewKindFor(name: string): PreviewKind {
  const ext = extOf(name);
  if (ext === "pdf") return "pdf";
  if (IMAGE_EXT.has(ext)) return "image";
  if (TEXT_EXT.has(ext)) return "text";
  return "none";
}

function formatBytes(n: number): string {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = n;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(i ? 1 : 0)} ${units[i]}`;
}

const MAX_TEXT_PREVIEW_BYTES = 512 * 1024;

/**
 * Standalone workspace file browser (web) with a preview pane. Navigate folders,
 * preview text/images/PDFs inline, download anything. Self-contained so it can't
 * affect the session/chat view.
 */
export function FileBrowserPage() {
  const [conn, setConn] = React.useState<Conn | null>(null);
  const [path, setPath] = React.useState("");
  const [entries, setEntries] = React.useState<Entry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [selected, setSelected] = React.useState<Entry | null>(null);
  const [previewKind, setPreviewKind] = React.useState<PreviewKind>("none");
  const [previewText, setPreviewText] = React.useState<string>("");
  const [previewUrl, setPreviewUrl] = React.useState<string>("");
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [previewError, setPreviewError] = React.useState<string | null>(null);

  const authHeaders = React.useCallback((): Record<string, string> => {
    const headers: Record<string, string> = {};
    if (conn?.token) headers.Authorization = `Bearer ${conn.token}`;
    if (conn?.hostToken) headers["X-OpenWork-Host-Token"] = conn.hostToken;
    return headers;
  }, [conn]);

  const rawUrl = React.useCallback(
    (p: string) =>
      `${conn?.baseUrl ?? ""}/workspace/${encodeURIComponent(conn?.workspaceId ?? "")}/files/raw?path=${encodeURIComponent(p)}`,
    [conn],
  );

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const resolved = await resolveOpenworkConnection();
        let workspaceId = "";
        try {
          const raw = localStorage.getItem("openwork.predefinedWorker");
          if (raw) workspaceId = (JSON.parse(raw)?.workspaceId as string) ?? "";
        } catch {
          // ignore malformed localStorage
        }
        if (cancelled) return;
        if (!resolved.normalizedBaseUrl || !resolved.resolvedToken || !workspaceId) {
          setError("No workspace connection found. Open your workspace first, then return here.");
          setLoading(false);
          return;
        }
        setConn({
          baseUrl: resolved.normalizedBaseUrl,
          token: resolved.resolvedToken,
          hostToken: resolved.resolvedHostToken,
          workspaceId,
        });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to resolve workspace connection");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!conn) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const client = createOpenworkServerClient({ baseUrl: conn.baseUrl, token: conn.token, hostToken: conn.hostToken });
    void client
      .listWorkspaceFiles(conn.workspaceId, path)
      .then((res) => {
        if (cancelled) return;
        setEntries(res.entries ?? []);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to list files");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [conn, path]);

  // Revoke any object URL when it changes or on unmount.
  React.useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const selectFile = async (entry: Entry) => {
    if (!conn) return;
    setSelected(entry);
    setPreviewError(null);
    setPreviewText("");
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl("");
    }
    const kind = previewKindFor(entry.name);
    setPreviewKind(kind);
    if (kind === "none") return;
    if (entry.size > MAX_TEXT_PREVIEW_BYTES && kind === "text") {
      setPreviewError("File is too large to preview inline. Download it instead.");
      return;
    }
    setPreviewLoading(true);
    try {
      const res = await fetch(rawUrl(entry.path), { headers: authHeaders() });
      if (!res.ok) throw new Error(`Preview failed (${res.status})`);
      if (kind === "text") {
        setPreviewText(await res.text());
      } else {
        const blob = await res.blob();
        setPreviewUrl(URL.createObjectURL(blob));
      }
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setPreviewLoading(false);
    }
  };

  const download = async (entry: Entry) => {
    if (!conn) return;
    try {
      const res = await fetch(rawUrl(entry.path), { headers: authHeaders() });
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = entry.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : "Download failed");
    }
  };

  const openFolder = (entry: Entry) => {
    setSelected(null);
    setPreviewKind("none");
    setPath(entry.path);
  };

  const segments = path ? path.split("/") : [];
  const goTo = (idx: number) => {
    setSelected(null);
    setPreviewKind("none");
    setPath(idx < 0 ? "" : segments.slice(0, idx + 1).join("/"));
  };

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Files</h1>
        <a href="/session" className="text-sm underline opacity-70 hover:opacity-100">
          &larr; Back to workspace
        </a>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1 text-sm">
        <button type="button" onClick={() => goTo(-1)} className="rounded px-2 py-0.5 hover:bg-black/5">
          workspace
        </button>
        {segments.map((seg, i) => (
          <span key={`${seg}-${i}`} className="flex items-center gap-1">
            <span className="opacity-40">/</span>
            <button type="button" onClick={() => goTo(i)} className="rounded px-2 py-0.5 hover:bg-black/5">
              {seg}
            </button>
          </span>
        ))}
      </div>

      {error ? (
        <div className="mb-3 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row">
        {/* List */}
        <div className="min-h-0 overflow-auto md:w-2/5">
          {loading ? (
            <div className="p-4 text-sm opacity-60">Loading&hellip;</div>
          ) : (
            <div className="divide-y rounded border">
              {entries.length === 0 ? (
                <div className="p-4 text-sm opacity-60">This folder is empty.</div>
              ) : (
                entries.map((entry) => {
                  const isSelected = selected?.path === entry.path;
                  return (
                    <div
                      key={entry.path}
                      className={`flex items-center justify-between px-3 py-2 text-sm ${isSelected ? "bg-black/5" : "hover:bg-black/5"}`}
                    >
                      {entry.kind === "dir" ? (
                        <button
                          type="button"
                          onClick={() => openFolder(entry)}
                          className="flex items-center gap-2 text-left font-medium"
                        >
                          <span aria-hidden>{"\u{1F4C1}"}</span>
                          <span>{entry.name}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void selectFile(entry)}
                          className="flex items-center gap-2 text-left"
                        >
                          <span aria-hidden>{"\u{1F4C4}"}</span>
                          <span>{entry.name}</span>
                        </button>
                      )}
                      {entry.kind === "file" ? (
                        <button
                          type="button"
                          onClick={() => void download(entry)}
                          className="rounded border px-2 py-0.5 text-xs hover:bg-black/5"
                        >
                          Download <span className="opacity-50">({formatBytes(entry.size)})</span>
                        </button>
                      ) : (
                        <span className="text-xs opacity-40">folder</span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Preview */}
        <div className="min-h-0 flex-1 overflow-auto rounded border">
          {!selected ? (
            <div className="flex h-full items-center justify-center p-6 text-sm opacity-50">
              Select a file to preview
            </div>
          ) : (
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b px-3 py-2 text-sm">
                <span className="truncate font-medium">{selected.name}</span>
                <button
                  type="button"
                  onClick={() => void download(selected)}
                  className="rounded border px-2 py-0.5 text-xs hover:bg-black/5"
                >
                  Download
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-auto p-3">
                {previewLoading ? (
                  <div className="text-sm opacity-60">Loading preview&hellip;</div>
                ) : previewError ? (
                  <div className="text-sm text-red-700">{previewError}</div>
                ) : previewKind === "text" ? (
                  <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">{previewText}</pre>
                ) : previewKind === "image" && previewUrl ? (
                  <img src={previewUrl} alt={selected.name} className="max-h-full max-w-full object-contain" />
                ) : previewKind === "pdf" && previewUrl ? (
                  <embed src={previewUrl} type="application/pdf" className="h-full min-h-[60vh] w-full" />
                ) : (
                  <div className="text-sm opacity-60">
                    No inline preview for this file type. Use Download to open it.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
