import type { JSONSchema } from '../types.js';

export interface A2AAgentCard {
  name: string;
  description: string;
  version: string;
  url: string;
  capabilities: {
    streaming: boolean;
    pushNotifications: boolean;
    stateTransitionHistory: boolean;
  };
  skills: A2ASkill[];
  authentication: A2AAuthScheme[];
}

export interface A2ASkill {
  id: string;
  name: string;
  description: string;
  tags?: string[];
  examples?: string[];
}

export interface A2AAuthScheme {
  scheme: 'bearer' | 'mtls' | 'apiKey';
  credentials?: string;
}

export interface A2ATask {
  id: string;
  contextId: string;
  status: A2ATaskStatus;
  message: A2AMessage;
  artifacts?: A2AArtifact[];
  history?: A2AMessage[];
}

export type A2ATaskStatus = 'submitted' | 'working' | 'input-required' | 'completed' | 'failed' | 'canceled';

export interface A2AMessage {
  role: 'user' | 'agent';
  parts: A2AMessagePart[];
}

export interface A2AMessagePart {
  type: 'text' | 'file' | 'data';
  text?: string;
  file?: { name: string; mimeType: string; bytes: string };
  data?: unknown;
}

export interface A2AArtifact {
  name: string;
  description?: string;
  parts: A2AMessagePart[];
}

export interface A2AClientConfig {
  baseUrl: string;
  auth?: A2AAuthConfig;
  timeout?: number;
}

export interface A2AAuthConfig {
  scheme: 'bearer' | 'mtls' | 'apiKey';
  token?: string;
}

export interface A2AClient {
  discover(): Promise<A2AAgentCard>;
  sendTask(message: A2AMessage, options?: { streaming?: boolean; timeout?: number }): Promise<A2ATask>;
  getTask(taskId: string): Promise<A2ATask>;
  cancelTask(taskId: string): Promise<void>;
  subscribeTask(taskId: string): AsyncGenerator<A2ATaskStatusUpdate>;
}

export interface A2ATaskStatusUpdate {
  taskId: string;
  status: A2ATaskStatus;
  progress?: number;
  message?: A2AMessage;
  artifact?: A2AArtifact;
}