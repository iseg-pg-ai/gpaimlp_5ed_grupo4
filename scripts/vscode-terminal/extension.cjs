const vscode = require('vscode');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');

// Apenas uma operação local: criar/revelar um terminal, sem enviar pedidos à IA.
async function openSplit(root, request, state) {
  if (state.codex && vscode.window.terminals.includes(state.codex)) {
    state.codex.show();
    return;
  }
  if (!path.isAbsolute(request.executable || '') || path.basename(request.executable) !== 'codex') {
    throw new Error('Executável Codex inválido.');
  }
  fs.accessSync(request.executable, fs.constants.X_OK);
  const parents = Array.isArray(request.parents) ? request.parents : [];
  const terminals = await Promise.all(vscode.window.terminals.map(async terminal => ({
    terminal, pid: await terminal.processId,
  })));
  let bash = terminals.find(item => parents.includes(item.pid))?.terminal;
  // Sem terminal de origem identificável, criar um novo par no painel.
  if (!bash) {
    bash = vscode.window.createTerminal({ name: 'BLU · Bash', cwd: root,
      shellPath: '/bin/bash', location: vscode.TerminalLocation.Panel });
  }
  bash.show();
  await vscode.commands.executeCommand('workbench.action.positionPanelBottom');
  state.codex = vscode.window.createTerminal({
    name: 'BLU · Codex', cwd: root, shellPath: request.executable,
    shellArgs: ['-C', root], location: { parentTerminal: bash },
  });
  state.codex.show();
}

function activate(context) {
  for (const folder of vscode.workspace.workspaceFolders || []) {
    const root = folder.uri.fsPath;
    if (!fs.existsSync(path.join(root, 'scripts/just_blu_it.sh'))) continue;
    const runtime = path.join(root, 'monitoring/runtime');
    fs.mkdirSync(runtime, { recursive: true });
    // Socket numa pasta privada; nenhum serviço de rede ou comando remoto exposto.
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'blu-vscode-'));
    fs.chmodSync(directory, 0o700);
    const socketPath = path.join(directory, 'terminal.sock');
    const discovery = path.join(runtime, 'editor-terminal.json');
    const state = {};
    let pending = Promise.resolve();
    const server = net.createServer(socket => {
      socket.setTimeout(5000, () => socket.destroy());
      let data = '';
      socket.on('error', () => {});
      socket.on('data', chunk => {
        data += chunk.toString();
        if (data.length > 8192) { socket.destroy(); return; }
        if (!data.includes('\n')) return;
        socket.pause();
        // Serializar pedidos para evitar criar dois splits em simultâneo.
        pending = pending.then(async () => {
          try {
            await openSplit(root, JSON.parse(data.split('\n')[0]), state);
            socket.end(JSON.stringify({ ok: true }) + '\n');
          } catch {
            socket.end(JSON.stringify({ ok: false }) + '\n');
          }
        });
      });
    });
    server.on('error', error => {
      vscode.window.showWarningMessage(`BLU: integração de terminal indisponível (${error.code || 'erro'}).`);
    });
    server.listen(socketPath, () => {
      fs.chmodSync(socketPath, 0o600);
      fs.writeFileSync(discovery, JSON.stringify({ socket: socketPath }), { mode: 0o600 });
    });
    context.subscriptions.push({ dispose() {
      server.close();
      try {
        if (JSON.parse(fs.readFileSync(discovery, 'utf8')).socket === socketPath) fs.unlinkSync(discovery);
      } catch { /* Outra janela pode já ter publicado o seu socket. */ }
      fs.rmSync(directory, { recursive: true, force: true });
    } });
  }
}

module.exports = { activate, openSplit };
