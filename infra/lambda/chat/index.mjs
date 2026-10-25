import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { conversationMessages } from './conversation.mjs';
import { systemPrompt } from './prompt.mjs';

const bedrock = new BedrockRuntimeClient({});
const response = (statusCode, body) => ({ statusCode, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }, body: JSON.stringify(body) });
const attack = /ignore (all|any|the|your|previous)|system prompt|developer message|repeat (your|the) instructions|reveal (your|the).*(prompt|rules)|jailbreak|training data/i;
const safeReply = 'I can help with destinations, dates, travel preferences and planning a private journey through Portugal.';

export async function handler(event) {
  try {
    const body = JSON.parse(event.body || '{}');
    const message = String(body.message || '').trim();
    if (!message || message.length > 2000) return response(400, { error: 'Enter a message up to 2000 characters' });
    if (attack.test(message)) return response(200, { reply: safeReply, security: 'intervened' });
    const history = conversationMessages(body.messages, message);
    const command = new ConverseCommand({
      modelId: process.env.MODEL_ID, system: [{ text: systemPrompt() }], messages: history,
      inferenceConfig: { maxTokens: 420, temperature: 0.55, topP: 0.9 },
      guardrailConfig: { guardrailIdentifier: process.env.GUARDRAIL_ID, guardrailVersion: process.env.GUARDRAIL_VERSION, trace: 'enabled' },
    });
    const result = await bedrock.send(command);
    if (result.stopReason === 'guardrail_intervened') return response(200, { reply: safeReply, security: 'intervened' });
    const reply = result.output?.message?.content?.find(part => part.text)?.text?.trim();
    return response(200, { reply: reply || safeReply, security: 'passed' });
  } catch (error) {
    console.error(error);
    return response(503, { error: 'The travel concierge is temporarily unavailable' });
  }
}
