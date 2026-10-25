import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Políticas como código: cada verificação lê os ficheiros reais do projeto e devolve
// pass/fail com o motivo. config/policies.json liga cada regra à sua fonte legal.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => readFileSync(path.join(repo, file), 'utf8');
const result = (ok, detail) => ({ status: ok ? 'pass' : 'fail', detail });

export const checks = {
  aiDisclosure: () => {
    const opening = read('frontend/blu-cloud-site/src/App.jsx').match(/const opening = \{[^}]*text: "([^"]+)"/)?.[1] ?? '';
    return result(/\bAI\b/.test(opening), opening ? `Primeira mensagem: "${opening.slice(0, 90)}"` : 'Primeira mensagem do chat não encontrada.');
  },
  consentBeforeStorage: () => result(/body\.journeyConsent !== true/.test(read('infra/lambda/ingest/index.mjs')), 'infra/lambda/ingest recusa eventos sem journeyConsent=true.'),
  storageLimitation: () => {
    const days = Number(read('infra/aws-split-app.mjs').match(/id: 'ExpireRawSessionArchive', prefix: 'sessions\/', expiration: Duration\.days\((\d+)\)/)?.[1]);
    return result(days > 0 && days <= 90, Number.isFinite(days) ? `Arquivo de sessões expira em ${days} dias.` : 'Regra de expiração não encontrada.');
  },
  staffMfa: () => {
    const stack = read('infra/aws-split-app.mjs');
    return result(stack.includes('mfa: cognito.Mfa.REQUIRED') && stack.includes('selfSignUpEnabled: false'), 'User pool da intranet com MFA obrigatório e sem registo público.');
  },
  remindersRequireConsent: () => {
    const app = read('infra/lambda/intranet/app.mjs');
    return result(app.includes('travellerConsent: Boolean(lead.consentAt)') && app.includes('approvedBy: user.email'), 'Lembretes ao viajante dependem de consentAt e registam approvedBy.');
  },
  partnerLicensing: () => {
    const { partners } = JSON.parse(read('config/partners.json'));
    const unlicensed = partners.filter(partner => !partner.demo && !partner.license?.number).map(partner => partner.name);
    const enforced = read('infra/lambda/intranet/schedule.mjs').includes('partnerLicensed(');
    return result(!unlicensed.length && enforced, unlicensed.length ? `Sem licença: ${unlicensed.join(', ')}.` : `${partners.length} parceiro(s); o agendamento recusa parceiros reais sem licença.`);
  },
  complaintsBook: () => result(/livroreclamacoes\.pt/.test(read('frontend/blu-cloud-site/index.html')), 'Ligação ao Livro de Reclamações Eletrónico no rodapé.'),
  complaintsDeadline: () => {
    const cases = read('infra/lambda/intranet/cases.mjs');
    return result(cases.includes('LIVRO_WORKING_DAYS = 15') && cases.includes("if (type === 'livro' && deadline > legalDeadline) deadline = legalDeadline;"), 'Prazo do Livro de Reclamações fixado em 15 dias úteis e sem alargamento.');
  },
  noFinalPrices: () => result(/quote a final price/i.test(read('infra/lambda/chat/prompt.mjs')), 'O prompt do chat proíbe preços finais e disponibilidade.'),
  noTrackingCookies: () => {
    const sources = ['frontend/blu-cloud-site/index.html', 'frontend/blu-cloud-site/src/App.jsx', 'frontend/intranet/index.html', 'frontend/intranet/app.js'].map(read).join('\n');
    const found = ['googletagmanager', 'gtag(', 'fbq(', 'hotjar', 'document.cookie'].filter(marker => sources.includes(marker));
    return result(!found.length, found.length ? `Encontrado: ${found.join(', ')}.` : 'Sem analítica, píxeis nem cookies próprios.');
  },
  rnavtRegistration: config => {
    const number = config.company?.rnavt ?? '';
    const shown = number && read('frontend/blu-cloud-site/index.html').includes(number);
    return result(Boolean(number && shown), number ? (shown ? `RNAVT ${number} no rodapé.` : `RNAVT ${number} não aparece no rodapé.`) : 'Número RNAVT por preencher em config/policies.json.');
  },
  adrInformation: config => {
    const entity = config.company?.adrEntity ?? '';
    const shown = entity && read('frontend/blu-cloud-site/index.html').includes(entity);
    return result(Boolean(shown), entity ? (shown ? `Entidade de RAL indicada: ${entity}.` : `${entity} não aparece no site.`) : 'Entidade de RAL por escolher em config/policies.json.');
  },
};

/** Avalia todas as políticas; as manuais ficam a aguardar evidência humana. */
export function evaluatePolicies(config = JSON.parse(read('config/policies.json')), now = new Date()) {
  const results = config.policies.map(policy => {
    if (policy.enforcement !== 'automated') return { id: policy.id, status: 'manual', detail: 'Controlo manual: registar evidência na revisão trimestral.' };
    const check = checks[policy.check];
    if (!check) return { id: policy.id, status: 'fail', detail: `Verificação ${policy.check} não existe.` };
    try {
      return { id: policy.id, ...check(config) };
    } catch (error) {
      return { id: policy.id, status: 'fail', detail: `Erro na verificação: ${error.message}` };
    }
  });
  const byId = Object.fromEntries(results.map(item => [item.id, item]));
  const policies = config.policies.map(policy => ({ ...policy, result: byId[policy.id] }));
  return {
    evaluatedAt: now.toISOString(),
    note: config.note,
    summary: {
      pass: results.filter(item => item.status === 'pass').length,
      fail: results.filter(item => item.status === 'fail').length,
      manual: results.filter(item => item.status === 'manual').length,
      blockingFailures: policies.filter(policy => policy.severity === 'blocking' && policy.result.status === 'fail').map(policy => policy.id),
    },
    policies,
  };
}
