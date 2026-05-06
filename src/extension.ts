import * as vscode from "vscode";
import { HistoryPanel } from "./historyPanel";

export function activate(ctx: vscode.ExtensionContext): void {
  // Don't try to restore stale panels from previous sessions —
  // they have no extension state, would just hang on Loading.
  // Dispose them on restore; user reopens via the command.
  if (vscode.window.registerWebviewPanelSerializer) {
    ctx.subscriptions.push(
      vscode.window.registerWebviewPanelSerializer("gitTimeMachine.panel", {
        async deserializeWebviewPanel(panel) {
          panel.dispose();
        },
      }),
    );
  }

  ctx.subscriptions.push(
    vscode.commands.registerCommand(
      "gitTimeMachine.viewFileHistory",
      async (resource?: vscode.Uri) => {
        const target =
          resource?.fsPath ??
          vscode.window.activeTextEditor?.document.uri.fsPath;
        if (!target) {
          void vscode.window.showInformationMessage(
            "Open a file to view its git history.",
          );
          return;
        }
        await HistoryPanel.openFor(ctx.extensionUri, target, ctx.workspaceState);
      },
    ),
    vscode.commands.registerCommand("gitTimeMachine.refresh", () => {
      HistoryPanel.active?.refresh();
    }),
    vscode.commands.registerCommand("gitTimeMachine.next", () => {
      HistoryPanel.active?.step(1);
    }),
    vscode.commands.registerCommand("gitTimeMachine.prev", () => {
      HistoryPanel.active?.step(-1);
    }),
  );
}

export function deactivate(): void {
  // no-op
}
