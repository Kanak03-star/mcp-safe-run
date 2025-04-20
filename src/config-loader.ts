import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import yaml from 'js-yaml';
import untildify from 'untildify';

// --- Constants ---
const CONFIG_FILE_NAMES = ['.mcp-saferun.yaml', '.mcp-saferun.yml'];
const USER_CONFIG_DIR = path.join(os.homedir(), '.config', 'mcp-safe-run');

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

// --- Functions ---

/**
 * Checks if a file exists and is accessible.
 * @param filePath The path to the file.
 * @returns True if the file exists, false otherwise.
 */
async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

/**
 * Finds the configuration file path by searching standard locations.
 * @returns The path to the found config file, or null if none is found.
 */
async function findConfigFile(): Promise<string | null> {
    const currentDir = process.cwd();

    // 1. Check current directory
    for (const fileName of CONFIG_FILE_NAMES) {
        const localPath = path.join(currentDir, fileName);
        if (await fileExists(localPath)) {
            return localPath;
        }
    }

    // 2. Check user config directory
    await fs.mkdir(USER_CONFIG_DIR, { recursive: true }); // Ensure directory exists
    for (const fileName of CONFIG_FILE_NAMES) {
        const userPath = path.join(USER_CONFIG_DIR, fileName);
        if (await fileExists(userPath)) {
            return userPath;
        }
    }

    return null;
}

/**
 * Loads and parses the configuration file.
 * @param configPath Optional path to a specific config file.
 *                 If not provided, searches standard locations.
 * @returns The parsed configuration object, or null if no file is found or parsing fails.
 */
export async function loadConfig(configPath?: string): Promise<{ config: ConfigFile; filePath: string } | null> {
    let finalPath: string | null = null;

    if (configPath) {
        finalPath = untildify(configPath);
        if (!(await fileExists(finalPath))) {
            console.error(`[mcp-safe-run] Error: Specified config file not found: ${finalPath}`);
            return null;
        }
    } else {
        finalPath = await findConfigFile();
    }

    if (!finalPath) {
        console.warn('[mcp-safe-run] Warning: No config file found in standard locations (.mcp-saferun.yaml/.yml in project or ~/.config/mcp-safe-run/).');
        return null;
    }

    try {
        const fileContent = await fs.readFile(finalPath, 'utf8');
        const config = yaml.load(fileContent) as ConfigFile;

        // Basic validation
        if (!config || typeof config !== 'object') {
            throw new Error('Config file is empty or not a valid object.');
        }
        if (!config.profiles || typeof config.profiles !== 'object') {
            throw new Error('Config file must contain a top-level "profiles" object.');
        }

        console.error(`[mcp-safe-run] Loaded configuration from: ${finalPath}`);
        return { config, filePath: finalPath };
    } catch (err) {
        console.error(`[mcp-safe-run] Error loading or parsing config file "${finalPath}": ${err instanceof Error ? err.message : String(err)}`);
        return null;
    }
} 