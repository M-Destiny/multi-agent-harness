import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ToolSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { MasterAgent } from '../master-agent.js';
import { TaskQueue } from '../task.js';
import { createWorkflow, createTask } from '../types.js';
import { AgentConfig } from '../types.js';

export interface MCPServerConfig {
  harnessConfig: {
    model: string;
    provider: string;
    baseUrl: string;
  };
  workspacePath: string;
}

export class HarnessMCPServer {
  private server: Server;
  private masterAgent: MasterAgent | null = null;
  private taskQueue: TaskQueue;
  private initialized = false;

  constructor(private config: MCPServerConfig) {
    this.server = new Server(
      {
        name: 'multi-agent-harness',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.taskQueue = new TaskQueue();
    this.setupHandlers();
  }

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'create_workflow',
            description: 'Create a new multi-agent workflow with tasks and dependencies',
            inputSchema: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Workflow name' },
                description: { type: 'string', description: 'Workflow description' },
                tasks: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                      description: { type: 'string' },
                      acceptanceCriteria: { type: 'array', items: { type: 'string' } },
                      priority: { type: 'string', enum: ['P1', 'P2', 'P3'] },
                      dependencies: { type: 'array', items: { type: 'string' } },
                      assignedAgentId: { type: 'string' },
                    },
                    required: ['id', 'name', 'description'],
                  },
                },
              },
              required: ['name', 'tasks'],
            },
          },
          {
            name: 'execute_workflow',
            description: 'Execute a workflow with the multi-agent harness',
            inputSchema: {
              type: 'object',
              properties: {
                workflowId: { type: 'string', description: 'Workflow ID to execute' },
                maxConcurrency: { type: 'number', default: 3 },
              },
              required: ['workflowId'],
            },
          },
          {
            name: 'get_workflow_status',
            description: 'Get the current status of a workflow',
            inputSchema: {
              type: 'object',
              properties: {
                workflowId: { type: 'string' },
              },
              required: ['workflowId'],
            },
          },
          {
            name: 'list_workflows',
            description: 'List all workflows',
            inputSchema: { type: 'object', properties: {} },
          },
          {
            name: 'create_task',
            description: 'Create a standalone task',
            inputSchema: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                description: { type: 'string' },
                acceptanceCriteria: { type: 'array', items: { type: 'string' } },
                priority: { type: 'string', enum: ['P1', 'P2', 'P3'] },
                dependencies: { type: 'array', items: { type: 'string' } },
                assignedAgentId: { type: 'string' },
              },
              required: ['id', 'name', 'description'],
            },
          },
          {
            name: 'execute_task',
            description: 'Execute a single task with a sub-agent',
            inputSchema: {
              type: 'object',
              properties: {
                taskId: { type: 'string' },
                agentRole: { type: 'string', enum: ['master', 'sub'] },
              },
              required: ['taskId'],
            },
          },
          {
            name: 'get_task_status',
            description: 'Get status of a task',
            inputSchema: {
              type: 'object',
              properties: {
                taskId: { type: 'string' },
              },
              required: ['taskId'],
            },
          },
          {
            name: 'get_queue_status',
            description: 'Get overall task queue status',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'create_workflow':
            return await this.handleCreateWorkflow(args);
          case 'execute_workflow':
            return await this.handleExecuteWorkflow(args);
          case 'get_workflow_status':
            return await this.handleGetWorkflowStatus(args);
          case 'list_workflows':
            return await this.handleListWorkflows();
          case 'create_task':
            return await this.handleCreateTask(args);
          case 'execute_task':
            return await this.handleExecuteTask(args);
          case 'get_task_status':
            return await this.handleGetTaskStatus(args);
          case 'get_queue_status':
            return await this.handleGetQueueStatus();
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  private async ensureInitialized() {
      if (this.initialized) return;

      // Initialize master agent if needed
      if (!this.masterAgent) {
        const config: AgentConfig = {
          id: 'master-mcp',
          name: 'MCP Master Agent',
          role: 'master',
          capabilities: ['workflow_execution', 'task_delegation', 'result_aggregation'],
          tools: [
            'create_workflow',
            'execute_workflow',
            'create_task',
            'execute_task',
            'get_workflow_status',
            'get_task_status',
            'get_queue_status',
          ],
          memoryNamespace: 'mcp-server',
          llmConfig: {
            provider: this.config.harnessConfig.provider as any,
            model: this.config.harnessConfig.model,
            apiKey: process.env.NVIDIA_API_KEY || '',
            baseUrl: this.config.harnessConfig.baseUrl,
            temperature: 0.7,
            maxTokens: 4096,
            timeoutMs: 300000,
          },
          systemPrompt: `You are the master agent for the Multi-Agent Harness MCP server.
  Your role is to orchestrate workflows by delegating tasks to sub-agents.
  You have access to tools for creating and executing workflows and tasks.`,
          maxRetries: 3,
          timeoutMs: 300000,
        };

      // We'll lazily initialize when needed
    }

    this.initialized = true;
  }

  private async handleCreateWorkflow(args: any) {
    const { name, description, tasks } = args;
    
    const workflow = {
      id: `wf-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name,
      description,
      tasks: tasks.map((t: any, i: number) => ({
        id: t.id || `task-${i}`,
        name: t.name,
        description: t.description,
        acceptanceCriteria: t.acceptanceCriteria || [],
        priority: t.priority || 'P2',
        dependencies: t.dependencies || [],
        assignedAgentId: t.assignedAgentId,
        status: 'pending' as const,
        createdAt: new Date(),
      })),
      entryPoints: tasks
        .filter((t: { dependencies?: string[] }) => !t.dependencies || t.dependencies.length === 0)
        .map((t: { id?: string }, i: number) => t.id || `task-${i}`),
      status: 'pending' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Store workflow (in memory for now)
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ workflowId: workflow.id, status: 'created', taskCount: workflow.tasks.length }, null, 2),
        },
      ],
    };
  }

  private async handleExecuteWorkflow(args: any) {
    const { workflowId, maxConcurrency } = args;
    
    // In a real implementation, this would execute the workflow
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ workflowId, status: 'started', message: 'Workflow execution initiated' }, null, 2),
        },
      ],
    };
  }

  private async handleGetWorkflowStatus(args: any) {
    const { workflowId } = args;
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ workflowId, status: 'pending', progress: '0%' }, null, 2),
        },
      ],
    };
  }

  private async handleListWorkflows() {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ workflows: [] }, null, 2),
        },
      ],
    };
  }

  private async handleCreateTask(args: any) {
    const { id, name, description, acceptanceCriteria, priority, dependencies, assignedAgentId } = args;
    
    const task = {
      id: id || `task-${Date.now()}`,
      name,
      description,
      acceptanceCriteria: acceptanceCriteria || [],
      priority: priority || 'P2',
      dependencies: dependencies || [],
      assignedAgentId,
      status: 'pending' as const,
      createdAt: new Date(),
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ taskId: task.id, status: 'created' }, null, 2),
        },
      ],
    };
  }

  private async handleExecuteTask(args: any) {
    const { taskId, agentRole } = args;
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ taskId, status: 'started', agentRole }, null, 2),
        },
      ],
    };
  }

  private async handleGetTaskStatus(args: any) {
    const { taskId } = args;
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ taskId, status: 'pending' }, null, 2),
        },
      ],
    };
  }

  private async handleGetQueueStatus() {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ 
            pending: 0, 
            running: 0, 
            completed: 0, 
            failed: 0,
            queueSize: 0 
          }, null, 2),
        },
      ],
    };
  }

  async start() {
    await this.ensureInitialized();
    
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    console.error('MCP Server started on stdio');
  }
}

export async function createMCPServer(config: MCPServerConfig) {
  const server = new HarnessMCPServer(config);
  await server.start();
  return server;
}