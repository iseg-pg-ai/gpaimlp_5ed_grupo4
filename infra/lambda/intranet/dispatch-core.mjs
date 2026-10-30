import { NOTIFY, outcome } from './schedule.mjs';
import { contactDetails, toLead, toMessage } from './model.mjs';
import { AUTO_ASSIGN, NUDGE_DAYS, autoMessages, currentSettings } from './settings.mjs';
import { toCase, toNotification, toTask } from './app.mjs';
import { alertRecord, autoAssignments, teamAlerts } from './team-alerts.mjs';
import { FEED } from './tasks.mjs';
import { ANALYSIS, needsAnalysis, parseSignals, profileFields, signalPrompt } from './signals.mjs';

/**
 * Prepara as mensagens automáticas ligadas nas definições (agradecimento, reativação) como
 * lembretes NOTIFY# normais, que o envio abaixo trata como os outros. Desligadas, não faz nada.
 */
export function createPlanner(deps) {
  return async function planAuto() {
    const now = deps.now?.() ?? new Date();
    const settings = await deps.settings();
    if (!settings.auto.thanks && !settings.auto.nudge) return 0;
    const leads = (await deps.leads()).map(toLead).filter(lead => lead.consentAt && !lead.synthetic);
    const candidates = leads.filter(lead => settings.auto.thanks || (lead.status === 'CONTACTED' && now - Date.parse(lead.lastActivityAt) >= NUDGE_DAYS * 864e5));
    let created = 0;
    for (const lead of candidates) {
      const existing = new Set(await deps.autoKeys(lead.id));
      const messages = (await deps.transcript(lead.id)).map(toMessage);
      for (const record of autoMessages(lead, messages, contactDetails(messages), settings, existing, now)) {
        if (await deps.create(lead.id, { ...record, followUpStatus: NOTIFY.pending, followUpAt: record.sendAt, createdAt: now.toISOString() })) created += 1;
      }
    }
    return created;
  };
}

const LATE_MS = 6 * 36e5;
const s = (item, key) => item[key]?.S ?? '';

/**
 * Envia os lembretes vencidos. Cada lembrete é primeiro "reservado" (PENDING → SENDING)
 * com condição, para que duas execuções sobrepostas nunca enviem a mesma mensagem.
 */
export function createDispatcher(deps) {
  return async function dispatch() {
    const now = deps.now?.() ?? new Date();
    const due = await deps.queryDue(now.toISOString());
    const results = [];
    for (const item of due) {
      const id = s(item, 'conversationId');
      const recordKey = s(item, 'recordKey');
      if (!(await deps.claim(id, recordKey))) continue;
      const to = s(item, 'to');
      const late = now - new Date(s(item, 'followUpAt')) > LATE_MS;
      let error = '';
      // "test-inbox" quando o WhatsApp está em modo de teste: entregue só na caixa de teste.
      let delivery = '';
      if (to && !late) {
        try {
          delivery = (await deps.send({ channel: s(item, 'channel') || 'whatsapp', to, text: s(item, 'text'), title: s(item, 'title'), conversationId: id, requestId: deps.requestIdFor(recordKey), approvedBy: s(item, 'approvedBy') || 'curator-schedule' }))?.delivery ?? '';
        } catch (failure) {
          error = String(failure?.message ?? 'Error');
        }
      }
      const result = outcome({ to, error, late });
      const sent = result.status === NOTIFY.sent ? { sentAt: now.toISOString(), ...(delivery ? { delivery } : {}) } : {};
      await deps.finish(id, recordKey, { followUpStatus: result.status, attemptedAt: now.toISOString(), ...(result.reason ? { reason: result.reason } : {}), ...sent });
      results.push({ recordKey, audience: s(item, 'audience'), channel: s(item, 'channel') || 'whatsapp', status: result.status, ...(sent.delivery ? { delivery } : {}) });
    }
    if (results.length) await deps.evidence(now, results);
    return { checkedAt: now.toISOString(), due: due.length, processed: results.length, sent: results.filter(r => r.status === NOTIFY.sent).length };
  };
}

/**
 * Atribuição automática (ligada nas Regras de seguimento): grava o responsável só se o lead
 * continuar como estava (condição), para nunca tirar um lead a quem o assumiu entretanto.
 * Cada atribuição fica no feed da equipa; o aviso à pessoa sai nos alertas a seguir.
 */
export function createAssigner(deps) {
  return async function autoAssign() {
    const now = deps.now?.() ?? new Date();
    if (!currentSettings(await deps.settings()).autoAssign) return { assigned: 0 };
    const [leads, members] = await Promise.all([deps.leads(), deps.listTeam()]);
    const names = Object.fromEntries(members.map(member => [member.email.toLowerCase(), member.name]));
    const at = now.toISOString();
    let assigned = 0;
    for (const { leadId, to, previous } of autoAssignments({ leads: leads.map(toLead), members, now })) {
      if (!(await deps.assign(leadId, { assignedTo: to, assignedAt: at, assignedBy: AUTO_ASSIGN.by, updatedAt: at }, previous))) continue;
      assigned += 1;
      await deps.feed({ recordKey: `FEED#${at}#${leadId}`, followUpStatus: FEED.status, followUpAt: at, text: `atribuiu o lead ${leadId} a ${names[to] ?? to} (sem responsável há ${AUTO_ASSIGN.minutes / 60} h)`, by: AUTO_ASSIGN.by, byName: 'Atribuição automática' })
        .catch(error => console.error(JSON.stringify({ feed: 'not-recorded', error: error?.name ?? 'Error' })));
    }
    return { assigned };
  };
}

const lisbonDay = now => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(now);

/**
 * Alertas à equipa: junta leads, tarefas, casos e lembretes falhados, grava cada alerta novo
 * uma única vez (criação condicional) e envia-o por email quando o canal está configurado.
 * Sem email, o alerta fica na intranet («O meu trabalho» e Painel). Uma falha de envio não
 * apaga o alerta: fica marcado para a equipa ver.
 */
export function createAlerter(deps) {
  return async function raiseAlerts() {
    const now = deps.now?.() ?? new Date();
    const today = lisbonDay(now);
    const since = new Date(now - 864e5).toISOString();
    const [settingsItems, leads, taskItems, caseItems, failed, missed, members] = await Promise.all([
      deps.settings(), deps.leads(), deps.queryStatus('TASK_OPEN'), deps.queryStatus('CASE_OPEN'),
      deps.queryAgenda(NOTIFY.failed, since, now.toISOString()), deps.queryAgenda(NOTIFY.missed, since, now.toISOString()), deps.listTeam(),
    ]);
    const alerts = teamAlerts({
      leads: leads.map(toLead),
      tasks: taskItems.map(item => toTask(item, today)),
      cases: caseItems.map(item => toCase(item, today)),
      reminders: [...failed, ...missed].map(toNotification),
      members, replyHours: currentSettings(settingsItems).replyHours, now,
    });
    let raised = 0;
    let emailed = 0;
    for (const alert of alerts) {
      const delivery = deps.emailEnabled && alert.to.length ? 'email' : 'in-app';
      if (!(await deps.create(alertRecord(alert, delivery)))) continue;
      raised += 1;
      if (delivery !== 'email') continue;
      try {
        await deps.sendAlert(alert);
        emailed += 1;
      } catch (error) {
        console.error(JSON.stringify({ alert: 'email-failed', error: error?.name ?? 'Error' }));
        await deps.markAlert(alert.key, 'email-failed');
      }
    }
    return { alerts: alerts.length, raised, emailed, withoutRecipient: alerts.filter(alert => !alert.to.length).length };
  };
}

/**
 * Análise automática das conversas paradas com mensagens novas (no máximo ANALYSIS.perRun por execução,
 * as mais recentes primeiro). O modelo só classifica; a validação decide o que fica gravado.
 * Uma resposta inválida ou um erro do modelo ficam como «falhou» até à próxima mensagem do cliente.
 */
export function createAnalyser(deps) {
  return async function analyse() {
    const now = deps.now?.() ?? new Date();
    const leads = (await deps.leads()).map(toLead).filter(lead => needsAnalysis(lead, now))
      .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt)).slice(0, ANALYSIS.perRun);
    let analysed = 0;
    let failed = 0;
    for (const lead of leads) {
      const prompt = signalPrompt((await deps.transcript(lead.id)).map(toMessage).sort((a, b) => a.at.localeCompare(b.at)));
      if (!prompt.customerIds.length) continue;
      let result = null;
      try {
        result = parseSignals(await deps.classify(prompt), prompt.customerIds, prompt.ids);
      } catch (error) {
        console.error(JSON.stringify({ analysis: 'model-failed', error: error?.name ?? 'Error' }));
      }
      // O risco antigo só se mantém se ainda ninguém contactou o cliente depois dele.
      const previousRiskAt = lead.aiRiskAt && lead.aiRiskAt > (lead.contactedAt ?? '') ? lead.aiRiskAt : '';
      await deps.saveAnalysis(lead.id, profileFields(result, { now, modelId: deps.modelId, previousRiskAt }));
      if (result) analysed += 1; else failed += 1;
    }
    return { analysed, failed };
  };
}
