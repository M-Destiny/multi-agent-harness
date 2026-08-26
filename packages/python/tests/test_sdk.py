import pytest
from multi_agent_harness import (
    Client, SubAgent, MasterAgent, StateGraph, WorkflowExecutor,
    InMemoryStore, Evaluator, LLMConfig, AgentConfig
)

@pytest.mark.asyncio
async def test_facades():
    # Test Memory
    store = InMemoryStore()
    await store.put("key1", "val1")
    val = await store.get("key1")
    assert val == "val1"

    # Test Agent Config & Agents
    llm_cfg = LLMConfig(provider="openai", model="gpt-4o", apiKey="test")
    agent_cfg = AgentConfig(
        id="a1", name="Agent 1", role="sub", memoryNamespace="a1", llmConfig=llm_cfg
    )
    agent = SubAgent(agent_cfg)
    agent.register_tool("tool1", lambda x: x)
    res = await agent.execute("input")
    assert "Processed:" in res

    # Test StateGraph
    graph = StateGraph()
    graph.add_node("start", lambda x: x)
    graph.add_node("end", lambda x: x)
    graph.add_edge("start", "end")
    assert len(graph.edges) == 1

    # Test Evaluator
    evaluator = Evaluator()
    eval_res = await evaluator.evaluate("in", "out")
    assert eval_res["passed"] is True
