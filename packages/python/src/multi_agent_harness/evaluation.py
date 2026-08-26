from typing import Dict, Any, Optional

class Evaluator:
    def __init__(self):
        pass

    async def evaluate(self, input_text: str, output_text: str) -> Dict[str, Any]:
        return {"passed": True, "score": 100}
