const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture(terminals = []) {
  const calls = [];
  const vscode = {
    TerminalLocation: { Panel: 1 },
    window: {
      terminals,
      createTerminal(options) {
        const terminal = { options, show: () => calls.push(['show', options.name]) };
        calls.push(['create', options]);
        this.terminals.push(terminal);
        return terminal;
      },
    },
    commands: { executeCommand: async command => calls.push(['command', command]) },
  };
  const context = { module: { exports: {} }, require(name) {
    if (name === 'vscode') return vscode;
    if (name === 'node:fs') return { constants: { X_OK: 1 }, accessSync() {} };
    return require(name);
  } };
  vm.runInNewContext(fs.readFileSync(`${__dirname}/extension.cjs`, 'utf8'), context);
  return { openSplit: context.module.exports.openSplit, calls, vscode };
}

test('O Bash de origem fica à esquerda e o Codex é um novo terminal', async () => {
  const bash = { processId: Promise.resolve(123), show() {} };
  const { openSplit, calls } = fixture([bash]);
  await openSplit('/tmp/repo com espaços', { parents: [999, 123], executable: '/tmp/bin/codex' }, {});
  const created = calls.filter(call => call[0] === 'create');
  assert.equal(created.length, 1);
  assert.equal(created[0][1].location.parentTerminal, bash);
  assert.equal(created[0][1].shellPath, '/tmp/bin/codex');
  assert.deepEqual(Array.from(created[0][1].shellArgs), ['-C', '/tmp/repo com espaços']);
  assert(calls.some(call => call[1] === 'workbench.action.positionPanelBottom'));
});

test('Sem Bash identificado, cria um novo par Bash e Codex', async () => {
  const { openSplit, calls } = fixture();
  await openSplit('/tmp/repo', { parents: [], executable: '/tmp/bin/codex' }, {});
  const created = calls.filter(call => call[0] === 'create');
  assert.equal(created.length, 2);
  assert.equal(created[0][1].shellPath, '/bin/bash');
  assert.equal(created[0][1].location, 1);
  assert.equal(created[1][1].location.parentTerminal.options, created[0][1]);
});

test('Pedidos repetidos revelam o Codex existente sem duplicar splits', async () => {
  const { openSplit, calls } = fixture();
  const state = {};
  const request = { executable: '/tmp/bin/codex' };
  await openSplit('/tmp/repo', request, state);
  await openSplit('/tmp/repo', request, state);
  assert.equal(calls.filter(call => call[0] === 'create').length, 2);
});

test('Fechar o terminal permite voltar a criar o Codex', async () => {
  const { openSplit, calls, vscode } = fixture();
  const state = {};
  await openSplit('/tmp/repo', { executable: '/tmp/bin/codex' }, state);
  vscode.window.terminals.splice(0);
  await openSplit('/tmp/repo', { executable: '/tmp/bin/codex' }, state);
  assert.equal(calls.filter(call => call[0] === 'create').length, 4);
});

test('Não executa comandos de shell recebidos como nome do executável', async () => {
  const { openSplit, calls } = fixture();
  await assert.rejects(openSplit('/tmp/repo', { executable: 'codex; echo teste' }, {}));
  assert.equal(calls.length, 0);
});
