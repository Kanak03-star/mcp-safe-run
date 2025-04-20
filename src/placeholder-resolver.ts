import fs from 'fs/promises';
import path from 'path';
import untildify from 'untildify';

// Dynamically import keytar to handle cases where it might fail to install/load
let keytar: typeof import('keytar') | null = null;
try {
    // Use dynamic import() which returns a promise
    keytar = await import('keytar');
} catch (err) {
    console.warn('Warning: Could not load keytar module. keyring: placeholders will not work. Error:', err);
    keytar = null; // Ensure keytar is null if import fails
}

export class ResolutionError extends Error {
    constructor(message: string, public readonly placeholder: string) {
        super(message);
        this.name = 'ResolutionError';
    }
}

/**
 * Resolves a single placeholder string to its actual value.
 * @param placeholder The placeholder string (e.g., "env:MY_VAR", "file:~/secret.txt")
 * @returns The resolved secret value as a string.
 * @throws {ResolutionError} If the placeholder is invalid or resolution fails.
 */
export async function resolveSinglePlaceholder(placeholder: string): Promise<string> {
    if (placeholder.startsWith('env:')) {
        const varName = placeholder.substring(4);
        if (!varName) {
            throw new ResolutionError(`Placeholder "${placeholder}" invalid: environment variable name cannot be empty.`, placeholder);
        }
        const value = process.env[varName];
        if (value === undefined) {
            throw new ResolutionError(`Placeholder "${placeholder}" resolution failed: environment variable "${varName}" is not set.`, placeholder);
        }
        return value;
    }

    if (placeholder.startsWith('file:')) {
        const filePath = placeholder.substring(5);
        if (!filePath) {
            throw new ResolutionError(`Placeholder "${placeholder}" invalid: file path cannot be empty.`, placeholder);
        }
        const expandedPath = untildify(filePath);
        try {
            const content = await fs.readFile(expandedPath, 'utf-8');
            return content.trim(); // Trim whitespace from file content
        } catch (err: any) {
            if (err.code === 'ENOENT') {
                throw new ResolutionError(`Placeholder "${placeholder}" resolution failed: file not found at "${expandedPath}".`, placeholder);
            }
            throw new ResolutionError(`Placeholder "${placeholder}" resolution failed: failed to read file "${expandedPath}": ${err.message}`, placeholder);
        }
    }

    if (placeholder.startsWith('keyring:')) {
        if (!keytar) {
             throw new ResolutionError(`Placeholder "${placeholder}" resolution failed: keytar module is not available.`, placeholder);
        }
        const parts = placeholder.substring(8).split(':');
        if (parts.length !== 2 || !parts[0] || !parts[1]) {
            throw new ResolutionError(`Placeholder "${placeholder}" invalid format: expected "keyring:service:account".`, placeholder);
        }
        const [service, account] = parts;
        try {
            const secret = await keytar.getPassword(service, account);
            if (secret === null) { // keytar returns null if not found
                throw new ResolutionError(`Placeholder "${placeholder}" resolution failed: secret not found in keychain for service="${service}", account="${account}".`, placeholder);
            }
            return secret;
        } catch (err: any) {
             throw new ResolutionError(`Placeholder "${placeholder}" resolution failed: could not get secret from keychain for service="${service}", account="${account}": ${err.message}`, placeholder);
        }
    }

    // If no prefix matches, return the value literally
    return placeholder;
}

/**
 * Resolves all placeholders within a target environment configuration object.
 * @param envInstructions The object parsed from --target-env JSON.
 * @returns A new object with placeholders resolved to their actual values.
 * @throws {ResolutionError} If any placeholder fails to resolve.
 */
export async function resolvePlaceholders(envInstructions: Record<string, string>): Promise<Record<string, string>> {
    const resolvedEnv: Record<string, string> = {};
    const resolutionPromises = Object.entries(envInstructions).map(async ([key, value]) => {
        try {
            const resolvedValue = await resolveSinglePlaceholder(value);
            resolvedEnv[key] = resolvedValue;
        } catch (err) {
            if (err instanceof ResolutionError) {
                throw new ResolutionError(`Placeholder "${err.placeholder}" for env var "${key}" resolution failed: ${err.message}`, err.placeholder);
            } else {
                 // Rethrow unexpected errors
                 throw new Error(`Unexpected error resolving placeholder "${value}" for env var "${key}": ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    });

    await Promise.all(resolutionPromises); // Wait for all resolutions to complete
    return resolvedEnv;
}