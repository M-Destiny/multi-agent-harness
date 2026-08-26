import type { LLMProvider, LLMMessage, StructuredOutputConfig } from '../types.js';
import { z } from 'zod';

function convertSchema(schema: unknown): unknown {
  if (schema && typeof schema === 'object' && 'shape' in schema) {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    
    const shape = (schema as { shape: Record<string, unknown> }).shape;
    for (const [key, value] of Object.entries(shape)) {
      if (value instanceof z.ZodString) {
        properties[key] = { type: 'string' };
        required.push(key);
      } else if (value instanceof z.ZodNumber) {
        properties[key] = { type: 'number' };
        required.push(key);
      } else if (value instanceof z.ZodBoolean) {
        properties[key] = { type: 'boolean' };
        required.push(key);
      } else if (value instanceof z.ZodArray) {
        properties[key] = { type: 'array', items: { type: 'string' } };
        required.push(key);
      } else {
        properties[key] = { type: 'string' };
      }
    }
    return {
      type: 'object',
      properties,
      required,
    };
  }
  return schema;
}

export async function executeStructured<T>(
  provider: LLMProvider,
  messages: LLMMessage[],
  config: StructuredOutputConfig<T>
): Promise<T> {
  const maxRetries = config.maxRetries ?? 3;
  const jsonSchema = convertSchema(config.schema);

  let attempt = 0;
  const currentMessages = [...messages];

  while (attempt < maxRetries) {
    attempt++;
    try {
      const systemInstruction = `You MUST return your response as a valid JSON object matching this schema:
${JSON.stringify(jsonSchema, null, 2)}
Ensure no extra text, markdown formatting blocks (like \`\`\`json), or explanations are included.`;

      const promptMessages = [
        { role: 'system' as const, content: systemInstruction },
        ...currentMessages,
      ];

      const res = await provider.complete(promptMessages);
      let content = res.content.trim();

      if (content.startsWith('```json')) {
        content = content.substring(7);
      } else if (content.startsWith('```')) {
        content = content.substring(3);
      }
      if (content.endsWith('```')) {
        content = content.substring(0, content.length - 3);
      }
      content = content.trim();

      const parsed = JSON.parse(content);

      if (config.schema && typeof (config.schema as { safeParse?: (val: unknown) => { success: boolean; data: unknown; error?: { message: string } } }).safeParse === 'function') {
        const validation = (config.schema as { safeParse: (val: unknown) => { success: boolean; data: unknown; error?: { message: string } } }).safeParse(parsed);
        if (!validation.success) {
          throw new Error(`Schema validation failed: ${validation.error?.message || 'unknown error'}`);
        }
        return validation.data as T;
      }

      return parsed as T;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      if (config.onValidationError) {
        await config.onValidationError(err, attempt);
      }

      if (attempt >= maxRetries) {
        throw new Error(`Failed to produce structured output after ${maxRetries} attempts. Last error: ${err.message}`);
      }

      currentMessages.push({
        role: 'user' as const,
        content: `Error: ${err.message}. Please correct your output to strictly match the requested JSON schema.`,
      });
    }
  }

  throw new Error('Failed to produce structured output.');
}
