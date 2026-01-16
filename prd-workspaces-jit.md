# PRD — Just-in-Time Workspaces + Folder Access (OpenWork)

## Summary

OpenWork currently asks users to select a project folder and pre-authorize folders during Host onboarding ("Authorized Workspaces"). This is correct for least-privilege, but it’s high-friction and happens too early.

This PRD proposes:

1. **Just-in-time (JIT) workspace selection**: users pick a workspace when they *start a task / send the first prompt*, not on app launch.
2. **First-class Workspaces**: named, reusable contexts that bundle:
   - primary project directory
   - additional authorized folders (0..N)
   - workspace-scoped plugins (project `opencode.json`)
   - workspace-scoped skills (`.opencode/skill`)
3. **JIT folder expansion**: when a task needs access to a new folder, OpenWork offers “Allow once / Allow for workspace / Deny” and can add that folder to the workspace.

This keeps OpenWork safe and local-first, but moves the permission burden to the moment it’s actually needed.

## Problem

The current Host onboarding forces users to make file-scope decisions before they understand what they’re doing:

- Users want to “try OpenWork” without committing to a folder.
- Users often don’t know which folder matters until they start typing a task.
- Users commonly work across multiple contexts (e.g., a work repo, personal notes, Downloads), which doesn’t map cleanly to a single “project folder”.
- The mental model is unclear: are we picking a *project*, authorizing *folders*, or creating a *profile*?

The result is a premium-feeling UI that still has a “developer onboarding cliff” right at the start.

## Goals

- **Remove the upfront folder picker** from first-run Host onboarding.
- **Introduce Workspaces** as the primary access boundary in OpenWork.
- **Select a workspace at the moment of work** (create session / send prompt / run template).
- **Support many workspaces** and quick switching.
- **Allow multiple authorized folders per workspace** and add them later.
- Preserve **least privilege** and **explicit user intent**.
- Keep **parity with OpenCode primitives**:
  - workspace-scoped configuration maps to OpenCode’s project scope (`directory`, `opencode.json`, `.opencode/skill`).

## Non-goals

- Replacing OpenCode’s permission system.
- Solving multi-user/team workspace sharing (future).
- Designing a full Git/IDE-style project manager.
- Shipping a cross-device workspace sync solution in the first iteration.

## Current Architecture (Constraints)

- OpenWork runs in two permission layers (as described in `design-prd.md`):
  1. OpenWork UI authorization via native folder picker
  2. OpenCode server permissions via permission events

- OpenWork currently treats “workspace” as a selected `directory` and uses it to:
  - choose the OpenCode client `directory`
  - decide where to install skills (`.opencode/skill`)
  - read/write project plugin config (`opencode.json`)

- Host mode still needs to start the OpenCode server somewhere (working directory).

## Proposal

### 1) Define “Workspace” as a first-class object

A workspace is a named context that defines:

- **Primary folder**: the main directory used for project-scoped config (`opencode.json`, `.opencode/skill`).
- **Authorized folders**: additional allowed roots the agent may access (e.g., `~/Downloads`, a docs folder, another repo).
- **Scope**:
  - Plugins: project-scope `opencode.json` associated with the workspace
  - Skills: workspace-scope `.opencode/skill` in the workspace primary folder (plus optional global skills)

Minimal workspace fields (conceptual):

- `id`
- `name`
- `primaryDir`
- `authorizedDirs: string[]`
- `createdAt`, `lastUsedAt`
- `pinned?: boolean`

### 2) Move folder selection to JIT moments

Instead of requiring a folder before the user can proceed, only prompt for a workspace when:

- creating a new session
- sending a prompt
- running a template

When there is no active workspace, show a sheet:

- **Pick a workspace** (recent + pinned)
- **Create new workspace**
- **Quick task (no file access)** (runs in a sandboxed, empty directory)

### 3) JIT “expand workspace” when the agent needs more access

When a tool call or user action requires access outside the workspace’s authorized roots, OpenWork prompts:

- Allow once (session-only)
- Allow for this workspace (persist by adding folder to workspace)
- Deny

This should be the default mechanism for “add as many folders as needed” without a dedicated onboarding step.

### 4) Host engine start without requiring a project folder

We need a safe default for starting the engine even before a workspace is selected.

Recommended approach:

- Start the engine in an **OpenWork sandbox directory** (app-managed), e.g.
  - macOS: `~/Library/Application Support/OpenWork/sandbox`
  - Linux: `~/.local/share/openwork/sandbox`
  - Windows: `%APPDATA%\\OpenWork\\sandbox`

Then, when the user selects a workspace, OpenWork connects a client with `directory = workspace.primaryDir`.

Alternative (future): delay engine start until first workspace selection. This can reduce background work, but makes “instant app ready” harder.

## UX / UI Surfaces

### Onboarding (Host)

Replace “Authorized Workspaces” with:

- Engine setup (already present)
- A short explanation:
  - “You’ll pick a workspace when you start a task.”
  - “OpenWork will ask before reading or writing files.”

Primary action:
- Continue to dashboard

### Workspace Switcher

Add a workspace switcher UI element that is always visible:

- Dashboard header: “Workspace: <name>” chip
- Prompt bar: workspace chip (tap to switch)

When tapped:

- recent workspaces list
- search
- “New workspace…”
- “Manage workspaces”

### Workspace Manager (Settings)

A dedicated Settings page:

- Create / rename / delete workspaces
- Edit workspace:
  - change primary folder
  - view/add/remove authorized folders
  - show plugin config path (project-scope)
  - show skill locations (workspace-scope)

### Skills + Plugins Scoping

Skills tab:

- Filter by workspace
- Install skill into:
  - “This workspace” (default)
  - “Global” (optional; future)

Plugins tab:

- Default view is “Current workspace” (project `opencode.json`)
- Secondary view is “Global” (`~/.config/opencode/opencode.json`)

## Technical Notes (No Implementation Yet)

- Store workspaces in IndexedDB (OpenWork state) and optionally mirror to a JSON file for portability.
- When switching workspaces:
  - recreate the OpenCode client using the workspace’s `directory`
  - re-load plugin config in project scope
  - refresh skills list (workspace `.opencode/skill`)
- When a folder is approved “for workspace”, persist it into `workspace.authorizedDirs`.

## Migration

For existing users with a saved `projectDir` and `authorizedDirs`:

- Create an initial workspace named “Default” on first run after the update.
- Set `primaryDir = projectDir`, `authorizedDirs = authorizedDirs`.

## Acceptance Criteria

- Fresh install:
  - User can reach the dashboard without selecting a folder.
  - First task run prompts for a workspace (or offers a sandboxed quick task).
- User can create 2+ workspaces and switch between them.
- User can add multiple authorized folders to a workspace over time.
- If a task attempts to access a folder outside authorization, OpenWork prompts with clear choices and can persist the decision.
- Plugins and skills reflect the active workspace scope.

## Open Questions

- Should “Quick task (no file access)” be allowed to run with *zero* authorized folders, or should it still require selecting one folder for the session?
- How should OpenWork represent “global skills” vs “workspace skills” while staying faithful to OpenCode’s `.opencode/skill` model?
- Should workspaces be purely “project = folder”, or can a workspace have a distinct config home with many unrelated authorized folders?
- For mobile Client mode, how should the host expose the list of workspaces (and which are permitted to the client)?
