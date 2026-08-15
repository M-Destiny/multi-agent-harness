import type { Task, Workflow, WorkflowResult } from './types.js';
import type { SubAgent } from './sub-agent.js';
import { MasterAgent } from './master-agent.js';
import type { AgentConfig, MemoryStore } from './types.js';

export class WorkflowExecutor {
  private readonly master: MasterAgent;
  private readonly maxConcurrency: number;

  constructor(masterConfig: AgentConfig, memoryStore: MemoryStore, subAgents: SubAgent[], maxConcurrency = 3) {
    this.master = new MasterAgent(masterConfig, memoryStore);
    for (const sa of subAgents) this.master.addSubAgent(sa);
    this.maxConcurrency = maxConcurrency;
  }

  async initialize(): Promise<void> {
    await this.master.initialize();
  }

  async shutdown(): Promise<void> {
    await this.master.shutdown();
  }

  async run(workflow: Workflow): Promise<WorkflowResult> {
    return this.master.executeWorkflow(workflow, this.maxConcurrency);
  }
}
