// Verificação do que está publicado, para correr depois de cada deploy (a partir de infra/):
//   node scripts/live-check.mjs            só lê
//   node scripts/live-check.mjs --seed     também cria o lead de demonstração e a recolha de amanhã
// Usa a AWS CLI com AWS_PROFILE (por omissão blu-costa-admin) e AWS_REGION (eu-west-1).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEMO, SITE_FILES, STACKS, apiEvent, demoActivity, demoMessages, demoProfile, demoScheduled, fileMismatches, summary } from './live-check-core.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const profile = process.env.AWS_PROFILE ?? 'blu-costa-admin';
const region = process.env.AWS_REGION ?? 'eu-west-1';
const seed = process.argv.includes('--seed');
const work = mkdtempSync(path.join(tmpdir(), 'blu-live-'));
const aws = (...args) => JSON.parse(execFileSync('aws', [...args, '--profile', profile, '--region', region, '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) || 'null');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
const results = [];
const check = async (name, fn) => {
  try {
    const outcome = await fn();
    results.push({ name, ok: outcome?.ok ?? true, detail: outcome?.detail ?? '' });
  } catch (error) {
    results.push({ name, ok: false, detail: String(error?.stderr || error?.message || error).split('\n')[0].slice(0, 200) });
  }
};
const status = async (url, init) => (await fetch(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(45000) })).status;

const outputs = {};
await check('stacks CloudFormation', () => {
  const bad = [];
  for (const name of STACKS) {
    const [stack] = aws('cloudformation', 'describe-stacks', '--stack-name', name).Stacks;
    for (const output of stack.Outputs ?? []) outputs[output.OutputKey] = output.OutputValue;
    if (!/_COMPLETE$/.test(stack.StackStatus) || /ROLLBACK/.test(stack.StackStatus)) bad.push(`${name} ${stack.StackStatus}`);
  }
  return bad.length ? { ok: false, detail: bad.join(', ') } : { detail: `${STACKS.length} estáveis` };
});

await check('alterações por guardar', () => {
  const dirty = git('status', '--porcelain', '--', 'frontend/intranet', 'infra', 'dmc-workspace').trim();
  return dirty ? { ok: 'warn', detail: 'há ficheiros alterados sem commit: o que está publicado pode não estar no Git' } : { detail: 'nada por guardar' };
});

const committed = Object.fromEntries(SITE_FILES.map(name => [name, git('show', `HEAD:frontend/intranet/${name}`)]));
for (const [label, key] of [['intranet', 'IntranetUrl'], ['backoffice', 'BackofficeUrl']]) {
  await check(`site ${label} igual ao Git (HEAD)`, async () => {
    const base = outputs[key];
    if (!base) return { ok: false, detail: `sem ${key}` };
    const live = Object.fromEntries(await Promise.all(SITE_FILES.map(async name => [name, await (await fetch(new URL(name, base), { cache: 'no-store', signal: AbortSignal.timeout(30000) })).text()])));
    const differ = fileMismatches(live, committed);
    return differ.length ? { ok: false, detail: `diferentes: ${differ.join(', ')}` } : { detail: base };
  });
}

await check('API da intranet recusa pedidos sem login', async () => {
  const code = await status(new URL('/v1/me', outputs.IntranetApiUrl));
  return code === 401 ? { detail: '401' } : { ok: false, detail: `respondeu ${code}` };
});

await check('portal responde (login da equipa)', async () => {
  const code = await status(outputs.PortalUrl);
  if (code === 401 || code === 302 || code === 200) return { detail: String(code) };
  return code === 503 ? { ok: 'warn', detail: 'página «a acordar»: o servidor está a ligar' } : { ok: false, detail: `respondeu ${code}` };
});

// Invocação direta da Lambda da API com o utilizador técnico (sem passar pelo login).
const handlerName = () => aws('cloudformation', 'describe-stack-resources', '--stack-name', 'BluCostaIntranet').StackResources
  .find(item => item.ResourceType === 'AWS::Lambda::Function' && item.LogicalResourceId.startsWith('IntranetApiHandler')).PhysicalResourceId;
let fn = '';
const invoke = (routeKey, options) => {
  fn ||= handlerName();
  const payload = path.join(work, 'event.json');
  const out = path.join(work, 'out.json');
  writeFileSync(payload, JSON.stringify(apiEvent(routeKey, options)));
  aws('lambda', 'invoke', '--function-name', fn, '--cli-binary-format', 'raw-in-base64-out', '--payload', `fileb://${payload}`, out);
  const response = JSON.parse(readFileSync(out, 'utf8'));
  return { statusCode: response.statusCode, body: response.body ? JSON.parse(response.body) : null };
};

if (seed) {
  await check('lead de demonstração', () => {
    const tables = aws('cloudformation', 'describe-stack-resources', '--stack-name', 'BluCostaData').StackResources.filter(item => item.ResourceType === 'AWS::DynamoDB::Table').map(item => item.PhysicalResourceId);
    const intelligence = tables.find(name => name.includes('CustomerIntelligence'));
    const messages = tables.find(name => name.includes('ConversationMessages'));
    const now = new Date();
    const put = (table, item, condition) => {
      try {
        execFileSync('aws', ['dynamodb', 'put-item', '--table-name', table, '--item', JSON.stringify(item), '--condition-expression', condition, '--profile', profile, '--region', region], { stdio: ['ignore', 'pipe', 'pipe'] });
        return 1;
      } catch (error) {
        if (String(error.stderr).includes('ConditionalCheckFailed')) return 0;
        throw error;
      }
    };
    // Só cria o que falta: nunca altera o lead de demonstração se já existir.
    const created = put(intelligence, demoProfile(now), 'attribute_not_exists(conversationId)')
      + demoMessages(now).reduce((sum, item) => sum + put(messages, item, 'attribute_not_exists(occurredAtId)'), 0);
    return { detail: created ? `${created} registo(s) criados` : 'já existia' };
  });
  await check('recolha de demonstração amanhã', () => {
    const agenda = invoke('GET /v1/agenda', { query: { days: '3' } });
    if (demoScheduled(agenda.body?.notifications ?? [], new Date())) return { detail: 'já agendada' };
    const created = invoke('POST /v1/leads/{id}/activities', { pathParameters: { id: DEMO.leadId }, body: demoActivity(new Date()) });
    return created.statusCode === 201 ? { detail: `agendada (${created.body.notifications} lembrete)` } : { ok: false, detail: `${created.statusCode} ${created.body?.error ?? ''}` };
  });
}

await check('Agenda mostra a recolha de demonstração', () => {
  const agenda = invoke('GET /v1/agenda', { query: { days: '3' } });
  if (agenda.statusCode !== 200) return { ok: false, detail: `respondeu ${agenda.statusCode}` };
  return demoScheduled(agenda.body.notifications, new Date()) ? { detail: `${agenda.body.notifications.length} lembrete(s) nos próximos dias` } : { ok: false, detail: 'sem a recolha de demonstração (correr com --seed)' };
});
for (const [name, routeKey, query] of [['Seguimento', 'GET /v1/leads', { status: 'all' }], ['Alertas', 'GET /v1/alerts'], ['O meu trabalho', 'GET /v1/work'], ['Painel', 'GET /v1/metrics']]) {
  await check(`${name} responde`, () => {
    const response = invoke(routeKey, { query });
    if (response.statusCode !== 200) return { ok: false, detail: `respondeu ${response.statusCode}` };
    if (routeKey === 'GET /v1/leads') return response.body.leads.some(lead => lead.id === DEMO.leadId) ? { detail: `${response.body.leads.length} lead(s), com o de demonstração` } : { ok: 'warn', detail: 'sem o lead de demonstração' };
    if (routeKey === 'GET /v1/alerts') return { detail: `${response.body.alerts.length} alerta(s)` };
    return {};
  });
}

rmSync(work, { recursive: true, force: true });
const result = summary(results);
console.log(result.lines.join('\n'));
console.log(result.ok ? `\nTudo certo${result.warned ? ` (${result.warned} aviso(s))` : ''}.` : `\n${result.failed} verificação(ões) falharam.`);
process.exitCode = result.ok ? 0 : 1;
