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
            throw new ResolutionError('Environment variable name cannot be empty.', placeholder);
        }
        const value = process.env[varName];
        if (value === undefined) {
            throw new ResolutionError(`Environment variable "${varName}" is not set.`, placeholder);
        }
        return value;
    }

    if (placeholder.startsWith('file:')) {
        const filePath = placeholder.substring(5);
        if (!filePath) {
            throw new ResolutionError('File path cannot be empty.', placeholder);
        }
        const expandedPath = untildify(filePath);
        try {
            const content = await fs.readFile(expandedPath, 'utf-8');
            return content.trim(); // Trim whitespace from file content
        } catch (err: any) {
            if (err.code === 'ENOENT') {
                throw new ResolutionError(`File not found at "${expandedPath}".`, placeholder);
            }
            throw new ResolutionError(`Failed to read file "${expandedPath}": ${err.message}`, placeholder);
        }
    }

    if (placeholder.startsWith('keyring:')) {
        if (!keytar) {
             throw new ResolutionError('keytar module is not available. Cannot resolve keyring: placeholders.', placeholder);
        }
        const parts = placeholder.substring(8).split(':');
        if (parts.length !== 2 || !parts[0] || !parts[1]) {
            throw new ResolutionError('Invalid keyring format. Expected "keyring:service:account".', placeholder);
        }
        const [service, account] = parts;
        try {
            const secret = await keytar.getPassword(service, account);
            if (secret === null) { // keytar returns null if not found
                throw new ResolutionError(`Secret not found in keychain for service="${service}", account="${account}".`, placeholder);
            }
            return secret;
        } catch (err: any) {
             throw new ResolutionError(`Failed to get secret from keychain for service="${service}", account="${account}": ${err.message}`, placeholder);
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
                // Add the target variable name to the error context
                throw new ResolutionError(`Failed to resolve placeholder for environment variable "${key}": ${err.message}`, err.placeholder);
            } else {
                 // Rethrow unexpected errors
                 throw new Error(`Unexpected error resolving placeholder for "${key}": ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    });

    await Promise.all(resolutionPromises); // Wait for all resolutions to complete
    return resolvedEnv;
}