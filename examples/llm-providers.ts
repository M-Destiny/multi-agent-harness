import { createLLMProvider } from '../dist/index.js';

async function main() {
  // ── OpenAI ────────────────────────────────────────────────────────────────
  const openai = createLLMProvider({
    provider: 'openai',
    model: 'gpt-4o',
    apiKey: process.env.OPENAI_API_KEY!,
    temperature: 0.7,
    maxTokens: 1024,
    timeoutMs: 30000,
  });

  const openaiHealth = await openai.healthCheck();
  console.log('OpenAI health:', openaiHealth);

  const openaiResp = await openai.complete({
    messages: [{ role: 'user', content: 'What is 2+2?' }],
    model: 'gpt-4o',
  });
  console.log('OpenAI response:', openaiResp.content);

  // ── Streaming ─────────────────────────────────────────────────────────────
  process.stdout.write('\nOpenAI stream: ');
  for await (const chunk of openai.stream({
    messages: [{ role: 'user', content: 'Count from 1 to 5' }],
    model: 'gpt-4o',
  })) {
    process.stdout.write(chunk.content);
  }
  process.stdout.write('\n');

  // ── Usage stats ───────────────────────────────────────────────────────────
  const usage = openai.getUsage();
  console.log('Usage:', usage);

  await openai.destroy();
}

main().catch(console.error);
