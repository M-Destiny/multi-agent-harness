export class SecretMasker {
  private patterns: RegExp[] = [
    /sk[-_][A-Za-z0-9]{20,}/gi,
    /ghp_[A-Za-z0-9]{36}/gi,
    /gho_[A-Za-z0-9]{36}/gi,
    /api[_-]?key["']?\s*[:=]\s*["']?[A-Za-z0-9_\-]{10,}["']?/gi,
    /token["']?\s*[:=]\s*["']?[A-Za-z0-9_\-\.]{10,}["']?/gi,
    /bearer\s+[A-Za-z0-9_\-\.]+/gi,
    /password["']?\s*[:=]\s*["']?[^\s"']+["']?/gi,
    /secret["']?\s*[:=]\s*["']?[^\s"']+["']?/gi,
    /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/gi,
    /-----END\s+(?:RSA\s+)?PRIVATE\s+KEY-----/gi,
  ];

  mask(value: string): string {
    let result = value;
    for (const pattern of this.patterns) {
      result = result.replace(pattern, '***REDACTED***');
    }
    return result;
  }

  maskObject(obj: unknown): unknown {
    if (typeof obj === 'string') return this.mask(obj);
    if (Array.isArray(obj)) return obj.map((v) => this.maskObject(v));
    if (obj !== null && typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        result[k] = this.maskObject(v);
      }
      return result;
    }
    return obj;
  }

  addPattern(regex: RegExp): void {
    this.patterns.push(regex);
  }
}
