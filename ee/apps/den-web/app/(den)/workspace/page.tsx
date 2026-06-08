import { ConnectScreen } from "./connect-screen";

export default function WorkspacePage() {
  // ConnectScreen mints a desktop-handoff grant and redirects to the app's
  // /auth-callback so it auto-connects to the user's worker. (WorkspaceViewer
  // did a bare redirect to the app with no grant, dumping the user on the
  // app's sign-in screen instead of connecting.)
  return <ConnectScreen />;
}
