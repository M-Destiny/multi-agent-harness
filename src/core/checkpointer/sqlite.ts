import type { Database as DatabaseType } from 'better-sqlite3';
import Database from 'better-sqlite3';
import type { Checkpointer, Checkpoint, CheckpointMetadata } from '../types.js';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

interface CheckpointRow {
  thread_id: string;
  checkpoint_id: string;
  parent_checkpoint_id: string | null;
  state: string;
  metadata: string;
  created_at: number;
}

/**
 * SQLite checkpointer with WAL mode for durability.
 * Thread-safe, persistent across restarts.
 */
export class SqliteCheckpointer implements Checkpointer {
  private db: DatabaseType;
  private readonly dbPath: string;

  constructor(dbPath: string = './.harness/checkpoints.db') {
    this.dbPath = dbPath;
    
    // Ensure directory exists
    const dir = dirname(resolve(dbPath));
    mkdirSync(dir, { recursive: true });

    this.db = new Database(dbPath);
    
    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    
    this.initializeSchema();
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS checkpoints (
        thread_id TEXT NOT NULL,
        checkpoint_id TEXT NOT NULL,
        parent_checkpoint_id TEXT,
        state TEXT NOT NULL,
        metadata TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (thread_id, checkpoint_id)
      );

      CREATE INDEX IF NOT EXISTS idx_checkpoints_thread_id 
        ON checkpoints(thread_id);
      
      CREATE INDEX IF NOT EXISTS idx_checkpoints_created_at 
        ON checkpoints(created_at);
    `);
  }

  private rowToCheckpoint(row: CheckpointRow): Checkpoint {
    return {
      threadId: row.thread_id,
      checkpointId: row.checkpoint_id,
      parentCheckpointId: row.parent_checkpoint_id ?? undefined,
      state: JSON.parse(row.state),
      metadata: JSON.parse(row.metadata) as CheckpointMetadata,
      createdAt: new Date(row.created_at),
    };
  }

  async get(threadId: string, checkpointId?: string): Promise<Checkpoint | null> {
    let stmt: Database.Statement<[string, string?]>;
    
    if (checkpointId) {
      stmt = this.db.prepare(
        'SELECT * FROM checkpoints WHERE thread_id = ? AND checkpoint_id = ?'
      );
      const row = stmt.get(threadId, checkpointId) as CheckpointRow | undefined;
      return row ? this.rowToCheckpoint(row) : null;
    }

    stmt = this.db.prepare(
      'SELECT * FROM checkpoints WHERE thread_id = ? ORDER BY created_at DESC LIMIT 1'
    );
    const row = stmt.get(threadId) as CheckpointRow | undefined;
    return row ? this.rowToCheckpoint(row) : null;
  }

  async put(checkpoint: Checkpoint): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO checkpoints 
      (thread_id, checkpoint_id, parent_checkpoint_id, state, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      checkpoint.threadId,
      checkpoint.checkpointId,
      checkpoint.parentCheckpointId ?? null,
      JSON.stringify(checkpoint.state),
      JSON.stringify(checkpoint.metadata),
      checkpoint.createdAt.getTime()
    );
  }

  async list(threadId: string): Promise<Checkpoint[]> {
    const stmt = this.db.prepare(
      'SELECT * FROM checkpoints WHERE thread_id = ? ORDER BY created_at ASC'
    );
    const rows = stmt.all(threadId) as CheckpointRow[];
    return rows.map((row) => this.rowToCheckpoint(row));
  }

  async delete(threadId: string): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM checkpoints WHERE thread_id = ?');
    stmt.run(threadId);
  }

  /** Close the database connection */
  close(): void {
    this.db.close();
  }

  /** Get database path */
  getPath(): string {
    return this.dbPath;
  }
}