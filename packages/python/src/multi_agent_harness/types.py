from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

class LLMConfig(BaseModel):
    provider: str
    model: str
    apiKey: str
    baseUrl: Optional[str] = None
    temperature: float = 0.2
    maxTokens: int = 4096
    timeoutMs: int = 60000

class AgentConfig(BaseModel):
    id: str
    name: str
    role: str
    capabilities: List[str] = []
    tools: List[str] = []
    memoryNamespace: str
    llmConfig: LLMConfig
    systemPrompt: str = ""
    maxRetries: int = 3
    timeoutMs: int = 120000

class Task(BaseModel):
    id: str
    name: str
    description: str
    status: str
    dependencies: List[str] = []
    acceptanceCriteria: List[str] = []
    assignedAgentId: Optional[str] = None

class Workflow(BaseModel):
    id: str
    name: str
    tasks: List[Task] = []
    entryPoints: List[str] = []
    status: str
    createdAt: int
    updatedAt: int

class Checkpoint(BaseModel):
    threadId: str
    checkpointId: str
    parentCheckpointId: Optional[str] = None
    state: Dict[str, Any] = {}
    metadata: Dict[str, Any] = {}
    createdAt: int
