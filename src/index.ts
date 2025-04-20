#!/usr/bin/env node

import { Command } from 'commander';
import { spawn } from 'child_process';
// Import package.json to read version (requires tsconfig "resolveJsonModule": true)
import packageJson from '../package.json' with { type: 'json' };

// --- Placeholder for future imports ---
// import { resolvePlaceholders } from './placeholder-resolver';
// import keytar from 'keytar'; // If adding keyring support later
// import untildify from 'untildify'; // If adding file support later

// --- Main CLI Setup ---
const program = new Command();

program
  .version(packageJson.version)
  .description('Securely launch MCP servers by resolving credentials from external sources.')
  .option('--target-env <jsonString>', 'JSON string mapping target env vars to literals or placeholders (e.g., \'{"API_KEY": "env:MY_API_KEY"}\')')
  // Use `.argument` for the required target command/args
  // Use `variadic: true` to capture all arguments after '--'
  .argument('<targetCommand>', 'The target MCP server command to run (e.g., npx, python)')
  .argument('[targetArgs...]', 'Arguments for the target MCP server command')
  .allowUnknownOption(false) // Don't allow extra flags before '--'
  .parse(process.argv);

// --- Argument Processing ---
const options = program.opts();
// Ensure arguments are strings and provided
const args = program.args as string[];
const targetCommand = args[0];
const targetArgs = args.slice(1);
if (!targetCommand) {
    console.error("Error: No target command provided.");
    process.exit(1);
}

console.error(`Launcher MVP: Starting...`); // Log to stderr
console.error(`Target Command: ${targetCommand}`);
console.error(`Target Args: ${targetArgs.join(' ')}`);
console.error(`Target Env Instructions: ${options.targetEnv || '(Not provided)'}`);

// --- MVP Core Logic Placeholder ---

// 1. Parse and Resolve Placeholders from options.targetEnv
let targetEnv = { ...process.env }; // Start with inherited environment
if (options.targetEnv) {
    try {
        const envInstructions = JSON.parse(options.targetEnv);
        console.error("MVP: Placeholder resolution logic goes here.");
        // TODO: Implement placeholder parsing (env:, file:, keyring:)
        // For MVP, just merge the literal JSON for demonstration/testing
        // In real MVP, this section resolves placeholders and merges into targetEnv
        targetEnv = { ...targetEnv, ...envInstructions }; // !!Replace with actual resolved values!!
        console.error("MVP: Using provided env instructions literally for now.");

    } catch (err) {
        console.error(`Error: Invalid JSON provided for --target-env: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
    }
} else {
    console.error("Warning: No --target-env provided. Target will inherit launcher's environment.");
}


// 2. Spawn the Target Process
console.error(`MVP: Spawning target process with resolved environment...`);
try {
    const child = spawn(targetCommand, targetArgs, { env: targetEnv });

    // 3. Setup Stdio Piping
    process.stdin.pipe(child.stdin);    // Client -> Wrapper -> Target
    child.stdout.pipe(process.stdout); // Target -> Wrapper -> Client
    child.stderr.pipe(process.stderr); // Target -> Wrapper -> Wrapper's stderr

    // 4. Handle Target Process Exit
    child.on('exit', (code: number | null) => {
        console.error(`Target process exited with code ${code ?? 'null'}`);
        process.exit(code ?? 1); // Exit wrapper with the same code
    });

    child.on('error', (err: Error) => {
        console.error(`Error spawning/managing target process: ${err.message}`);
        process.exit(1);
    });

} catch (spawnError) {
     console.error(`Fatal error trying to spawn target command "${targetCommand}": ${spawnError instanceof Error ? spawnError.message : String(spawnError)}`);
     process.exit(1);
}