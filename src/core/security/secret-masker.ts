export class SecretMasker {
  private patterns: { regex: RegExp; replace: string }[] = [
    { regex: /sk[-_][A-Za-z0-9]+/gi, replace: '***REDACTED***' },
    { regex: /ghp_[A-Za-z0-9]+/gi, replace: '***REDACTED***' },
    { regex: /gho_[A-Za-z0-9]+/gi, replace: '***REDACTED***' },
    { regex: /(api[_-]?key["']?\s*[:=]\s*["']?)[A-Za-z0-9_\-]+/gi, replace: '$1***REDACTED***' },
    { regex: /(token["']?\s*[:=]\s*["']?)[A-Za-z0-9_\-\.]+/gi, replace: '$1***REDACTED***' },
    { regex: /(bearer\s+)[A-Za-z0-9_\-\.]+/gi, replace: '$1***REDACTED***' },
    { regex: /(password["']?\s*[:=]\s*["']?)[^\s"']+/gi, replace: '$1***REDACTED***' },
    { regex: /(secret["']?\s*[:=]\s*["']?)[^\s"']+/gi, replace: '$1***REDACTED***' },
    { regex: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/gi, replace: '***REDACTED***' },
    { regex: /-----END\s+(?:RSA\s+)?PRIVATE\s+KEY-----/gi, replace: '***REDACTED***' },
  ];

  mask(value: string): string {
    if (typeof value !== 'string') return value;
    
    // If the entire value is exactly a Bearer token, redact it fully to satisfy array/object value expectations
    if (/^bearer\s+[A-Za-z0-9_\-\.]+$/i.test(value.trim())) {
      return '***REDACTED***';
    }

    let result = value;
    for (const item of this.patterns) {
      result = result.replace(item.regex, item.replace);
    }
    return result;
  }

  maskObject(obj: unknown): unknown {
    if (typeof obj === 'string') return this.mask(obj);
    if (Array.isArray(obj)) return obj.map((v) => this.maskObject(v));
    if (obj !== null && typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        if (/api[_-]?key|token|password|secret/i.test(k)) {
          result[k] = '***REDACTED***';
        } else {
          result[k] = this.maskObject(v);
        }
      }
      return result;
    }
    return obj;
  }

  addPattern(regex: RegExp): void {
    this.patterns.push({ regex, replace: '***REDACTED***' });
  }
}
