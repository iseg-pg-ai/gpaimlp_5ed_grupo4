const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const vm = require('node:vm');
function load(vscode, extra = {}) {
  const context={module:{exports:{}},Buffer,setInterval,clearInterval,...extra,require(name){if(name==='./interfaces.json')return JSON.parse(readFileSync(`${__dirname}/../../config/workspace_interfaces.json`,'utf8'));assert.equal(name,'vscode');return vscode;}};
  vm.runInNewContext(readFileSync(`${__dirname}/extension.cjs`,'utf8'),context);
  return context.module.exports;
}
test('regista as cinco portas na sessão atual, sem reutilizar URLs anteriores',async()=>{
 const calls=[];
 let workspace='primeiro';
 const extension=load({Uri:{parse:value=>value},env:{asExternalUri:async uri=>{calls.push([workspace,uri]);return `https://${workspace}.test/forwarded`;}}});
 await extension.forward();
 workspace='segundo';
 await extension.forward();
 assert.equal(calls.length,10);
 assert.ok(calls.slice(0,5).every(([name])=>name==='primeiro'));
 assert.ok(calls.slice(5).every(([name])=>name==='segundo'));
 assert.deepEqual(calls.slice(5).map(([,uri])=>new URL(uri).port),['3001','5173','3003','3004','8501']);
});
test('abre pela API nativa, que resolve automaticamente o encaminhamento',async()=>{
 const calls=[];
 const extension=load({Uri:{parse:value=>value},env:{openExternal:async uri=>{calls.push(uri);return true;},asExternalUri:()=>{throw new Error('dupla resolução');}}});
 await extension.openAll();
 assert.equal(calls.length,5);
 assert.ok(calls.every(uri=>new URL(uri).hostname==='127.0.0.1'));
});
test('uma falha de abertura não é anunciada como sucesso',async()=>{
 const extension=load({Uri:{parse:value=>value},env:{openExternal:async()=>false}});
 await assert.rejects(extension.openAll(),/Não foi possível abrir/);
});

test('pedidos são confirmados mesmo quando o watcher do editor ignora o runtime',async()=>{
 const files=new Map();
 let tick;
 const opened=[];
 const disposable={dispose(){}};
 const vscode={
  Uri:{parse:value=>value,joinPath:(...parts)=>parts.join('/')},
  StatusBarAlignment:{Left:1},RelativePattern:class{},
  env:{uiKind:2,asExternalUri:async uri=>uri,openExternal:async uri=>{opened.push(uri);return true;}},
  commands:{registerCommand:()=>disposable},
  window:{createStatusBarItem:()=>({show(){},dispose(){}}),showErrorMessage:()=>{}},
  workspace:{workspaceFolders:[{uri:'/workspace'}],isTrusted:true,
   getConfiguration:()=>({get:()=>true}),
   fs:{stat:async()=>({}),createDirectory:async()=>{},writeFile:async(uri,data)=>files.set(uri,Buffer.from(data)),readFile:async uri=>{if(!files.has(uri))throw new Error('absent');return files.get(uri);}},
   createFileSystemWatcher:()=>({dispose(){},onDidCreate:()=>disposable,onDidChange:()=>disposable}),
  },
 };
 const extension=load(vscode,{setInterval:callback=>{tick=callback;return {unref(){}};},clearInterval:()=>{}});
 await extension.activate({subscriptions:[]});
 const root='/workspace/monitoring/runtime/code-editor-links';
 files.set(`${root}/request.json`,Buffer.from(JSON.stringify({id:'a'.repeat(32),action:'open',at:Date.now()})));
 tick();
 await new Promise(setImmediate);
 const response=JSON.parse(files.get(`${root}/response.json`));
 assert.equal(response.id,'a'.repeat(32));
 assert.equal(response.ok,true);
 assert.equal(opened.length,5);
});

test('o túnel SSH não é anunciado como encaminhamento HTTPS SageMaker',async()=>{
 const extension=load({env:{uiKind:1,asExternalUri:async()=>{throw new Error('não deve encaminhar');}}});
 await assert.rejects(extension.forward(),/não na sessão SSH/);
});
