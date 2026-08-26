import { ToolRegistry } from './registry.js';
import type { Tool } from './registry.js';
import * as fs from 'node:fs';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { SandboxSession } from '../security/index.js';

const execAsync = promisify(exec);

function makeTool(name: string, description: string, schema: object, handler: (args: unknown) => Promise<{ success: boolean; output?: string; error?: string }>): Tool {
  return { name, description, inputSchema: schema as import('../types.js').JSONSchema, handler };
}

export function builtInTools(sandboxSession?: SandboxSession | null): Tool[] {
  return [
    makeTool(
      'file_read',
      'Read the contents of a file from the filesystem.',
      { type: 'object', properties: { path: { type: 'string', description: 'Absolute path to the file' } }, required: ['path'] },
      async (args) => {
        const { path } = args as { path: string };
        try {
          if (sandboxSession) {
            const content = await sandboxSession.readFile(path);
            return { success: true, output: content };
          }
          const content = fs.readFileSync(path, 'utf8');
          return { success: true, output: content };
        } catch (e) {
          return { success: false, error: e instanceof Error ? e.message : String(e) };
        }
      },
    ),
    makeTool(
      'file_write',
      'Write content to a file, replacing existing content.',
      { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] },
      async (args) => {
        const { path, content } = args as { path: string; content: string };
        try {
          if (sandboxSession) {
            await sandboxSession.writeFile(path, content);
            return { success: true, output: `Written ${content.length} chars to ${path} in sandbox` };
          }
          fs.writeFileSync(path, content, 'utf8');
          return { success: true, output: `Written ${content.length} chars to ${path}` };
        } catch (e) {
          return { success: false, error: e instanceof Error ? e.message : String(e) };
        }
      },
    ),
    makeTool(
      'terminal',
      'Execute a shell command and return its stdout.',
      { type: 'object', properties: { command: { type: 'string', description: 'Shell command to run' }, cwd: { type: 'string' } }, required: ['command'] },
      async (args) => {
        const { command, cwd } = args as { command: string; cwd?: string };
        try {
          if (sandboxSession) {
            return await sandboxSession.executeCommand(command, cwd);
          }
          const { stdout, stderr } = await execAsync(command, { cwd: cwd ?? process.cwd(), timeout: 60000 });
          return { success: true, output: stdout + stderr };
        } catch (e) {
          const err = e as { stdout?: string; stderr?: string; message?: string };
          return { success: false, error: (err.stdout ?? '') + (err.stderr ?? '') || err.message };
        }
      },
    ),
    makeTool(
      'file_exists',
      'Check if a file or directory exists.',
      { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      async (args) => {
        const { path } = args as { path: string };
        if (sandboxSession) {
          const res = await sandboxSession.executeCommand(`test -e "${path}"`);
          return { success: true, output: res.success ? 'true' : 'false' };
        }
        try { fs.accessSync(path); return { success: true, output: 'true' }; }
        catch { return { success: true, output: 'false' }; }
      },
    ),
    makeTool(
      'list_dir',
      'List files in a directory.',
      { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      async (args) => {
        const { path } = args as { path: string };
        try {
          if (sandboxSession) {
            const res = await sandboxSession.executeCommand(`ls -1 "${path}"`);
            if (!res.success) {
              return { success: false, error: res.error ?? 'Failed to list directory in sandbox' };
            }
            const files = res.output.split('\n').map(f => f.trim()).filter(Boolean);
            return { success: true, output: JSON.stringify(files) };
          }
          const files = fs.readdirSync(path);
          return { success: true, output: JSON.stringify(files) };
        } catch (e) {
          return { success: false, error: e instanceof Error ? e.message : String(e) };
        }
      },
    ),
  ];
}

export { ToolRegistry };
export type { Tool };
