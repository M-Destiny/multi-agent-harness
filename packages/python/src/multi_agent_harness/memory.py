from typing import Dict, Any, Optional

class MemoryStore:
    async def get(self, key: str) -> Optional[Any]:
        pass

    async def put(self, key: str, value: Any) -> None:
        pass

class InMemoryStore(MemoryStore):
    def __init__(self):
        self.store = {}

    async def get(self, key: str) -> Optional[Any]:
        return self.store.get(key)

    async def put(self, key: str, value: Any) -> None:
        self.store[key] = value
