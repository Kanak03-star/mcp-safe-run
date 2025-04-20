#!/usr/bin/env node

import { Command } from 'commander';
import { spawn } from 'child_process';
import { resolvePlaceholders, ResolutionError } from './placeholder-resolver.js';
import packageJson from '../package.json' with { type: 'json' };

// --- Main CLI Setup ---
const program = new Command();

program
  .version(packageJson.version)
  .description('Securely launch MCP servers by resolving credentials from external sources.')
  .option('--target-env <jsonString>',
    'JSON string mapping target env vars to literals or placeholders (e.g., \'{"API_KEY": "env:MY_API_KEY"}\')')
  .argument('<targetCommand>', 'The target MCP server command to run (e.g., npx, python)')
  .argument('[targetArgs...]', 'Arguments for the target MCP server command')
  .allowUnknownOption(false)
  .parse(process.argv);

// --- Argument Processing ---
const options = program.opts();
const targetCommand = program.args[0]!;
const targetArgs = program.args.slice(1);

console.error(`Launcher: Starting ${packageJson.name} v${packageJson.version}`);
console.error(`Launcher: Target Command = ${targetCommand}`);
console.error(`Launcher: Target Args = [${targetArgs.join(', ')}]`);
console.error(`Launcher: Raw Target Env Instructions = ${options.targetEnv || '(Not provided)'}`);

// --- Async IIFE for async/await ---
(async () => {
  // 1. Resolve Target Environment
  let resolvedEnv: Record<string, string | undefined> = { ...process.env };
  let instructions: Record<string, string> = {};

  if (options.targetEnv) {
    try {
      instructions = JSON.parse(options.targetEnv);
      if (typeof instructions !== 'object' || instructions === null || Array.isArray(instructions)) {
        throw new Error('--target-env must be a valid JSON object string.');
      }
      console.error('Launcher: Resolving placeholders in --target-env...');
      const resolved = await resolvePlaceholders(instructions);
      resolvedEnv = { ...resolvedEnv, ...resolved };
      console.error('Launcher: Placeholders resolved successfully.');
    } catch (err) {
      if (err instanceof ResolutionError) {
        console.error(`[mcp-safe-run] ${err.message} (Placeholder: ${err.placeholder})`);
      } else if (err instanceof SyntaxError) {
        console.error(`[mcp-safe-run] Invalid JSON for --target-env: ${err.message}`);
      } else if (err instanceof Error) {
        console.error(`[mcp-safe-run] Error processing --target-env: ${err.message}`);
      } else {
        console.error(`[mcp-safe-run] Unknown error processing --target-env: ${err}`);
      }
      process.exit(1);
    }
  } else {
    console.error('Launcher: No --target-env provided. Using inherited environment.');
  }

  // 2. Spawn Target Process
  console.error('Launcher: Spawning target process...');
  try {
    const child = spawn(targetCommand, targetArgs, { env: resolvedEnv as NodeJS.ProcessEnv });

    // 3. Pipe stdio
    process.stdin.pipe(child.stdin);
    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);

    // 4. Exit handling
    child.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      if (signal) {
        console.error(`Launcher: Process killed by signal ${signal}`);
        process.exit(1);
      } else {
        console.error(`Launcher: Process exited with code ${code}`);
        process.exit(code ?? 0);
      }
    });

    child.on('error', (err: Error) => {
      if ((err as any).code === 'ENOENT') {
        console.error(`[mcp-safe-run] Target command not found: ${targetCommand}`);
      } else {
        console.error(`[mcp-safe-run] Error spawning target process: ${err.message}`);
      }
      process.stdin.unpipe(child.stdin);
      process.exit(1);
    });

    // 5. Relay termination signals
    process.on('SIGINT', () => {
      console.error('Launcher: SIGINT received, terminating child...');
      child.kill('SIGINT'); setTimeout(() => child.kill('SIGKILL'), 1000);
    });
    process.on('SIGTERM', () => {
      console.error('Launcher: SIGTERM received, terminating child...');
      child.kill('SIGTERM'); setTimeout(() => child.kill('SIGKILL'), 1000);
    });
  } catch (err) {
    if ((err as any).code === 'ENOENT') {
      console.error(`[mcp-safe-run] Target command not found: ${targetCommand}`);
    } else {
      console.error(`[mcp-safe-run] Fatal spawn error: ${err instanceof Error ? err.message : err}`);
    }
    process.exit(1);
  }
})().catch(err => {
  console.error(`[mcp-safe-run] Uncaught error: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});