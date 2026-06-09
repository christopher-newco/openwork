/** @jsxImportSource react */
import * as React from "react";
import {
  ArrowLeft,
  ArrowRight,
  Globe,
  Loader2,
  Plus,
  RotateCw,
  X,
} from "lucide-react";
import { useDragControls } from "motion/react";

import type { OpenworkServerClient } from "@/app/lib/openwork-server";
import { PanelTab, PanelTabClose, PanelTabItem, PanelTabList } from "@/components/panel-tabs";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { ArtifactIcon } from "../artifacts/artifact-icon";
import { ArtifactPanel } from "../artifacts/artifact-panel";
import {
  type BrowserPanelTab,
  type PanelTab as PanelTabEntry,
  useActivePanelTab,
  useSessionPanelState,
} from "./panel-tab-store";
import { useSidePanelTabs } from "./use-side-panel-tabs";
import {
  computeBounds,
  getElectronBrowser,
  getNativeMenuPoint,
  hasNativeBrowserOccluder,
  sameBounds,
} from "./utils";
import { isDesktopRuntime } from "../../../../app/utils";
import { resolveOpenworkConnection } from "../../../shell/openwork-connection";
// noVNC loaded dynamically at runtime — avoids bundling a 200KB VNC library
// that's only needed on web deployments with the browser panel active.
let rfbPromise: Promise<typeof import("@novnc/novnc/core/rfb.js")["default"]> | null = null;
function loadRFB() {
  if (!rfbPromise) {
    rfbPromise = import(/* @vite-ignore */ "https://cdn.jsdelivr.net/npm/@novnc/novnc@1.7.0/core/rfb.js")
      .then((m: any) => m.default ?? m)
      .catch(() => { rfbPromise = null; throw new Error("Failed to load noVNC"); });
  }
  return rfbPromise;
}

type SidePanelProps = {
  sessionId: string;
  client: OpenworkServerClient | null;
  workspaceId: string | null;
  workspaceRoot: string;
  isRemoteWorkspace?: boolean;
  onClose: () => void;
};

// HMR can remount this module without unmounting BrowserPanelContent, leaving
// the native Electron browser overlay visible — hide it before the module reloads.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    getElectronBrowser()?.hide?.();
  });
}

type SidePanelTabProps = {
  tab: PanelTabEntry;
  active: boolean;
  onSelect: (tabId: string) => void;
  onClose: (tab: PanelTabEntry) => void;
};

function SidePanelTab({ tab, active, onSelect, onClose }: SidePanelTabProps) {
  const dragControls = useDragControls();
  const tabRef = React.useRef<HTMLDivElement>(null);

  const showBrowserTabContextMenu = (point?: { clientX: number; clientY: number }) => {
    void getElectronBrowser()?.showTabContextMenu?.(
      tab.id,
      getNativeMenuPoint(tabRef.current, point),
    );
  };

  return (
    <PanelTabItem
      value={tab.id}
      id={tab.id}
      dragControls={tab.type === "browser" ? dragControls : undefined}
      onContextMenu={tab.type === "browser" ? (event: React.MouseEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        showBrowserTabContextMenu({ clientX: event.clientX, clientY: event.clientY });
      } : undefined}
    >
      <div ref={tabRef} className="relative">
        <PanelTab
          active={active}
          onClick={() => onSelect(tab.id)}
          onPointerDown={tab.type === "browser" ? (event) => {
            if (event.button !== 0) {
              return;
            }

            dragControls.start(event);
          } : undefined}
          onKeyDown={tab.type === "browser" ? (event: React.KeyboardEvent<HTMLButtonElement>) => {
            if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) {
              return;
            }

            event.preventDefault();
            showBrowserTabContextMenu();
          } : undefined}
          title={tab.label}
          aria-label={`Select tab: ${tab.label}`}
        >
          {tab.type === "browser" ? (
            tab.favicon ? (
              <img src={tab.favicon} alt="" className="size-3.5 shrink-0 rounded-[2px]" />
            ) : tab.status === "loading" ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Globe />
            )
          ) : (
            <ArtifactIcon type={tab.preview} />
          )}
          <span className="min-w-0 flex-1 truncate text-left">{tab.label}</span>
        </PanelTab>
        <PanelTabClose
          active={active}
          label={tab.label}
          onClose={() => onClose(tab)}
        />
      </div>
    </PanelTabItem>
  );
}

type BrowserPanelContentProps = {
  tab: BrowserPanelTab;
  onClose: () => void;
  serverBaseUrl?: string;
  serverToken?: string;
  workspaceId?: string | null;
};

function BrowserPanelContent({
  tab,
  onClose,
  serverBaseUrl,
  serverToken,
  workspaceId,
}: BrowserPanelContentProps) {
  const isAvailable = Boolean(getElectronBrowser());
  const [urlInput, setUrlInput] = React.useState(tab.url);
  const urlFocusedRef = React.useRef(false);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const urlInputRef = React.useRef<HTMLInputElement>(null);

  const noVncContainerRef = React.useRef<HTMLDivElement>(null);
  const rfbRef = React.useRef<any>(null);

  // noVNC WebSocket VNC connection for live interactive browser on web.
  // Falls back to resolving the connection from stored settings if props are missing,
  // so the browser panel works even when no session is open.
  React.useEffect(() => {
    if (isDesktopRuntime() || !noVncContainerRef.current) return;
    const container = noVncContainerRef.current;
    let rfb: any = null;
    let cancelled = false;

    const connect = async () => {
      // Use passed props if available; otherwise read from stored worker settings
      let base = serverBaseUrl ?? "";
      let token = serverToken ?? "";
      let wsId = workspaceId ?? "";
      if (!base || !token || !wsId) {
        try {
          const conn = await resolveOpenworkConnection();
          base = conn.normalizedBaseUrl;
          token = conn.resolvedToken;
          // workspaceId comes from the predefined worker entry in localStorage
          const pw = typeof window !== "undefined"
            ? (() => { try { return JSON.parse(localStorage.getItem("openwork.predefinedWorker") ?? "{}"); } catch { return {}; } })()
            : {};
          wsId = pw.workspaceId ?? wsId;
        } catch { return; }
      }
      if (!base || !token || !wsId || cancelled) return;
      const wsBase = base.replace("https://","wss://").replace("http://","ws://").replace(/[/]+$/,"");
      const wsUrl = `${wsBase}/workspace/${encodeURIComponent(wsId)}/browser/vnc?token=${encodeURIComponent(token)}`;
      console.log("[browser-panel] connecting noVNC to:", wsUrl.replace(/token=[^&]+/, "token=***"));
      void loadRFB().then((RFB) => {
        if (cancelled || !container) return;
        rfb = new RFB(container, wsUrl, { wsProtocols: ["binary"] });
        rfb.scaleViewport = true;
        rfbRef.current = rfb;
      });
    };
    void connect();
    return () => {
      cancelled = true;
      rfb?.disconnect();
      rfbRef.current = null;
    };
  }, [serverBaseUrl, serverToken, workspaceId]);
  const shownRef = React.useRef(false);
  const boundsFrameRef = React.useRef<number | null>(null);
  const lastBoundsRef = React.useRef<{ x: number; y: number; width: number; height: number } | null>(null);

  React.useEffect(() => {
    if (!urlFocusedRef.current) {
      setUrlInput(tab.url);
    }
  }, [tab.id, tab.url]);

  // On web: poll browser/state every 2s to keep URL bar in sync with Chromium navigation
  React.useEffect(() => {
    if (isDesktopRuntime() || !serverBaseUrl || !serverToken || !workspaceId) return;
    let active = true;
    const poll = async () => {
      if (!active || urlFocusedRef.current) return;
      try {
        const res = await fetch(
          `${serverBaseUrl}/workspace/${encodeURIComponent(workspaceId)}/browser/state`,
          { headers: { Authorization: `Bearer ${serverToken}` } }
        );
        if (res.ok) {
          const { url } = await res.json() as { url?: string };
          if (url && url !== "about:blank" && active && !urlFocusedRef.current) {
            setUrlInput(url);
          }
        }
      } catch { /* ignore */ }
      if (active) setTimeout(poll, 2000);
    };
    void poll();
    return () => { active = false; };
  }, [serverBaseUrl, serverToken, workspaceId]);

  const cdpPost = React.useCallback((path: string, body?: Record<string, unknown>) => {
    if (!serverBaseUrl || !workspaceId) return;
    void fetch(`${serverBaseUrl}/workspace/${encodeURIComponent(workspaceId)}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${serverToken ?? ""}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }, [serverBaseUrl, serverToken, workspaceId]);

  const navigate = React.useCallback(() => {
    if (isDesktopRuntime()) void getElectronBrowser()?.navigate?.(urlInput);
    else cdpPost("/browser/navigate", { url: urlInput });
  }, [urlInput, cdpPost]);

  const back = React.useCallback(() => {
    if (isDesktopRuntime()) void getElectronBrowser()?.back?.();
    else cdpPost("/browser/back");
  }, [cdpPost]);

  const forward = React.useCallback(() => {
    if (isDesktopRuntime()) void getElectronBrowser()?.forward?.();
    else cdpPost("/browser/forward");
  }, [cdpPost]);

  const reload = React.useCallback(() => {
    if (isDesktopRuntime()) void getElectronBrowser()?.reload?.();
    else cdpPost("/browser/reload");
  }, [cdpPost]);

  const handleUrlKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      navigate();
      urlInputRef.current?.blur();
    }
  }, [navigate]);

  React.useLayoutEffect(() => {
    const browser = getElectronBrowser();
    const content = contentRef.current;
    if (!browser || !content || !isAvailable) {
      return;
    }

    const bounds = computeBounds(content);
    if (bounds.width < 1 || bounds.height < 1) {
      return;
    }

    browser.setBounds?.(bounds);
    lastBoundsRef.current = bounds;
  });

  React.useLayoutEffect(() => {
    const browser = getElectronBrowser();
    const content = contentRef.current;

    if (!browser || !content || !isAvailable) {
      browser?.hide?.();
      shownRef.current = false;
      lastBoundsRef.current = null;

      if (boundsFrameRef.current != null) {
        window.cancelAnimationFrame(boundsFrameRef.current);
        boundsFrameRef.current = null;
      }

      return;
    }

    let disposed = false;

    const resetNativeView = async () => {
      await browser.hide?.();

      if (disposed) {
        return;
      }

      shownRef.current = false;
      lastBoundsRef.current = null;
      boundsFrameRef.current = window.requestAnimationFrame(watchBounds);
    };

    const syncBounds = () => {
      const bounds = computeBounds(content);

      if (bounds.width < 1 || bounds.height < 1 || hasNativeBrowserOccluder()) {
        if (shownRef.current) {
          browser.hide?.();
          shownRef.current = false;
          lastBoundsRef.current = null;
        }

        return;
      }

      if (!shownRef.current) {
        browser.show?.(bounds);
        shownRef.current = true;
        lastBoundsRef.current = bounds;
        return;
      }

      if (!sameBounds(lastBoundsRef.current, bounds)) {
        browser.setBounds?.(bounds);
        lastBoundsRef.current = bounds;
      }
    };

    const watchBounds = () => {
      syncBounds();
      boundsFrameRef.current = window.requestAnimationFrame(watchBounds);
    };

    void resetNativeView();

    const observer = new ResizeObserver(syncBounds);

    observer.observe(content);
    window.addEventListener("resize", syncBounds);
    window.addEventListener("scroll", syncBounds, true);

    return () => {
      disposed = true;
      observer.disconnect();
      window.removeEventListener("resize", syncBounds);
      window.removeEventListener("scroll", syncBounds, true);

      if (boundsFrameRef.current != null) {
        window.cancelAnimationFrame(boundsFrameRef.current);
        boundsFrameRef.current = null;
      }

      browser.hide?.();
      shownRef.current = false;
      lastBoundsRef.current = null;
    };
  }, [isAvailable]);

  return (
    <>
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border bg-background px-2 mac:bg-background/80 mac:backdrop-blur-2xl mac:backdrop-saturate-150">
        {isAvailable ? (
          <>
            <Tooltip>
              <TooltipTrigger
                render={(
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={back}
                    disabled={!tab.canGoBack}
                    aria-label="Go back"
                  >
                    <ArrowLeft />
                  </Button>
                )}
              />
              <TooltipContent>Back</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={(
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={forward}
                    disabled={!tab.canGoForward}
                    aria-label="Go forward"
                  >
                    <ArrowRight />
                  </Button>
                )}
              />
              <TooltipContent>Forward</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={(
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={reload}
                    aria-label="Reload page"
                  >
                    {tab.status === "loading" ? <Loader2 className="animate-spin" /> : <RotateCw />}
                  </Button>
                )}
              />
              <TooltipContent>Reload</TooltipContent>
            </Tooltip>
            <InputGroup className="mx-1 h-7 flex-1 rounded-md">
              <InputGroupInput
                ref={urlInputRef}
                type="text"
                className="h-7"
                value={urlInput}
                onChange={(event) => setUrlInput(event.target.value)}
                onKeyDown={handleUrlKeyDown}
                onFocus={() => {
                  urlFocusedRef.current = true;
                  urlInputRef.current?.select();
                }}
                onBlur={() => {
                  urlFocusedRef.current = false;
                }}
                placeholder="Enter URL..."
                spellCheck={false}
                autoComplete="off"
              />
              <InputGroupAddon align="inline-start" className="ps-2">
                <Globe />
              </InputGroupAddon>
            </InputGroup>
          </>
        ) : (
          <p className="px-2 text-sm text-muted-foreground">
            {/* noVNC mounts into the container below */}
          </p>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          title="Close panel"
          aria-label="Close panel"
        >
          <X />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {isAvailable
          ? <div ref={contentRef} className="h-full overflow-hidden" />
          : <div ref={noVncContainerRef} className="h-full overflow-hidden bg-black" />}
      </div>
    </>
  );
}

export function SidePanel({
  sessionId,
  client,
  workspaceId,
  workspaceRoot,
  isRemoteWorkspace = false,
  onClose,
}: SidePanelProps) {
  const { tabs } = useSessionPanelState(sessionId);
  const activeTab = useActivePanelTab(sessionId);
  const isBrowserAvailable = Boolean(getElectronBrowser());

  const { createTab, closeTab, selectTab, reorderTabs } = useSidePanelTabs(sessionId);

  return (
    <TooltipProvider delay={1000}>
      <div className="flex h-full flex-col">
        <div className="shrink-0 border-b border-border bg-background mac:bg-background/80 mac:backdrop-blur-2xl mac:backdrop-saturate-150">
          <div className="flex h-10 items-center gap-1 border-b border-border/60 px-2">
            <div className="no-scrollbar min-w-0 flex-1 overflow-x-auto">
              <PanelTabList
                values={tabs.map((tab) => tab.id)}
                onReorder={reorderTabs}
              >
                {tabs.map((tab) => (
                  <SidePanelTab
                    key={tab.id}
                    tab={tab}
                    active={tab.id === activeTab?.id}
                    onSelect={selectTab}
                    onClose={closeTab}
                  />
                ))}
              </PanelTabList>
            </div>
            {isBrowserAvailable ? (
              <Tooltip>
                <TooltipTrigger
                  render={(
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => createTab()}
                      aria-label="New tab"
                    >
                      <Plus />
                    </Button>
                  )}
                />
                <TooltipContent>New tab</TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        </div>
        {!activeTab && isBrowserAvailable ? (
          <PanelEmpty />
        ) : null}
        {activeTab?.type === "browser" || (!isBrowserAvailable && typeof window !== "undefined") ? (
          <BrowserPanelContent
            tab={activeTab ?? { id: "web-browser", type: "browser", label: "Browser", url: "" }}
            onClose={onClose}
            serverBaseUrl={client?.baseUrl}
            serverToken={client?.token}
            workspaceId={workspaceId}
          />
        ) : activeTab?.type === "artifact" ? (
          <div className="min-h-0 flex-1 overflow-hidden">
            <ArtifactPanel
              sessionId={sessionId}
              tab={activeTab}
              client={client}
              workspaceId={workspaceId}
              workspaceRoot={workspaceRoot}
              isRemoteWorkspace={isRemoteWorkspace}
              onClose={onClose}
            />
          </div>
        ) : null}
      </div>
    </TooltipProvider>
  );
}

function PanelEmpty() {
  return (
    <div className="flex h-full items-center justify-center p-4 text-center">
      <p className="text-sm text-muted-foreground">Open an artifact or browser tab to get started.</p>
    </div>
  );
}