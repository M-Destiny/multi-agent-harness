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
      };
      const sub = new SubAgent(subCfg, memory);
      master.addSubAgent(sub);
    }
    await master.initialize();
    const result = await master.executeWorkflow(workflow);
    logger.info({ status: result.status, duration: result.totalDurationMs }, 'Workflow finished');
    await master.shutdown();
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

program.parse();
