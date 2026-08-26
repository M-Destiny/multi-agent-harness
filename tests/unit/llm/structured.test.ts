import { describe, expect, it, vi } from 'vitest';
import { executeStructured } from '../../../src/core/llm/structured.js';
import type { LLMProvider } from '../../../src/core/types.js';
import { z } from 'zod';

describe('Structured Output Layer', () => {
  it('successfully parses valid JSON matching Zod schema', async () => {
    const mockProvider = {
      complete: vi.fn().mockResolvedValue({
        content: JSON.stringify({ name: 'Alice', age: 30 }),
      }),
    } as unknown as LLMProvider;

    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });

    const result = await executeStructured(mockProvider, [], {
      schema,
    });

    expect(result).toEqual({ name: 'Alice', age: 30 });
    expect(mockProvider.complete).toHaveBeenCalled();
  });

  it('cleans up markdown wrapper code blocks', async () => {
    const mockProvider = {
      complete: vi.fn().mockResolvedValue({
        content: '```json\n{\n  "status": "ok"\n}\n```',
      }),
    } as unknown as LLMProvider;

    const schema = z.object({
      status: z.string(),
    });

    const result = await executeStructured(mockProvider, [], {
      schema,
    });

    expect(result).toEqual({ status: 'ok' });
  });

  it('triggers onValidationError and retries on failure', async () => {
    const mockProvider = {
      complete: vi
        .fn()
        .mockResolvedValueOnce({
          content: 'invalid json here',
        })
        .mockResolvedValueOnce({
          content: JSON.stringify({ count: 42 }),
        }),
    } as unknown as LLMProvider;

    const schema = z.object({
      count: z.number(),
    });

    const errCallback = vi.fn();

    const result = await executeStructured(mockProvider, [], {
      schema,
      maxRetries: 3,
      onValidationError: errCallback,
    });

    expect(result).toEqual({ count: 42 });
    expect(mockProvider.complete).toHaveBeenCalledTimes(2);
    expect(errCallback).toHaveBeenCalledTimes(1);
  });
});
