/* Os URLs pertencem à sessão do editor; nunca guardar nem construir o domínio do proxy. */
const vscode = require("vscode");
const services = require("./interfaces.json");
const localUri = (service) => vscode.Uri.parse(`http://127.0.0.1:${service.port}/`);

async function forward() {
  if (vscode.env.uiKind === 1) throw new Error("O encaminhamento HTTPS SageMaker deve ser registado no Code Editor aberto no navegador, não na sessão SSH.");
  // Resolver de novo em cada pedido: um encaminhamento anterior pode ter sido fechado.
  for (const service of services) await vscode.env.asExternalUri(localUri(service));
}
async function openAll() {
  if (vscode.env.uiKind === 1) throw new Error("Para abrir os links HTTPS SageMaker, use BLU · Interfaces no Code Editor do workspace aberto no navegador AWS. Esta janela SSH usa túneis localhost.");
  for (const service of services) {
    // openExternal resolve e encaminha o localhost na sessão atual por si próprio.
    if (!(await vscode.env.openExternal(localUri(service))))
      throw new Error(`Não foi possível abrir ${service.label}.`);
  }
}
async function choose() {
  if (vscode.env.uiKind === 1) throw new Error("Abra o Code Editor deste workspace no navegador AWS para usar os links HTTPS. O painel Ports desta janela SSH continuará a mostrar localhost.");
  const choice = await vscode.window.showQuickPick(
    [{ label: "Abrir todas as interfaces", all: true }, ...services],
    { placeHolder: "Interfaces do workspace atual" },
  );
  if (!choice) return;
  if (choice.all) return openAll();
  if (!(await vscode.env.openExternal(localUri(choice)))) throw new Error("Não foi possível abrir a interface.");
}
async function activate(context) {
  const folder = vscode.workspace.workspaceFolders?.find((f) =>
    vscode.workspace.getConfiguration("blu", f.uri).get("interfacesEnabled", true),
  );
  if (!folder || !vscode.workspace.isTrusted) return;
  const root = vscode.Uri.joinPath(folder.uri, "monitoring/runtime/code-editor-links");
  // A extensão só atua num checkout BLU e não noutros projetos do mesmo editor.
  try { await vscode.workspace.fs.stat(vscode.Uri.joinPath(folder.uri, "scripts/studio_urls.py")); }
  catch { return; }
  await vscode.workspace.fs.createDirectory(root);
  const write = (name, value) => vscode.workspace.fs.writeFile(
    vscode.Uri.joinPath(root, name), Buffer.from(JSON.stringify(value)),
  );
  const session = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const report = (error) => vscode.window.showErrorMessage(error instanceof Error ? error.message : "Não foi possível abrir as interfaces BLU.");
  context.subscriptions.push(
    vscode.commands.registerCommand("blu.openInterfaces", () => choose().catch(report)),
    vscode.commands.registerCommand("blu.forwardInterfaces", () => forward().catch(report)),
  );
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
  status.text = "$(globe) BLU · Interfaces";
  status.tooltip = "Abrir interfaces através do Code Editor deste workspace";
  status.command = "blu.openInterfaces";
  status.show();
  context.subscriptions.push(status);
  let lastRequest;
  let processing = false;
  async function handleRequest() {
    if (processing) return;
    processing = true;
    let request;
    try {
      const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(root, "request.json"));
      if (bytes.length > 1024) return;
      request = JSON.parse(Buffer.from(bytes).toString("utf8"));
      if (request.id === lastRequest || !/^[a-f0-9]{32}$/.test(request.id) ||
          !["open", "forward"].includes(request.action) ||
          (request.uiKind !== undefined && request.uiKind !== vscode.env.uiKind) ||
          Math.abs(Date.now() - request.at) > 30000) return;
      lastRequest = request.id;
      if (request.action === "open") await openAll();
      else await forward();
      await write("response.json", { id: request.id, ok: true, session, uiKind: vscode.env.uiKind });
    } catch {
      if (request?.id) await write("response.json", { id: request.id, ok: false, session, uiKind: vscode.env.uiKind });
    } finally { processing = false; }
  }
  const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, "monitoring/runtime/code-editor-links/request.json"));
  context.subscriptions.push(watcher, watcher.onDidCreate(handleRequest), watcher.onDidChange(handleRequest));
  // O runtime está excluído do Git e alguns hosts não notificam o watcher.
  // A sondagem curta garante a entrega sem depender dessas exclusões.
  const timer = setInterval(() => void handleRequest(), 500);
  timer.unref?.();
  context.subscriptions.push({ dispose: () => clearInterval(timer) });
  if (vscode.env.uiKind === 2) await forward().catch(report);
  const state = { session, at: Date.now(), uiKind: vscode.env.uiKind };
  await write(`session-${vscode.env.uiKind}.json`, state);
  await write("session.json", state);
  await handleRequest();
}
module.exports = { activate, forward, openAll };
