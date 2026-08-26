# multi-agent-harness-py

Python SDK for the multi-agent-harness workflow orchestration engine.

## Installation

```bash
pip install multi-agent-harness-py
```

## Quickstart

```python
import asyncio
from multi_agent_harness import Client, SubAgent, MasterAgent

async def main():
    client = Client(base_url="http://localhost:3000", api_key="your_api_key")
    # Facade usage ...
    
asyncio.run(main())
```
