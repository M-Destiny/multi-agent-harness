#!/usr/bin/env node
import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { createDefaultConfig, loadConfig } from './config/loader.js';
import type { HarnessConfig } from './config/schema.js';
import { SpecKitIntegration } from './core/spec-kit/integration.js';
import { createLogger } from './core/logging/logger.js';

const program = new Command();

program
  .name('harness')
  .description('Multi-agent harness for spec-driven development')
  .version('0.1.0');

// ── init ─────────────────────────────────────────────────────────────────────

program
  .command('init')
  .description('Create a default harness.config.yaml in the current directory')
  .option('-f, --force', 'Overwrite existing config')
  .action((opts) => {
    const target = path.join(process.cwd(), 'harness.config.yaml');
    if (fs.existsSync(target) && !opts.force) {
      console.error('Config already exists. Use --force to overwrite.');
      process.exit(1);
    }
    if (fs.existsSync(target)) fs.unlinkSync(target);
    const created = createDefaultConfig(target);
    console.log(`Config created: ${created}`);
  });

// ── config ───────────────────────────────────────────────────────────────────

program
  .command('config')
  .description('Show the current configuration')
  .option('-p, --path <path>', 'Path to config file')
  .action((opts) => {
    const loaded = loadConfig(opts.path);
    console.log(JSON.stringify(loaded, null, 2));
  });

// ── run ──────────────────────────────────────────────────────────────────────

program
  .command('run')
  .description('Run a workflow from a JSON/YAML file')
  .argument('<workflow-file>', 'Path to workflow definition (JSON)')
  .option('-c, --config <path>', 'Path to harness config')
  .action(async (file, opts) => {
    const config: HarnessConfig = loadConfig(opts.config);
    const { tracing } = await import('./core/monitoring/tracing.js');
    tracing.initialize(config.observability.otel);
    const logger = createLogger(config);
    const wfRaw = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
    logger.info({ workflow: wfRaw.name }, 'Loading workflow');
    // Dynamic import to keep CLI light
    const { InMemoryStore } = await import('./core/memory/memory-store.js');
    
    const { MasterAgent } = await import('./core/master-agent.js');
    const { SubAgent } = await import('./core/sub-agent.js');
    const { createWorkflow } = await import('./core/types.js');
    const wfm = wfRaw as { id: string; name: string; tasks: unknown[] };
    const workflow = createWorkflow(wfm as never);
    const memory = new InMemoryStore();
    const masterCfg = {
      id: 'master',
      name: 'Master Agent',
      role: 'master' as const,
      capabilities: ['orchestration'],
      tools: [],
      memoryNamespace: 'master',
      llmConfig: config.llm.primary!,
      systemPrompt: 'You coordinate agents.',
      maxRetries: 3,
      timeoutMs: 120_000,
    };
    const master = new MasterAgent(masterCfg, memory);
    if (config.llm.primary) {
      const subCfg = {
        id: 'worker',
        name: 'Worker Agent',
        role: 'sub' as const,
        capabilities: ['code'],
        tools: [],
        memoryNamespace: 'worker',
        llmConfig: config.llm.primary,
        systemPrompt: 'You are a worker agent.',
        maxRetries: 3,
        timeoutMs: 120_000,
        sandbox: config.sandbox,
      };
      const sub = new SubAgent(subCfg, memory);
      master.addSubAgent(sub);
    }
    await master.initialize();
    const result = await master.executeWorkflow(workflow);
    logger.info({ status: result.status, duration: result.totalDurationMs }, 'Workflow finished');
    await master.shutdown();
  });

// ── eval ─────────────────────────────────────────────────────────────────────

program
  .command('eval')
  .description('Run evaluation on a dataset')
  .option('-d, --dataset <path>', 'Path to dataset JSONL/JSON', 'evals/dataset.jsonl')
  .option('-e, --evaluators <list>', 'Comma-separated evaluators to run', 'semantic-similarity')
  .option('-o, --output-dir <path>', 'Directory to save JUnit XML and JSON report', './evals-report')
  .action(async (opts) => {
    const config = loadConfig(undefined);
    const { InMemoryStore } = await import('./core/memory/memory-store.js');
    const { SubAgent } = await import('./core/sub-agent.js');
    const { SemanticSimilarityEvaluator, TrajectoryEvaluator, CodeExecutionEvaluator } = await import('./core/evaluation/agent-eval.js');

    const datasetPath = path.resolve(opts.dataset);
    if (!fs.existsSync(datasetPath)) {
      console.error(`Dataset not found at ${opts.dataset}`);
      process.exit(1);
    }
    const raw = fs.readFileSync(datasetPath, 'utf8');
    const items = raw.trim().split('\n').map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);

    const evaluatorNames = opts.evaluators.split(',').map((e: string) => e.trim());
    const evaluatorsList = [];
    if (evaluatorNames.includes('semantic-similarity')) {
      evaluatorsList.push(new SemanticSimilarityEvaluator());
    }
    if (evaluatorNames.includes('trajectory')) {
      evaluatorsList.push(new TrajectoryEvaluator());
    }
    if (evaluatorNames.includes('code-exec')) {
      evaluatorsList.push(new CodeExecutionEvaluator());
    }

    const memory = new InMemoryStore();
    const worker = new SubAgent({
      id: 'eval-worker',
      name: 'Evaluation Worker',
      role: 'sub' as const,
      capabilities: ['code'],
      tools: [],
      memoryNamespace: 'eval-worker',
      llmConfig: config.llm.primary ?? { provider: 'openai', model: 'gpt-4o', apiKey: 'mock', temperature: 0.2, maxTokens: 4096, timeoutMs: 60000 },
      systemPrompt: 'You are an evaluation helper.',
      maxRetries: 1,
      timeoutMs: 30000,
    }, memory);

    await worker.initialize();

    const results = [];
    let sumScore = 0;

    for (const item of items) {
      const input = item.input;
      const expected = item.expected;
      let output = '';
      if (config.llm.primary && config.llm.primary.apiKey !== 'mock') {
        const res = await worker.complete(input);
        output = res.content;
      } else {
        output = expected || `Response to: ${input}`;
      }

      const scores: Record<string, number> = {};
      const details: Record<string, string> = {};
      let passed = true;

      for (const ev of evaluatorsList) {
        const evRes = await ev.evaluate(input, output, expected, { steps: [{ action: 'process' }], durationMs: 100 });
        scores[ev.name] = evRes.score;
        details[ev.name] = evRes.details;
        if (!evRes.passed) passed = false;
      }

      const avgScore = Object.values(scores).reduce((a, b) => a + b, 0) / Math.max(Object.keys(scores).length, 1);
      sumScore += avgScore;

      results.push({
        input,
        output,
        expected,
        scores,
        passed,
        details,
      });
    }

    await worker.shutdown();

    const overallScore = Math.round(sumScore / Math.max(items.length, 1));
    const report = {
      testSuiteName: 'Agent Evaluation Suite',
      results,
      overallScore,
    };

    const outputDir = path.resolve(opts.outputDir);
    fs.mkdirSync(outputDir, { recursive: true });

    const jsonReportPath = path.join(outputDir, 'report.json');
    fs.writeFileSync(jsonReportPath, JSON.stringify(report, null, 2), 'utf8');

    const junitPath = path.join(outputDir, 'junit.xml');
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<testsuites name="${report.testSuiteName}" tests="${report.results.length}" failures="${report.results.filter(r => !r.passed).length}">\n`;
    xml += `  <testsuite name="${report.testSuiteName}" tests="${report.results.length}" failures="${report.results.filter(r => !r.passed).length}">\n`;
    for (const r of report.results) {
      xml += `    <testcase name="Evaluate: ${r.input.substring(0, 40).replace(/"/g, '&quot;')}" classname="${report.testSuiteName}">\n`;
      if (!r.passed) {
        xml += `      <failure message="Evaluation failed"><![CDATA[${JSON.stringify(r.details, null, 2)}]]></failure>\n`;
      }
      xml += `    </testcase>\n`;
    }
    xml += `  </testsuite>\n`;
    xml += `</testsuites>\n`;
    fs.writeFileSync(junitPath, xml, 'utf8');

    console.log(`\nEvaluation complete!`);
    console.log(`Overall score: ${overallScore}%`);
    console.log(`JUnit report: ${junitPath}`);
    console.log(`JSON report: ${jsonReportPath}\n`);
  });

// ── cost ─────────────────────────────────────────────────────────────────────

program
  .command('cost <threadId>')
  .description('Show cost and token usage breakdown for a thread')
  .action(async (threadId) => {
    const { CostTracker } = await import('./core/monitoring/cost.js');
    const tracker = CostTracker.getInstance();
    const breakdown = tracker.getUsageBreakdown(threadId);
    console.log(`\n=== Usage Breakdown for Thread: ${threadId} ===`);
    console.log(`Prompt Tokens:     ${breakdown.promptTokens}`);
    console.log(`Completion Tokens: ${breakdown.completionTokens}`);
    console.log(`Total Cost:        $${breakdown.costUsd.toFixed(6)}\n`);
  });

// ── speckit ─────────────────────────────────────────────────────────────────

const speckit = program
  .command('speckit')
  .description('Spec Kit CLI integration');

speckit
  .command('constitution <principles>')
  .description('Create project constitution')
  .action(async (principles) => {
    const integration = new SpecKitIntegration();
    const res = await integration.createConstitution(principles);
    console.log(res.success ? 'Constitution created' : 'Constitution failed');
    console.log(res.output);
    if (!res.success) process.exit(1);
  });

speckit
  .command('specify <description>')
  .description('Create a feature specification')
  .action(async (description) => {
    const integration = new SpecKitIntegration();
    const res = await integration.specifyFeature(description);
    console.log(res.output);
    if (!res.success) process.exit(1);
  });

speckit
  .command('plan [specPath]')
  .description('Generate an implementation plan')
  .action(async (specPath) => {
    const integration = new SpecKitIntegration();
    const res = await integration.generatePlan(specPath);
    console.log(res.output);
    if (!res.success) process.exit(1);
  });

speckit
  .command('tasks [planPath]')
  .description('Generate actionable tasks')
  .action(async (planPath) => {
    const integration = new SpecKitIntegration();
    const res = await integration.generateTasks(planPath);
    console.log(res.output);
    if (!res.success) process.exit(1);
  });

speckit
  .command('implement [tasksPath]')
  .description('Execute implementation')
  .action(async (tasksPath) => {
    const integration = new SpecKitIntegration();
    const res = await integration.implement(tasksPath);
    console.log(res.output);
    if (!res.success) process.exit(1);
  });

speckit
  .command('verify')
  .description('Run verification (tests, lint, typecheck)')
  .action(async () => {
    const integration = new SpecKitIntegration();
    const res = await integration.verify();
    console.log(res.output);
    if (!res.success) process.exit(1);
  });

speckit
  .command('converge')
  .description('Find remaining work')
  .action(async () => {
    const integration = new SpecKitIntegration();
    const res = await integration.converge();
    console.log(res.output);
    if (!res.success) process.exit(1);
  });

// ── eval ────────────────────────────────────────────────────────────────────

program
  .command('eval')
  .description('Run evaluation gates (typecheck, lint, test)')
  .option('--no-tests', 'Skip test gate')
  .option('--no-lint', 'Skip lint gate')
  .option('--no-typecheck', 'Skip typecheck gate')
  .action(async (opts) => {
    const { Evaluator } = await import('./core/evaluation/runner.js');
    const { TypeCheckGate, LintGate, TestGate } = await import('./core/evaluation/gates.js');
    const { ConsoleReporter } = await import('./core/evaluation/reporters.js');
    const gates = [];
    if (opts.typecheck) gates.push(new TypeCheckGate());
    if (opts.lint) gates.push(new LintGate());
    if (opts.tests) gates.push(new TestGate());
    const evaluator = new Evaluator({ gates });
    const result = await evaluator.evaluate({ output: null, artifacts: [] });
    new ConsoleReporter().report(result);
    if (!result.evaluation.passed) process.exit(1);
  });

// ── resume (HITL) ────────────────────────────────────────────────────────────

program
  .command('resume <threadId>')
  .description('Resume an interrupted workflow (HITL)')
  .option('--edit-state', 'Open $EDITOR to edit state before resuming')
  .option('--state-json <json>', 'JSON string with state edits to merge')
  .option('--state-file <path>', 'Path to JSON file with state edits')
  .option('--checkpoint <id>', 'Specific checkpoint ID to resume from (defaults to latest)')
  .action(async (threadId, opts) => {
    const { SqliteCheckpointer } = await import('./core/checkpointer/sqlite.js');
    
    const checkpointer = new SqliteCheckpointer('./.harness/checkpoints.db');
    const checkpoints = await checkpointer.list(threadId);
    
    if (checkpoints.length === 0) {
      console.error(`No checkpoints found for thread: ${threadId}`);
      checkpointer.close();
      process.exit(1);
    }
    
    // Get the checkpoint to resume from
    let checkpoint = checkpoints.find(c => c.checkpointId === opts.checkpoint);
    if (!checkpoint) {
      if (opts.checkpoint) {
        console.error(`Checkpoint not found: ${opts.checkpoint}`);
        checkpointer.close();
        process.exit(1);
      }
      // Use the latest checkpoint
      checkpoint = checkpoints[checkpoints.length - 1];
    }
    
    // checkpoint is guaranteed to be defined here
    const cp = checkpoint!;
    
    let editedState: unknown | undefined;
    
    if (opts.editState) {
      // Open editor with current state
      const tmpFile = path.join('/tmp', `harness-state-${threadId}.json`);
      fs.writeFileSync(tmpFile, JSON.stringify(cp.state, null, 2));
      const { spawnSync } = await import('node:child_process');
      const editor = process.env['EDITOR'] ?? 'vi';
      const result = spawnSync(editor, [tmpFile], { stdio: 'inherit' });
      if (result.error || result.status !== 0) {
        console.error('Editor exited with error');
        checkpointer.close();
        process.exit(1);
      }
      editedState = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
      fs.unlinkSync(tmpFile);
    } else if (opts.stateJson) {
      editedState = JSON.parse(opts.stateJson);
    } else if (opts.stateFile) {
      editedState = JSON.parse(fs.readFileSync(opts.stateFile, 'utf8'));
    }
    
    // For resume, we need a graph - but we need the workflow definition
    // This is a simplified version - in practice you'd load the workflow from storage
    console.log(`Resuming thread ${threadId} from checkpoint ${cp.checkpointId}`);
    console.log('State:', JSON.stringify(cp.state, null, 2));
    if (editedState) {
      console.log('Edited state:', JSON.stringify(editedState, null, 2));
    }
    
    // The actual resume would be done via the CompiledGraph
    // This requires the workflow to be loaded and compiled with checkpointer
    console.log('Use the SDK for full resume: CompiledGraph.resume({ threadId, checkpointId, editedState })');
    
    checkpointer.close();
  });

// ── checkpoints ──────────────────────────────────────────────────────────────

program
  .command('checkpoints <threadId>')
  .description('List checkpoints for a thread')
  .action(async (threadId) => {
    const { SqliteCheckpointer } = await import('./core/checkpointer/sqlite.js');
    const checkpointer = new SqliteCheckpointer('./.harness/checkpoints.db');
    const checkpoints = await checkpointer.list(threadId);
    
    if (checkpoints.length === 0) {
      console.log(`No checkpoints found for thread: ${threadId}`);
      checkpointer.close();
      return;
    }
    
    console.log(`Checkpoints for thread ${threadId}:`);
    for (const cp of checkpoints) {
      console.log(`  ${cp.checkpointId} | step: ${cp.metadata.step} | node: ${cp.metadata.node || 'N/A'} | ${cp.createdAt.toISOString()}`);
    }
    
    checkpointer.close();
  });

program.parse();
