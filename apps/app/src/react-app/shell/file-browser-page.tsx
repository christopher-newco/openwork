/** @jsxImportSource react */
import * as React from "react";

import { createOpenworkServerClient } from "@/app/lib/openwork-server";
import { resolveOpenworkConnection } from "./openwork-connection";

type Entry = { name: string; path: string; kind: "dir" | "file"; size: number; updatedAt: number };
type Conn = { baseUrl: string; token: string; hostToken: string; workspaceId: string };

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

/**
 * Standalone workspace file browser (web). Navigate folders and download files
 * over the worker's /files/list + /files/raw routes. Self-contained so it can't
 * affect the session/chat view.
 */
export function FileBrowserPage() {
  const [conn, setConn] = React.useState<Conn | null>(null);
  const [path, setPath] = React.useState("");
  const [entries, setEntries] = React.useState<Entry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

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

  const download = async (entry: Entry) => {
    if (!conn) return;
    try {
      const url = `${conn.baseUrl}/workspace/${encodeURIComponent(conn.workspaceId)}/files/raw?path=${encodeURIComponent(entry.path)}`;
      const headers: Record<string, string> = { Authorization: `Bearer ${conn.token}` };
      if (conn.hostToken) headers["X-OpenWork-Host-Token"] = conn.hostToken;
      const res = await fetch(url, { headers });
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
      setError(e instanceof Error ? e.message : "Download failed");
    }
  };

  const segments = path ? path.split("/") : [];
  const goTo = (idx: number) => setPath(idx < 0 ? "" : segments.slice(0, idx + 1).join("/"));

  return (
    <div className="mx-auto max-w-3xl p-6">
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

      {loading ? (
        <div className="p-4 text-sm opacity-60">Loading&hellip;</div>
      ) : (
        <div className="divide-y rounded border">
          {entries.length === 0 ? (
            <div className="p-4 text-sm opacity-60">This folder is empty.</div>
          ) : (
            entries.map((entry) => (
              <div key={entry.path} className="flex items-center justify-between px-3 py-2 text-sm hover:bg-black/5">
                {entry.kind === "dir" ? (
                  <button
                    type="button"
                    onClick={() => setPath(entry.path)}
                    className="flex items-center gap-2 text-left font-medium"
                  >
                    <span aria-hidden>{"\u{1F4C1}"}</span>
                    <span>{entry.name}</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span aria-hidden>{"\u{1F4C4}"}</span>
                    <span>{entry.name}</span>
                  </div>
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
            ))
          )}
        </div>
      )}
    </div>
  );
}
