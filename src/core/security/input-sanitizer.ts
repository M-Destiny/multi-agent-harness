export class InputSanitizer {
  private readonly injectionPatterns = [
    /\$\([^)]+\)/g,              // Command substitution $(...)
    /`[^`]+`/g,                  // Backtick injection
    /\{\{.*?\}\}/g,             // Template literal injection
    /<script[\s\S]*?<\/script>/gi,
    /javascript:/gi,
    /data:text\/html/gi,
  ];

  sanitizePrompt(input: string): string {
    let result = input;
    for (const pattern of this.injectionPatterns) {
      result = result.replace(pattern, '[REDACTED]');
    }
    return result;
  }

  sanitizeFilename(input: string): string {
    return input
      .replace(/\.\./g, '')
      .replace(/[<>:"|?*]/g, '_')
      .replace(/^[\/\\]/, '')
      .trim()
      .slice(0, 255);
  }

  sanitizeJSON(input: string): string {
    try {
      const parsed = JSON.parse(input);
      // Remove __proto__ and constructor keys to prevent prototype pollution
      const cleaned = this.removeDangerousKeys(parsed);
      return JSON.stringify(cleaned);
    } catch {
      return input;
    }
  }

  private removeDangerousKeys(obj: unknown): unknown {
    if (Array.isArray(obj)) return obj.map((v) => this.removeDangerousKeys(v));
    if (obj !== null && typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        if (k !== '__proto__' && k !== 'constructor' && k !== 'prototype') {
          result[k] = this.removeDangerousKeys(v);
        }
      }
      return result;
    }
    return obj;
  }
}
