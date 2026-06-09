/** @jsxImportSource react */
import * as React from "react";

import { createOpenworkServerClient } from "@/app/lib/openwork-server";
import { resolveOpenworkConnection } from "./openwork-connection";

type Entry = { name: string; path: string; kind: "dir" | "file"; size: number; updatedAt: number };
type Conn = { baseUrl: string; token: string; hostToken: string; workspaceId: string };
type PreviewKind = "text" | "image" | "pdf" | "office-word" | "office-excel" | "office-ppt" | "html" | "none";

const TEXT_EXT = new Set([
  "txt", "md", "markdown", "js", "jsx", "ts", "tsx", "css", "scss", "html", "htm",
  "csv", "tsv", "log", "sh", "bash", "py", "rb", "go", "rs", "java", "c", "h", "cpp", "sql", "svg",
]);
const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "avif"]);
const WORD_EXT = new Set(["docx", "doc"]);
const EXCEL_EXT = new Set(["xlsx", "xls", "ods"]);
const PPT_EXT = new Set(["pptx", "ppt"]);

function extOf(n: string) { const i = n.lastIndexOf("."); return i >= 0 ? n.slice(i+1).toLowerCase() : ""; }
function formatBytes(n: number) {
  if (!n) return "0 B";
  const u = ["B","KB","MB","GB"]; let v=n,i=0;
  while (v>=1024&&i<u.length-1){v/=1024;i++;}
  return `${v.toFixed(i?1:0)} ${u[i]}`;
}

function previewKindFor(name: string): PreviewKind {
  const e = extOf(name);
  if (e === "pdf") return "pdf";
  if (e === "html" || e === "htm") return "html";
  if (IMAGE_EXT.has(e)) return "image";
  if (TEXT_EXT.has(e)) return "text";
  if (WORD_EXT.has(e)) return "office-word";
  if (EXCEL_EXT.has(e)) return "office-excel";
  if (PPT_EXT.has(e)) return "office-ppt";
  return "none";
}

// Lazy CDN loaders — only fetched when the relevant file type is first previewed
const loadMammoth = () => import(/* @vite-ignore */ "https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js" as string).then((m:any)=>m.default??m);
const loadXLSX = () => import(/* @vite-ignore */ "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js" as string).then((m:any)=>m.default??m.XLSX??m);
// PPTX via PptxGenJS reader isn't available; use an iframe to Google Docs viewer as fallback

const MAX_TEXT_BYTES = 512 * 1024;

export function FileBrowserPage() {
  const [conn, setConn] = React.useState<Conn | null>(null);
  const [path, setPath] = React.useState("");
  const [entries, setEntries] = React.useState<Entry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [selected, setSelected] = React.useState<Entry | null>(null);
  const [previewKind, setPreviewKind] = React.useState<PreviewKind>("none");
  const [previewText, setPreviewText] = React.useState("");
  const [previewUrl, setPreviewUrl] = React.useState("");
  const [previewHtml, setPreviewHtml] = React.useState("");
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [previewError, setPreviewError] = React.useState<string | null>(null);

  // Upload state
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);

  // New folder state
  const [showNewFolder, setShowNewFolder] = React.useState(false);
  const [newFolderName, setNewFolderName] = React.useState("");
  const [creatingFolder, setCreatingFolder] = React.useState(false);
  const newFolderInputRef = React.useRef<HTMLInputElement>(null);

  const authHeaders = React.useCallback((): Record<string,string> => {
    const h: Record<string,string> = {};
    if (conn?.token) h.Authorization = `Bearer ${conn.token}`;
    if (conn?.hostToken) h["X-OpenWork-Host-Token"] = conn.hostToken;
    return h;
  }, [conn]);

  const rawUrl = React.useCallback((p: string) =>
    `${conn?.baseUrl ?? ""}/workspace/${encodeURIComponent(conn?.workspaceId ?? "")}/files/raw?path=${encodeURIComponent(p)}`,
    [conn]);

  // Resolve connection
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const resolved = await resolveOpenworkConnection();
        let workspaceId = "";
        try { const r = localStorage.getItem("openwork.predefinedWorker"); if(r) workspaceId=(JSON.parse(r)?.workspaceId as string)??""; } catch {}
        if (cancelled) return;
        if (!resolved.normalizedBaseUrl || !resolved.resolvedToken || !workspaceId) {
          setError("No workspace connection. Open your workspace first."); setLoading(false); return;
        }
        setConn({ baseUrl: resolved.normalizedBaseUrl, token: resolved.resolvedToken, hostToken: resolved.resolvedHostToken, workspaceId });
      } catch (e) { if (!cancelled) { setError(e instanceof Error ? e.message : "Failed to connect"); setLoading(false); } }
    })();
    return () => { cancelled = true; };
  }, []);

  // Load directory
  const loadDir = React.useCallback((dirPath: string) => {
    if (!conn) return;
    setLoading(true); setError(null); setSelected(null); setPreviewKind("none");
    const client = createOpenworkServerClient({ baseUrl: conn.baseUrl, token: conn.token, hostToken: conn.hostToken });
    void client.listWorkspaceFiles(conn.workspaceId, dirPath)
      .then(res => {
        const HIDDEN_EXT = new Set([".json",".jsonc",".lock",".yaml",".yml",".toml",".ini",".env"]);
        const HIDDEN_NAME = new Set(["node_modules",".git","dist",".cache","package-lock.json","pnpm-lock.yaml"]);
        const filtered = (res.entries ?? []).filter((e: Entry) => {
          if (HIDDEN_NAME.has(e.name)) return false;
          if (e.kind === "file") { const dot=e.name.lastIndexOf("."); if(dot>=0&&HIDDEN_EXT.has(e.name.slice(dot).toLowerCase())) return false; }
          return true;
        });
        setEntries(filtered); setLoading(false);
      })
      .catch((e: unknown) => { setError(e instanceof Error ? e.message : "Failed to list files"); setLoading(false); });
  }, [conn]);

  React.useEffect(() => { if (conn) loadDir(path); }, [conn]); // eslint-disable-line

  // Revoke blob url on change
  React.useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const selectFile = async (entry: Entry) => {
    if (!conn) return;
    setSelected(entry); setPreviewError(null); setPreviewText(""); setPreviewHtml("");
    if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(""); }
    const kind = previewKindFor(entry.name);
    setPreviewKind(kind);
    if (kind === "none") return;
    if (kind === "text" && entry.size > MAX_TEXT_BYTES) { setPreviewError("File too large to preview inline."); return; }
    setPreviewLoading(true);
    try {
      const res = await fetch(rawUrl(entry.path), { headers: authHeaders() });
      if (!res.ok) throw new Error(`Preview failed (${res.status})`);
      if (kind === "text") {
        setPreviewText(await res.text());
      } else if (kind === "html") {
        const html = await res.text();
        // Sanitize: remove script tags, keep structure
        setPreviewHtml(html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ""));
      } else if (kind === "office-word") {
        const arrayBuffer = await res.arrayBuffer();
        const mammoth = await loadMammoth();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        setPreviewHtml(result.value);
      } else if (kind === "office-excel") {
        const arrayBuffer = await res.arrayBuffer();
        const XLSX = await loadXLSX();
        const wb = XLSX.read(arrayBuffer, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        setPreviewHtml(XLSX.utils.sheet_to_html(sheet));
      } else if (kind === "office-ppt") {
        // No good client-side PPTX renderer; use Google Docs viewer via proxy URL
        const publicUrl = rawUrl(entry.path) + `&_token=${encodeURIComponent(conn.token)}`;
        setPreviewUrl(publicUrl); // used as a download fallback; actual preview via iframe below
        setPreviewError("PowerPoint preview: use the Download button to open in your local app.");
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
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href=url; a.download=entry.name;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (e) { setPreviewError(e instanceof Error ? e.message : "Download failed"); }
  };

  const uploadFiles = async (files: FileList) => {
    if (!conn || !files.length) return;
    setUploading(true); setUploadError(null);
    try {
      for (const file of Array.from(files)) {
        const targetPath = path ? `${path}/${file.name}` : file.name;
        const arrayBuffer = await file.arrayBuffer();
        const dataBase64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
        const res = await fetch(
          `${conn.baseUrl}/workspace/${encodeURIComponent(conn.workspaceId)}/files/raw`,
          { method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" },
            body: JSON.stringify({ path: targetPath, dataBase64, force: true }) }
        );
        if (!res.ok) { const j = await res.json().catch(()=>({})); throw new Error((j as any).message ?? `Upload failed (${res.status})`); }
      }
      loadDir(path);
    } catch (e) { setUploadError(e instanceof Error ? e.message : "Upload failed"); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
  };

  const createFolder = async () => {
    if (!conn || !newFolderName.trim()) return;
    const name = newFolderName.trim().replace(/[/\\]/g, "-");
    const folderPath = path ? `${path}/${name}` : name;
    setCreatingFolder(true);
    try {
      // Create folder by uploading a .keep placeholder (worker mkdir via files/raw path)
      const res = await fetch(
        `${conn.baseUrl}/workspace/${encodeURIComponent(conn.workspaceId)}/files/mkdir`,
        { method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ path: folderPath }) }
      );
      if (!res.ok) {
        // Fallback: create a .keep file to ensure the folder exists
        const keepPath = `${folderPath}/.keep`;
        const r2 = await fetch(
          `${conn.baseUrl}/workspace/${encodeURIComponent(conn.workspaceId)}/files/raw`,
          { method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" },
            body: JSON.stringify({ path: keepPath, dataBase64: "", force: true }) }
        );
        if (!r2.ok) throw new Error("Failed to create folder");
      }
      setNewFolderName(""); setShowNewFolder(false); loadDir(path);
    } catch (e) { setUploadError(e instanceof Error ? e.message : "Failed to create folder"); }
    finally { setCreatingFolder(false); }
  };

  React.useEffect(() => {
    if (showNewFolder) setTimeout(() => newFolderInputRef.current?.focus(), 50);
  }, [showNewFolder]);

  const segments = path ? path.split("/") : [];
  const goTo = (idx: number) => { setPath(idx < 0 ? "" : segments.slice(0, idx+1).join("/")); loadDir(idx < 0 ? "" : segments.slice(0, idx+1).join("/")); };
  const openFolder = (entry: Entry) => { setPath(entry.path); loadDir(entry.path); };

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col p-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Files</h1>
        <a href="/session" className="text-sm underline opacity-70 hover:opacity-100">&larr; Back to workspace</a>
      </div>

      {/* Breadcrumb */}
      <div className="mb-3 flex flex-wrap items-center gap-1 text-sm">
        <button type="button" onClick={() => goTo(-1)} className="rounded px-2 py-0.5 hover:bg-black/5">workspace</button>
        {segments.map((seg, i) => (
          <span key={`${seg}-${i}`} className="flex items-center gap-1">
            <span className="opacity-40">/</span>
            <button type="button" onClick={() => goTo(i)} className="rounded px-2 py-0.5 hover:bg-black/5">{seg}</button>
          </span>
        ))}
      </div>

      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className={`cursor-pointer rounded border px-3 py-1 text-sm font-medium hover:bg-black/5 ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
          {uploading ? "Uploading…" : "↑ Upload files"}
          <input ref={fileInputRef} type="file" multiple className="hidden"
            onChange={e => { if (e.target.files?.length) void uploadFiles(e.target.files); }} />
        </label>
        <button type="button" onClick={() => setShowNewFolder(v => !v)}
          className="rounded border px-3 py-1 text-sm font-medium hover:bg-black/5">
          + New folder
        </button>
      </div>

      {/* New folder input */}
      {showNewFolder ? (
        <div className="mb-3 flex gap-2">
          <input ref={newFolderInputRef} value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={e => { if (e.key==="Enter") void createFolder(); if (e.key==="Escape") { setShowNewFolder(false); setNewFolderName(""); } }}
            placeholder="Folder name" className="flex-1 rounded border px-3 py-1.5 text-sm" />
          <button type="button" onClick={() => void createFolder()} disabled={!newFolderName.trim() || creatingFolder}
            className="rounded border px-3 py-1.5 text-sm font-medium hover:bg-black/5 disabled:opacity-50">
            {creatingFolder ? "Creating…" : "Create"}
          </button>
          <button type="button" onClick={() => { setShowNewFolder(false); setNewFolderName(""); }}
            className="rounded border px-3 py-1.5 text-sm hover:bg-black/5">Cancel</button>
        </div>
      ) : null}

      {error ? <div className="mb-3 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {uploadError ? <div className="mb-3 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{uploadError} <button onClick={() => setUploadError(null)} className="ml-2 underline">Dismiss</button></div> : null}

      {/* List + Preview */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row">
        {/* File list */}
        <div className="min-h-0 overflow-auto md:w-2/5">
          {loading ? <div className="p-4 text-sm opacity-60">Loading…</div> : (
            <div className="divide-y rounded border">
              {entries.length === 0 ? <div className="p-4 text-sm opacity-60">This folder is empty.</div> : (
                entries.map(entry => {
                  const isSel = selected?.path === entry.path;
                  return (
                    <div key={entry.path} className={`flex items-center justify-between px-3 py-2 text-sm ${isSel?"bg-black/5":"hover:bg-black/5"}`}>
                      {entry.kind === "dir" ? (
                        <button type="button" onClick={() => openFolder(entry)} className="flex items-center gap-2 text-left font-medium">
                          <span aria-hidden>📁</span><span>{entry.name}</span>
                        </button>
                      ) : (
                        <button type="button" onClick={() => void selectFile(entry)} className="flex items-center gap-2 text-left">
                          <span aria-hidden>📄</span><span>{entry.name}</span>
                        </button>
                      )}
                      {entry.kind === "file" ? (
                        <button type="button" onClick={() => void download(entry)}
                          className="rounded border px-2 py-0.5 text-xs hover:bg-black/5">
                          ↓ <span className="opacity-50">({formatBytes(entry.size)})</span>
                        </button>
                      ) : <span className="text-xs opacity-40">folder</span>}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Preview pane */}
        <div className="min-h-0 flex-1 overflow-auto rounded border">
          {!selected ? (
            <div className="flex h-full items-center justify-center p-6 text-sm opacity-50">Select a file to preview</div>
          ) : (
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b px-3 py-2 text-sm">
                <span className="truncate font-medium">{selected.name}</span>
                <button type="button" onClick={() => void download(selected)} className="rounded border px-2 py-0.5 text-xs hover:bg-black/5">↓ Download</button>
              </div>
              <div className="min-h-0 flex-1 overflow-auto p-3">
                {previewLoading ? <div className="text-sm opacity-60">Loading preview…</div>
                  : previewError ? <div className="text-sm text-red-700">{previewError}</div>
                  : previewKind === "text" ? <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">{previewText}</pre>
                  : previewKind === "image" && previewUrl ? <img src={previewUrl} alt={selected.name} className="max-h-full max-w-full object-contain" />
                  : previewKind === "pdf" && previewUrl ? <embed src={previewUrl} type="application/pdf" className="h-full min-h-[60vh] w-full" />
                  : (previewKind === "html" || previewKind === "office-word" || previewKind === "office-excel") && previewHtml ? (
                    <iframe srcDoc={previewHtml} sandbox="allow-same-origin" className="h-full min-h-[60vh] w-full border-0" title={selected.name} />
                  )
                  : previewKind === "office-ppt" ? <div className="text-sm opacity-60">PowerPoint preview not available in browser. Use Download to open locally.</div>
                  : <div className="text-sm opacity-60">No inline preview for this file type. Use Download to open it.</div>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
