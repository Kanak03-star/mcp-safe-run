#!/usr/bin/env node

import { Command } from 'commander';
import { spawn } from 'child_process';
import { resolvePlaceholders, ResolutionError } from './placeholder-resolver.js';
import { loadConfig, ConfigFile } from './config-loader.js';
import packageJson from '../package.json' with { type: 'json' };

// --- Main CLI Setup ---
const program = new Command();

program
  .version(packageJson.version, '-V, --version', 'output the current version')
  .description('Securely launch MCP servers by resolving credentials from external sources.')
  .option('-c, --config <path>', 'path to a custom configuration file (.yaml or .yml)')
  .option('-p, --profile <name>', 'name of the profile to use from the configuration file')
  .option('--target-env <jsonString>',
    'JSON string mapping target env vars (overrides config file profile)')
  .option('-v, --verbose', 'enable verbose logging')
  .addHelpText('after', `
    Configuration:
      Searches for .mcp-saferun.yaml or .mcp-saferun.yml in the current directory,
      then in ~/.config/mcp-safe-run/.
      Use -c to specify a path, and -p to select a profile from the file.
      The --target-env flag always overrides settings from a config file profile.

    Examples:
      # Basic help
      $ mcp-safe-run --help

      # Using CLI --target-env
      $ mcp-safe-run --target-env '{"API_KEY":"env:GH_TOKEN_FOR_MCP"}' npx -y @modelcontextprotocol/server-github
      $ mcp-safe-run --target-env '{"TOKEN":"file:~/secret.txt","SECRET":"keyring:service:account"}' npx -y @modelcontextprotocol/server-github

      # Using a config file profile (e.g., 'dev')
      $ mcp-safe-run -p dev npx -y @modelcontextprotocol/server-github

      # Using a specific config file and profile
      $ mcp-safe-run -c ./my-custom-config.yaml -p staging npx -y @modelcontextprotocol/server-github
  `)
  .argument('<targetCommand>', 'The target MCP server command to run (e.g., npx, python)')
  .argument('[targetArgs...]', 'Arguments for the target MCP server command')
  .allowUnknownOption(false)
  .parse(process.argv);

// --- Argument Processing ---
const options = program.opts();
const verbose = options.verbose as boolean;
const targetCommand = program.args[0]!;
const targetArgs = program.args.slice(1);
const specifiedConfigPath = options.config as string | undefined;
const specifiedProfile = options.profile as string | undefined;
const targetEnvJson = options.targetEnv as string | undefined;

console.error(`[mcp-safe-run] Starting ${packageJson.name} v${packageJson.version}`);
console.error(`[mcp-safe-run] Target Command = ${targetCommand}`);
console.error(`[mcp-safe-run] Target Args = [${targetArgs.join(', ')}]`);

// --- Async IIFE for async/await ---
(async () => {
  // 1. Determine Target Environment Instructions
  let instructions: Record<string, string> | null = null;
  let sourceDescription = 'Inherited environment only'; // Default description

  if (targetEnvJson) {
    // --target-env overrides everything
    console.error(`[mcp-safe-run] Using --target-env JSON: ${targetEnvJson}`);
    sourceDescription = '--target-env option';
    try {
      instructions = JSON.parse(targetEnvJson);
      if (typeof instructions !== 'object' || instructions === null || Array.isArray(instructions)) {
        throw new Error('--target-env must be a valid JSON object string.');
      }
    } catch (err) {
       if (err instanceof SyntaxError) {
         console.error(`[mcp-safe-run] Invalid JSON for --target-env: ${err.message}`);
       } else if (err instanceof Error) {
         console.error(`[mcp-safe-run] Error processing --target-env: ${err.message}`);
       } else {
         console.error(`[mcp-safe-run] Unknown error processing --target-env: ${err}`);
       }
       process.exit(1);
    }
  } else {
    // Try loading config file if --target-env was not used
    const configResult = await loadConfig(specifiedConfigPath);

    if (configResult) {
        const { config, filePath } = configResult;
        if (!specifiedProfile) {
            console.error(`[mcp-safe-run] Error: Config file loaded (${filePath}), but no profile specified with -p/--profile.`);
            console.error(`[mcp-safe-run] Available profiles: ${Object.keys(config.profiles).join(', ')}`);
            process.exit(1);
        }

        const profileData = config.profiles[specifiedProfile];
        if (!profileData) {
             console.error(`[mcp-safe-run] Error: Profile "${specifiedProfile}" not found in config file ${filePath}.`);
             console.error(`[mcp-safe-run] Available profiles: ${Object.keys(config.profiles).join(', ')}`);
             process.exit(1);
        }

        if (profileData['target-env']) {
            instructions = profileData['target-env'];
            sourceDescription = `profile "${specifiedProfile}" from ${filePath}`;
            console.error(`[mcp-safe-run] Using target-env from ${sourceDescription}`);
        } else {
             console.warn(`[mcp-safe-run] Warning: Profile "${specifiedProfile}" in ${filePath} has no 'target-env' defined.`);
             sourceDescription = `profile "${specifiedProfile}" (empty) from ${filePath}`;
        }
    } else if (specifiedConfigPath) {
         // Config was specified but failed to load (error already printed by loadConfig)
         process.exit(1);
    } else if (specifiedProfile) {
         // Profile specified but no config file found/loaded
         console.error(`[mcp-safe-run] Error: Profile "${specifiedProfile}" specified, but no configuration file found or loaded.`);
         process.exit(1);
    }
    // If neither --target-env nor a valid profile was found, instructions remains null
  }

  // 2. Resolve Placeholders if instructions were found
  let resolvedEnv: Record<string, string | undefined> = { ...process.env };

  if (instructions) {
    console.error(`[mcp-safe-run] Resolving placeholders based on ${sourceDescription}...`);
    try {
        const resolved = await resolvePlaceholders(instructions);
        if (verbose) {
            console.error(`[mcp-safe-run] Resolved environment additions/overrides: ${JSON.stringify(resolved)}`);
        }
        resolvedEnv = { ...resolvedEnv, ...resolved };
        console.error('[mcp-safe-run] Placeholders resolved successfully.');
    } catch (err) {
        if (err instanceof ResolutionError) {
            console.error(`[mcp-safe-run] Placeholder resolution failed: ${err.message} (Placeholder: ${err.placeholder})`);
        } else if (err instanceof Error) { // Catch errors from keytar loading etc.
            console.error(`[mcp-safe-run] Error resolving placeholders: ${err.message}`);
        } else {
            console.error(`[mcp-safe-run] Unknown error resolving placeholders: ${err}`);
        }
        process.exit(1);
    }
  } else {
     console.error(`[mcp-safe-run] No target environment instructions provided via --target-env or config file profile. Using only inherited environment.`);
  }

  if (verbose) {
    // Log the final *complete* environment going to the child process
    console.error(`[mcp-safe-run] Final environment for target process: ${JSON.stringify(resolvedEnv)}`);
  }

  // 3. Spawn Target Process (No changes needed below this line)
  console.error('[mcp-safe-run] Spawning target process...');
  try {
    const child = spawn(targetCommand, targetArgs, { env: resolvedEnv as NodeJS.ProcessEnv });
    if (verbose) {
      console.error(`[mcp-safe-run] Spawned child PID: ${child.pid}`);
    }

    // Pipe stdio
    process.stdin.pipe(child.stdin);
    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);

    // Exit handling
    child.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      if (signal) {
        console.error(`[mcp-safe-run] Target process killed by signal ${signal}`);
        process.exit(1);
      } else {
        console.error(`[mcp-safe-run] Target process exited with code ${code}`);
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

    // Relay termination signals
    process.on('SIGINT', () => {
      console.error('[mcp-safe-run] SIGINT received, terminating target process...');
      child.kill('SIGINT'); setTimeout(() => child.kill('SIGKILL'), 1000);
    });
    process.on('SIGTERM', () => {
      console.error('[mcp-safe-run] SIGTERM received, terminating target process...');
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
  console.error(`[mcp-safe-run] Uncaught error in main async block: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});