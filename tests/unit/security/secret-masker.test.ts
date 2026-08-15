import { describe, it, expect } from 'vitest';
import { SecretMasker } from '../../../src/core/security/secret-masker.js';

describe('SecretMasker', () => {
  const mask = new SecretMasker();

  it('masks sk-* API keys', () => {
    expect(mask.mask('sk-AbCdEfGhIjKlMnOpQrStUvWxYz123456789012')).toBe('***REDACTED***');
  });

  it('masks GitHub tokens', () => {
    expect(mask.mask('ghp_AbCdEfGhIjKlMnOpQrStUvWxYz1234567890')).toBe('***REDACTED***');
  });

  it('masks Bearer tokens', () => {
    expect(mask.mask('Authorization: Bearer abc123.def456.ghi789')).toBe('Authorization: Bearer ***REDACTED***');
  });

  it('masks password fields in strings', () => {
    expect(mask.mask('password=s3cr3t')).toBe('password=***REDACTED***');
  });

  it('masks private key headers', () => {
    const val = '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANB...\n-----END PRIVATE KEY-----';
    expect(mask.mask(val)).not.toContain('PRIVATE KEY');
  });

  it('maskObject recursively masks nested objects', () => {
    const result = mask.maskObject({
      apiKey: 'sk-abc123456789',
      nested: { token: 'Bearer xyz', deep: { password: 'secret123' } },
    }) as Record<string, unknown>;
    expect(result['apiKey']).toBe('***REDACTED***');
    expect((result['nested'] as Record<string, unknown>)['token']).toBe('***REDACTED***');
    expect(((result['nested'] as Record<string, unknown>)['deep'] as Record<string, unknown>)['password']).toBe('***REDACTED***');
  });

  it('addPattern registers custom patterns', () => {
    const m2 = new SecretMasker();
    m2.addPattern(/HIPAA_\w+/g);
    expect(m2.mask('Patient record: HIPAA_12345')).toBe('Patient record: ***REDACTED***');
  });

  it('maskObject handles arrays', () => {
    const result = mask.maskObject([{ apiKey: 'sk-test' }, 'Bearer tok']) as Record<string, unknown>[];
    expect(result[0]['apiKey']).toBe('***REDACTED***');
    expect(result[1]).toBe('***REDACTED***');
  });
});
