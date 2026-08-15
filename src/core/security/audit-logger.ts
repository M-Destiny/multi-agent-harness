export interface AuditEvent {
  timestamp: string;
  event: string;
  actor?: string;
  target?: string;
  outcome: string;
  metadata?: Record<string, unknown>;
}

export class AuditLogger {
  private readonly logFile: string | undefined;
  private readonly redactPatterns: RegExp[] = [
    /sk[-_][A-Za-z0-9]{20,}/gi,
    /api[_-]?key["']?\s*[:=]\s*["']?[A-Za-z0-9_\-]{10,}["']?/gi,
    /token["']?\s*[:=]\s*["']?[A-Za-z0-9_\-\.]{10,}["']?/gi,
    /bearer\s+[A-Za-z0-9_\-\.]+/gi,
    /password["']?\s*[:=]\s*["']?[^\s"']+["']?/gi,
    /secret["']?\s*[:=]\s*["']?[^\s"']+["']?/gi,
  ];

  constructor(logFile?: string) {
    this.logFile = logFile;
  }

  log(event: AuditEvent): void {
    const entry: AuditEvent = {
      timestamp: new Date().toISOString(),
      event: event.event,
      actor: event.actor,
      target: event.target,
      outcome: event.outcome,
      metadata: typeof event.metadata === 'object' && event.metadata !== null
      ? (this.redact(event.metadata as Record<string, unknown>) as Record<string, unknown>)
      : undefined,
    };
    const line = JSON.stringify(entry);
    if (this.logFile) {
      import('node:fs').then((fs) => {
        fs.appendFileSync(this.logFile!, line + '\n');
      });
    }
  }

  redact(obj: unknown): unknown {
    return this.maskObject(obj);
  }

  maskObject(obj: unknown): unknown {
    if (typeof obj === 'string') return this.maskValue(obj);
    if (Array.isArray(obj)) return obj.map((v) => this.maskObject(v));
    if (obj !== null && typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) {
        result[k] = this.maskObject(v);
      }
      return result;
    }
    return obj;
  }

  private maskValue(value: string): string {
    let result = value;
    for (const pattern of this.redactPatterns) {
      result = result.replace(pattern, '***REDACTED***');
    }
    return result;
  }

  rotate(): void {
    if (!this.logFile) return;
    import('node:fs').then((fs) => {
      if (!this.logFile) return;
      const rotated = `${this.logFile}.${Date.now()}`;
      fs.renameSync(this.logFile, rotated);
    });
  }
}
