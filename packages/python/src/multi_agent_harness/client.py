import httpx
from typing import List, Dict, Any, Optional
from .types import Checkpoint

class Client:
    def __init__(self, base_url: str = "http://localhost:3000", api_key: Optional[str] = None):
        self.base_url = base_url
        self.headers = {}
        if api_key:
            self.headers["Authorization"] = f"Bearer {api_key}"

    async def get_graph(self) -> Dict[str, Any]:
        async with httpx.AsyncClient() as client:
            res = await client.get(f"{self.base_url}/api/graph", headers=self.headers)
            res.raise_for_status()
            return res.json()

    async def get_checkpoints(self, thread_id: str) -> List[Checkpoint]:
        async with httpx.AsyncClient() as client:
            res = await client.get(
                f"{self.base_url}/api/checkpoints",
                params={"threadId": thread_id},
                headers=self.headers
            )
            res.raise_for_status()
            return [Checkpoint(**item) for item in res.json()]

    async def resume_checkpoint(self, checkpoint_id: str, thread_id: str, state: Dict[str, Any]) -> bool:
        async with httpx.AsyncClient() as client:
            res = await client.post(
                f"{self.base_url}/api/checkpoints/{checkpoint_id}/resume",
                params={"threadId": thread_id},
                json={"state": state},
                headers=self.headers
            )
            res.raise_for_status()
            data = res.json()
            return data.get("success", False)

    async def get_audit_logs(self) -> List[Dict[str, Any]]:
        async with httpx.AsyncClient() as client:
            res = await client.get(f"{self.base_url}/api/audit-logs", headers=self.headers)
            res.raise_for_status()
            return res.json()
