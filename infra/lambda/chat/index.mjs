import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { conversationMessages } from './conversation.mjs';
import { extractionPrompt, journeyStage, journeyTool, mergeJourney, missingDetails, toolInput } from './journey.mjs';
import { lisbonDate, systemPrompt } from './prompt.mjs';

const bedrock = new BedrockRuntimeClient({});
const response = (statusCode, body) => ({ statusCode, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }, body: JSON.stringify(body) });
const attack = /ignore (all|any|the|your|previous)|system prompt|developer message|repeat (your|the) instructions|reveal (your|the).*(prompt|rules)|jailbreak|training data/i;
const safeReply = 'I can help with destinations, dates, travel preferences and planning a private journey through Portugal.';

function journeyBody(journey) {
  return { journey, stage: journeyStage(journey), missing: missingDetails(journey) };
}

export async function handler(event) {
  try {
    const body = JSON.parse(event.body || '{}');
    const message = String(body.message || '').trim();
    if (!message || message.length > 2000) return response(400, { error: 'Enter a message up to 2000 characters' });
    const previous = mergeJourney(body.journey, {});
    if (attack.test(message)) return response(200, { reply: safeReply, security: 'intervened', ...journeyBody(previous) });
    const history = conversationMessages(body.messages, message);
    const today = lisbonDate();
    // The reply and the metadata extraction run in parallel, so tracking adds no wait.
    const [answer, extraction] = await Promise.allSettled([
      bedrock.send(new ConverseCommand({
        modelId: process.env.MODEL_ID, system: [{ text: systemPrompt(today) }], messages: history,
        inferenceConfig: { maxTokens: 260, temperature: 0.5, topP: 0.9 },
        guardrailConfig: { guardrailIdentifier: process.env.GUARDRAIL_ID, guardrailVersion: process.env.GUARDRAIL_VERSION, trace: 'enabled' },
      })),
      bedrock.send(new ConverseCommand({
        modelId: process.env.MODEL_ID, system: [{ text: extractionPrompt(today) }], messages: history,
        inferenceConfig: { maxTokens: 300, temperature: 0 },
        toolConfig: { tools: [journeyTool], toolChoice: { any: {} } },
      })),
    ]);
    if (answer.status === 'rejected') throw answer.reason;
    if (extraction.status === 'rejected') console.warn('Journey extraction failed', extraction.reason?.name);
    const journey = mergeJourney(previous, extraction.status === 'fulfilled' ? toolInput(extraction.value) : {});
    if (answer.value.stopReason === 'guardrail_intervened') return response(200, { reply: safeReply, security: 'intervened', ...journeyBody(previous) });
    const reply = answer.value.output?.message?.content?.find(part => part.text)?.text?.trim();
    return response(200, { reply: reply || safeReply, security: 'passed', ...journeyBody(journey) });
  } catch (error) {
    console.error(error);
    return response(503, { error: 'The travel concierge is temporarily unavailable' });
  }
}
