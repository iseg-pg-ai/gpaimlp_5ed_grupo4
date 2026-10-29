// Gera interações fictícias para ensaios; a publicação nos endpoints tem efeitos externos
// reais.
import { randomUUID } from 'node:crypto';

const eventsEndpoint = process.env.CONVERSATION_EVENTS_ENDPOINT;
const chatEndpoint = process.env.BLU_CHAT_API;
if (!eventsEndpoint) throw new Error('Set CONVERSATION_EVENTS_ENDPOINT to the deployed endpoint');

const scenarios = [
  ['Lisbon family', ['We are four people visiting Lisbon in October 2027.', 'We enjoy history, food and an easy pace.', 'Our day budget is around EUR 1500.']],
  ['Douro couple', ['We are a couple considering Porto and the Douro next May.', 'Wine, river landscapes and local craft matter to us.', 'We expect to spend EUR 2200 for a private day.']],
  ['Accessible Sintra', ['Two adults would like Sintra in September 2027.', 'One traveller has limited mobility and we need a calm pace.', 'Our budget range is EUR 1200 to 1800.']],
];

async function publish(conversationId, message, actor) {
  const response = await fetch(eventsEndpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ journeyConsent: true, analyticsConsent: true, conversationId, synthetic: true, source: 'synthetic-pipeline-validation', message: { actor, channel: 'synthetic', text: message } }) });
  if (!response.ok) throw new Error(`Event ingestion failed with ${response.status}`);
}

for (const [name, turns] of scenarios) {
  const conversationId = randomUUID();
  const history = [];
  for (const text of turns) {
    await publish(conversationId, text, 'customer');
    history.push({ role: 'user', text });
    let reply = `Synthetic acknowledgement for ${name}.`;
    if (chatEndpoint) {
      const chat = await fetch(chatEndpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ conversationId, message: text, messages: history.slice(0, -1) }) });
      if (!chat.ok) throw new Error(`Chat failed with ${chat.status}`);
      reply = (await chat.json()).reply;
    }
    await publish(conversationId, reply, 'assistant');
    history.push({ role: 'assistant', text: reply });
  }
}
console.log(JSON.stringify({ conversations: scenarios.length, synthetic: true, source: 'synthetic-pipeline-validation' }));
