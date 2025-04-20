import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import yaml from 'js-yaml';
import untildify_default from 'untildify';
import { PathLike } from 'fs';

// --- Constants ---
const CONFIG_FILE_NAMES = ['.mcp-saferun.yaml', '.mcp-saferun.yml'];

// --- Types ---

// Define the structure of a single profile within the config file
export interface ConfigProfile {
    'target-env'?: Record<string, string>;
    // Add other profile-specific settings here later if needed
}

// Define the overall structure of the config file
export interface ConfigFile {
    profiles: Record<string, ConfigProfile>;
    // Add global settings here later if needed
}

// Define the interface for injectable dependencies
interface LoadConfigDependencies {
    fsAccess: (path: PathLike, mode?: number) => Promise<void>;
    fsReadFile: (path: PathLike, options: { encoding: BufferEncoding } | BufferEncoding) => Promise<string>;
    fsMkdir: (path: PathLike, options?: import('fs').MakeDirectoryOptions) => Promise<string | undefined>;
    osHomedir: () => string;
    yamlLoad: (input: string, options?: yaml.LoadOptions) => unknown;
    untildify: (path: string) => string;
    cwd: () => string;
}

// --- Functions ---

/**
 * Gets the path to the user-specific configuration directory.
 */
function getUserConfigDir(homedirFunc: () => string): string {
    return path.join(homedirFunc(), '.config', 'mcp-safe-run');
}

/**
 * Checks if a file exists and is accessible.
 */
async function fileExists(filePath: string, fsAccessFunc: LoadConfigDependencies['fsAccess']): Promise<boolean> {
    try {
        await fsAccessFunc(filePath);
        return true;
    } catch {
        return false;
    }
}

/**
 * Finds the configuration file path by searching standard locations.
 */
async function findConfigFile(deps: LoadConfigDependencies): Promise<string | null> {
    const currentDir = deps.cwd();

    // 1. Check current directory
    for (const fileName of CONFIG_FILE_NAMES) {
        const localPath = path.join(currentDir, fileName);
        if (await fileExists(localPath, deps.fsAccess)) {
            return localPath;
        }
    }

    // 2. Check user config directory
    const userConfigDir = getUserConfigDir(deps.osHomedir);
    try {
      await deps.fsMkdir(userConfigDir, { recursive: true }); // Ensure directory exists
    } catch (mkdirErr) {
      // Ignore error if directory already exists, bubble up others
      if ((mkdirErr as NodeJS.ErrnoException)?.code !== 'EEXIST') {
        console.warn(`[mcp-safe-run] Warning: Could not create user config dir ${userConfigDir}: ${mkdirErr}`);
      }
    }
    for (const fileName of CONFIG_FILE_NAMES) {
        const userPath = path.join(userConfigDir, fileName);
        if (await fileExists(userPath, deps.fsAccess)) {
            return userPath;
        }
    }

    return null;
}

/**
 * Loads and parses the configuration file.
 * @param configPath Optional path to a specific config file.
 * @param injectedDeps Optional dependencies for testing.
 * @returns The parsed configuration object, or null if no file is found or parsing fails.
 */
export async function loadConfig(
    configPath?: string,
    injectedDeps?: Partial<LoadConfigDependencies> // Allow partial injection for tests
): Promise<{ config: ConfigFile; filePath: string } | null> {
    // Use injected dependencies or fall back to real ones
    const deps: LoadConfigDependencies = {
        fsAccess: injectedDeps?.fsAccess ?? fs.access,
        fsReadFile: injectedDeps?.fsReadFile ?? fs.readFile,
        fsMkdir: injectedDeps?.fsMkdir ?? fs.mkdir,
        osHomedir: injectedDeps?.osHomedir ?? os.homedir,
        yamlLoad: injectedDeps?.yamlLoad ?? yaml.load,
        untildify: injectedDeps?.untildify ?? untildify_default,
        cwd: injectedDeps?.cwd ?? process.cwd,
    };

    let finalPath: string | null = null;

    if (configPath) {
        finalPath = deps.untildify(configPath);
        if (!(await fileExists(finalPath, deps.fsAccess))) {
            console.error(`[mcp-safe-run] Error: Specified config file not found: ${finalPath}`);
            return null;
        }
    } else {
        finalPath = await findConfigFile(deps);
    }

    if (!finalPath) {
        // Only warn if no specific path was given
        if (!configPath) {
             console.warn('[mcp-safe-run] Warning: No config file found in standard locations (.mcp-saferun.yaml/.yml in project or ~/.config/mcp-safe-run/).');
        }
        return null;
    }

    try {
        const fileContent = await deps.fsReadFile(finalPath, 'utf8');
        const config = deps.yamlLoad(fileContent) as ConfigFile;

        // Basic validation
        if (!config || typeof config !== 'object') {
            throw new Error('Config file is empty or not a valid object.');
        }
        if (!config.profiles || typeof config.profiles !== 'object') {
            throw new Error('Config file must contain a top-level "profiles" object.');
        }

        console.log(`[mcp-safe-run] Loaded configuration from: ${finalPath}`);
        return { config, filePath: finalPath };
    } catch (err) {
        console.error(`[mcp-safe-run] Error loading or parsing config file "${finalPath}": ${err instanceof Error ? err.message : String(err)}`);
        return null;
    }
} 