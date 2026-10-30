// Agenda de recolhas e excursões. O curador aprova a atividade e os lembretes; cada
// lembrete fica como registo NOTIFY# no perfil da conversa e é enviado à hora marcada.
// Reutiliza FollowUpIndex (estado NOTIFY_*, data de envio em followUpAt), sem nova tabela;
// a lista de leads só consulta PENDING, QUEUED_FOR_REVIEW e CONTACTED.
export const NOTIFY = { pending: 'NOTIFY_PENDING', sending: 'NOTIFY_SENDING', sent: 'NOTIFY_SENT', prepared: 'NOTIFY_PREPARED', failed: 'NOTIFY_FAILED', missed: 'NOTIFY_MISSED', cancelled: 'NOTIFY_CANCELLED' };
export const KINDS = { pickup: 'Recolha', excursion: 'Excursão' };
export const BOLT = 'bolt';
export const MAX_DAYS = 31;
export const TIME_ZONE = 'Europe/Lisbon';

// Lembretes disponíveis: "evening" é na véspera às 18:00; "after" é o pedido de avaliação, uma vez
// por atividade, no dia seguinte ao último dia às 10:00; os restantes são minutos antes.
export const REMINDERS = [
  { id: 'traveller-evening', audience: 'traveller', evening: true, label: 'Viajante: véspera às 18:00' },
  { id: 'traveller-1h', audience: 'traveller', minutes: 60, label: 'Viajante: 1 h antes' },
  { id: 'partner-evening', audience: 'partner', evening: true, label: 'Parceiro: véspera às 18:00' },
  { id: 'partner-2h', audience: 'partner', minutes: 120, label: 'Parceiro: 2 h antes' },
  { id: 'traveller-rating', audience: 'traveller', after: '10:00', label: 'Viajante: pedir avaliação no dia seguinte às 10:00' },
];
export const DEFAULT_REMINDERS = REMINDERS.map(reminder => reminder.id);
// Canais por destinatário: o parceiro recebe por WhatsApp ou SMS; o viajante também por email (SES).
export const CHANNELS = { whatsapp: 'WhatsApp', sms: 'SMS', email: 'Email' };
const TRAVELLER_CHANNELS = ['whatsapp', 'sms', 'email'];
const PARTNER_CHANNELS = ['whatsapp', 'sms'];

/** Parceiros reais precisam de licença (RNAAT, TVDE ou alvará); os de demonstração não enviam nada. */
export const partnerLicensed = partner => Boolean(partner?.demo || partner?.license?.number);

const text = (value, maximum) => (typeof value === 'string' ? value.trim().slice(0, maximum) : '');

/** Converte data e hora de Lisboa para UTC, respeitando a hora de verão. */
export function lisbonToUtc(date, time) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const offsetAt = instant => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(instant)).map(part => [part.type, part.value]));
    return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute) - instant;
  };
  const first = guess - offsetAt(guess);
  return new Date(guess - offsetAt(first));
}

const addDays = (date, days) => new Date(Date.UTC(...date.split('-').map((n, i) => (i === 1 ? n - 1 : +n))) + days * 864e5).toISOString().slice(0, 10);
const lisbonLabel = instant => new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(instant);
const lisbonLabelPt = instant => new Intl.DateTimeFormat('pt-PT', { timeZone: TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(instant);

/** Valida o pedido do curador; devolve { activity } ou { error }. */
export function parseActivity(body, partners, now = new Date()) {
  const kind = KINDS[body.kind] ? body.kind : '';
  const title = text(body.title, 120);
  const place = text(body.place, 200);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date ?? '') ? body.date : '';
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(body.time ?? '') ? body.time : '';
  const until = body.repeatUntil ? (/^\d{4}-\d{2}-\d{2}$/.test(body.repeatUntil) ? body.repeatUntil : null) : date;
  const people = Number.parseInt(body.people, 10);
  const partnerId = body.partnerId === BOLT ? BOLT : partners.find(partner => partner.id === body.partnerId)?.id ?? '';
  const reminders = Array.isArray(body.reminders) ? REMINDERS.map(r => r.id).filter(id => body.reminders.includes(id)) : DEFAULT_REMINDERS;
  if (!kind) return { error: 'Escolha recolha ou excursão.' };
  if (!title) return { error: 'Indique um título.' };
  if (!place) return { error: 'Indique o local de encontro.' };
  if (!date || !time) return { error: 'Indique data e hora.' };
  if (until === null || until < date) return { error: 'A repetição tem de terminar na data de início ou depois.' };
  const days = Math.round((Date.parse(until) - Date.parse(date)) / 864e5) + 1;
  if (days > MAX_DAYS) return { error: `A repetição diária vai até ${MAX_DAYS} dias.` };
  if (!(people >= 1 && people <= 30)) return { error: 'Indique entre 1 e 30 pessoas.' };
  if (body.partnerId && !partnerId) return { error: 'Parceiro desconhecido.' };
  if (partnerId && partnerId !== BOLT && !partnerLicensed(partners.find(partner => partner.id === partnerId))) return { error: 'Este parceiro não tem licença registada e não pode receber serviços.' };
  if (lisbonToUtc(until, time) <= now) return { error: 'A atividade já passou.' };
  const travellerChannel = TRAVELLER_CHANNELS.includes(body.travellerChannel) ? body.travellerChannel : 'whatsapp';
  const partnerChannel = PARTNER_CHANNELS.includes(body.partnerChannel) ? body.partnerChannel : 'whatsapp';
  return { activity: { kind, title, place, date, time, repeatUntil: until, days, people, partnerId, reminders, travellerChannel, partnerChannel, notes: text(body.notes, 500) } };
}

function messageFor(audience, activity, startsAt, partner) {
  const when = audience === 'partner' ? lisbonLabelPt(startsAt) : lisbonLabel(startsAt);
  const group = `${activity.people} ${activity.people === 1 ? 'person' : 'people'}`;
  if (audience === 'partner') {
    return `BLU Costa: ${KINDS[activity.kind].toLowerCase()} "${activity.title}" em ${activity.place}, ${when}, ${activity.people} pessoa(s).${activity.notes ? ` Nota: ${activity.notes}` : ''} Responda OK para confirmar.`;
  }
  const what = activity.kind === 'pickup' ? `pickup "${activity.title}"` : `excursion "${activity.title}"`;
  if (activity.partnerId === BOLT) return `BLU Costa reminder: your ${what} at ${activity.place}, ${when}, ${group}. Please book a Bolt ride to arrive on time: https://bolt.eu/`;
  return `BLU Costa reminder: your ${what} at ${activity.place}, ${when}, ${group}.${partner ? ` ${partner.name} will meet you there.` : ''}`;
}

/**
 * Gera os lembretes de todas as ocorrências diárias. Lembretes já passados são ignorados;
 * sem número de telefone o lembrete fica registado e é marcado como preparado no envio.
 */
export function plan(activity, { activityId, travellerPhone, travellerEmail = '', partner, travellerConsent = true, now = new Date() }) {
  const notifications = [];
  for (let day = 0; day < activity.days; day += 1) {
    const date = addDays(activity.date, day);
    const startsAt = lisbonToUtc(date, activity.time);
    for (const reminder of REMINDERS.filter(r => activity.reminders.includes(r.id))) {
      if (reminder.after) continue;
      if (reminder.audience === 'partner' && (activity.partnerId === BOLT || !activity.partnerId)) continue;
      if (reminder.audience === 'traveller' && !travellerConsent) continue;
      const sendAt = reminder.evening ? lisbonToUtc(addDays(date, -1), '18:00') : new Date(startsAt - reminder.minutes * 6e4);
      if (sendAt <= now) continue;
      notifications.push({
        recordKey: `NOTIFY#${sendAt.toISOString()}#${activityId}#${day}-${reminder.id}`,
        activityId, reminder: reminder.id, audience: reminder.audience, occurrenceAt: startsAt.toISOString(), sendAt: sendAt.toISOString(),
        channel: reminder.audience === 'partner' ? activity.partnerChannel : activity.travellerChannel,
        to: reminder.audience === 'partner' ? partner?.whatsapp ?? '' : activity.travellerChannel === 'email' ? travellerEmail : travellerPhone ?? '',
        text: messageFor(reminder.audience, activity, startsAt, partner),
      });
    }
  }
  // Pedido de avaliação: uma vez, no dia seguinte ao último dia, só com consentimento.
  const rating = REMINDERS.find(r => r.after && activity.reminders.includes(r.id));
  if (rating && travellerConsent) {
    const last = activity.repeatUntil || activity.date;
    const sendAt = lisbonToUtc(addDays(last, 1), rating.after);
    if (sendAt > now) {
      notifications.push({
        recordKey: `NOTIFY#${sendAt.toISOString()}#${activityId}#rating`,
        activityId, reminder: rating.id, audience: 'traveller', occurrenceAt: lisbonToUtc(last, activity.time).toISOString(), sendAt: sendAt.toISOString(),
        channel: activity.travellerChannel,
        to: activity.travellerChannel === 'email' ? travellerEmail : travellerPhone ?? '',
        text: ratingMessage(activity, partner),
      });
    }
  }
  return notifications;
}

// Pedido de avaliação ao viajante (em inglês, como os outros lembretes ao viajante): três perguntas
// curtas — o transfer, o melhor e o pior (sem detalhe) e o NPS, de 0 a 10. A resposta chega à caixa de WhatsApp (ou ao email) e regista-se em
// «Registar resultado» na Agenda; o NPS de cada parceiro aparece em Parceiros.
function ratingMessage(activity, partner) {
  const what = activity.kind === 'pickup' ? `pickup "${activity.title}"` : `excursion "${activity.title}"`;
  const withWhom = partner && activity.partnerId !== BOLT ? ` with ${partner.name}` : '';
  return `BLU Costa: thank you for travelling with us! Three quick questions about your ${what}${withWhom}:
1) Was your transfer OK? (yes/no)
2) Best and worst part: transfer, accommodation, food or guide?
3) How likely are you to recommend BLU Costa to a friend, from 0 (not at all) to 10 (extremely likely)?
Reply STOP to stop these messages.`;
}

/** Decide o estado depois de uma tentativa de envio. */
export function outcome({ to, error, late }) {
  if (late) return { status: NOTIFY.missed, reason: 'Mais de 6 h de atraso; não enviado.' };
  if (!to) return { status: NOTIFY.prepared, reason: 'Sem contacto para este canal; enviar manualmente.' };
  if (!error) return { status: NOTIFY.sent };
  if (/not configured/i.test(error)) return { status: NOTIFY.prepared, reason: 'Canal por configurar; mensagem preparada para envio manual.' };
  return { status: NOTIFY.failed, reason: 'Falha no envio.' };
}

export const digitsOnly = phone => (phone ?? '').replace(/\D/g, '');
