import { SpecKitIntegration } from '../dist/index.js';

async function main() {
  const speckit = new SpecKitIntegration({
    cliPath: 'specify',
    projectRoot: process.cwd(),
    timeoutMs: 600_000,
  });

  // Check prerequisites
  console.log('Checking prerequisites...');
  const prereqs = await speckit.checkPrerequisites();
  console.log('Prerequisites:', prereqChecks);

  if (!prereqs.allPass) {
    console.warn('Some prerequisites are not met:', prereqs.missing);
  }

  // Run the full SDD loop
  console.log('\nStarting spec-driven development loop...');
  const result = await speckit.runFullLoop(
    'Add user authentication with JWT tokens',
  );

  console.log('\n=== SDD Result ===');
  console.log('Phase reached:', result.phase);
  console.log('Output dir:', result.outputDir);
  console.log('Files created:', result.files?.length ?? 0);
  if (result.error) console.error('Error:', result.error);

  // Get task list
  console.log('\nFetching task list...');
  const tasks = await speckit.getTasks();
  console.log(`Generated ${tasks.length} tasks`);
  for (const t of tasks.slice(0, 3)) {
    console.log(`  [${t.priority}] ${t.title} — ${t.labels.join(', ')}`);
  }
}

main().catch(console.error);
