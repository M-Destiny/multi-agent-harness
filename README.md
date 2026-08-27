# Multi-Agent Harness

> **TypeScript multi-agent orchestration framework with spec-driven development, DAG workflow execution, LLM provider fallback chains, tool calling, SQLite memory, and quality gates**

[![CI](https://github.com/M-Destiny/multi-agent-harness/workflows/CI/badge.svg)](https://github.com/M-Destiny/multi-agent-harness/actions/workflows/ci.yml)
[![Release](https://github.com/M-Destiny/multi-agent-harness/workflows/Release/badge.svg)](https://github.com/M-Destiny/multi-agent-harness/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)

---

## 🎯 Problem

Building reliable multi-agent AI systems requires orchestrating multiple agents, managing shared state, handling provider failures, and enforcing quality — all while keeping code maintainable.

## 💡 Solution

A **production-grade multi-agent framework** designed for spec-driven development:

- **DAG workflow execution** — declarative agent graphs with parallel/sequential nodes
- **LLM provider fallback chains** — automatic failover across OpenAI, Anthropic, NVIDIA, local
- **Tool calling** — standardized schema, sandboxed execution, observability
- **SQLite memory** — persistent context, conversation history, cross-session recall
- **Quality gates** — lint, typecheck, test, coverage enforced in CI
- **Spec-driven** — SPEC.md → graphify → ponytail → implementation → validation

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Harness Core                                   │
├────────────┬────────────┬────────────┬────────────┬────────────────┤
│  Spec      │  Graph     │  Agent     │  Memory    │  Provider      │
│  Parser    │  Executor  │  Runtime   │  (SQLite)  │  Manager       │
└────────────┴────────────┴────────────┴────────────┴────────────────┘
```

## 🚀 Quick Start

```bash
# Install
npm install -g @multi-agent/harness

# Initialize project from spec
harness init my-project --spec SPEC.md

# Run workflow
harness run workflow-name

# Interactive development
harness dev
```

## 📋 Spec-Driven Development

```markdown
# SPEC.md
## Agents
- **Researcher**: gpt-4o, tools: [search, extract]
- **Coder**: claude-3-5-sonnet, tools: [read, write, test]
- **Reviewer**: nemotron-3-ultra, tools: [lint, typecheck]

## Workflow
researcher → coder → reviewer
  ↓           ↓          ↓
parallel    sequential  gate

## Quality Gates
- lint: eslint
- typecheck: tsc --noEmit
- test: vitest --coverage
- coverage: > 80%
```

```bash
harness generate SPEC.md  # Creates project structure
harness validate           # Checks spec compliance
harness run                # Executes DAG
```

## 🔧 Configuration

```yaml
# harness.config.yaml
providers:
  - name: openai
    models: [gpt-4o, gpt-4o-mini]
    fallback: true
  - name: anthropic
    models: [claude-3-5-sonnet]
    fallback: true
  - name: nvidia
    models: [nvidia/nemotron-3-ultra-550b-a55b]
    free_tier: true

memory:
  type: sqlite
  path: .harness/memory.db
  retention_days: 30

quality_gates:
  lint: true
  typecheck: true
  test: true
  coverage_threshold: 80
```

## 🛠️ Core Concepts

| Concept | Description |
|---|---|
| **Agent** | LLM + tools + memory + policy |
| **Tool** | Typed function with JSON schema |
| **Workflow** | DAG of agent nodes |
| **Spec** | Markdown contract → code |
| **Gate** | Quality check (lint/test/type) |

## 🧪 Testing

```bash
npm test              # Unit + integration
npm run test:watch    # TDD mode
npm run test:coverage # Coverage report
```

## 📦 Release

```bash
npm version patch
git push origin main --tags
# GitHub Actions: lint → typecheck → test → build → release → npm
```

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md)

## 📄 License

MIT License

---

**Built for teams shipping reliable AI agents at scale**