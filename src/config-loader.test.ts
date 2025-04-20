import { jest, describe, it, expect, afterEach, beforeEach } from '@jest/globals';
import path from 'path';

// --- Type Imports ---
import type * as fsPromises from 'fs/promises';
import type * as os from 'os';
import type * as yaml from 'js-yaml';
import type * as untildify from 'untildify';
import type { ConfigFile } from './config-loader.js'; // Import type for structure

// --- Mock Setup ---

// Hold references to mock functions
let mockFsAccess: jest.Mock;
let mockFsReadFile: jest.Mock;
let mockFsMkdir: jest.Mock;
let mockYamlLoad: jest.Mock;
let mockOsHomedir: jest.Mock;
let mockUntildify: jest.Mock;
let mockProcessCwd: jest.Mock;
let mockConsoleError: jest.SpyInstance;
let mockConsoleWarn: jest.SpyInstance;

// Mock the modules
jest.unstable_mockModule('fs/promises', () => {
    mockFsAccess = jest.fn();
    mockFsReadFile = jest.fn();
    mockFsMkdir = jest.fn().mockResolvedValue(undefined); // Mock mkdir success
    return {
        __esModule: true,
        default: {
            access: mockFsAccess,
            readFile: mockFsReadFile,
            mkdir: mockFsMkdir,
        },
        access: mockFsAccess,
        readFile: mockFsReadFile,
        mkdir: mockFsMkdir,
    };
});

jest.unstable_mockModule('js-yaml', () => {
    mockYamlLoad = jest.fn();
    return {
        __esModule: true,
        default: {
            load: mockYamlLoad,
        },
        load: mockYamlLoad,
    };
});

jest.unstable_mockModule('os', () => {
    mockOsHomedir = jest.fn();
    return {
        __esModule: true,
        default: {
            homedir: mockOsHomedir,
        },
        homedir: mockOsHomedir,
    };
});

jest.unstable_mockModule('untildify', () => {
    // Simple mock: just pass through for testing, can make more specific if needed
    mockUntildify = jest.fn((p: string) => p.startsWith('~') ? p.replace('~', '/mock/home') : p);
    return {
        __esModule: true,
        default: mockUntildify,
    };
});

// --- Dynamic Imports ---
// Import the function *after* mocks are defined
const { loadConfig } = await import('./config-loader.js');

// --- Test Suite ---

describe('loadConfig', () => {
    const MOCK_CWD = '/mock/project';
    const MOCK_HOME = '/mock/home';
    const MOCK_USER_CONFIG_DIR = path.join(MOCK_HOME, '.config', 'mcp-safe-run');
    const VALID_CONFIG: ConfigFile = {
        profiles: {
            test: {
                'target-env': { VAR: 'value' },
            },
        },
    };
    const VALID_CONFIG_YAML = `profiles:\n  test:\n    target-env:\n      VAR: value\n`;

    beforeEach(() => {
        // Reset mocks before each test
        mockFsAccess.mockReset();
        mockFsReadFile.mockReset();
        mockFsMkdir.mockReset().mockResolvedValue(undefined); // Reset to default success
        mockYamlLoad.mockReset();
        mockOsHomedir.mockReset().mockReturnValue(MOCK_HOME);
        mockUntildify.mockClear();
        mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {}); // Suppress errors
        mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {}); // Suppress warns
        mockProcessCwd = jest.spyOn(process, 'cwd').mockReturnValue(MOCK_CWD);
    });

    afterEach(() => {
        // Restore console and process.cwd
        mockConsoleError.mockRestore();
        mockConsoleWarn.mockRestore();
        mockProcessCwd.mockRestore();
        jest.clearAllMocks();
    });

    // --- Tests for Specific Path ---
    it('should load config from a specific valid path', async () => {
        const specificPath = '/path/to/my.yaml';
        mockFsAccess.mockResolvedValue(undefined); // File exists
        mockFsReadFile.mockResolvedValue(VALID_CONFIG_YAML);
        mockYamlLoad.mockReturnValue(VALID_CONFIG);

        const result = await loadConfig(specificPath);

        expect(result).toEqual({ config: VALID_CONFIG, filePath: specificPath });
        expect(mockFsAccess).toHaveBeenCalledWith(specificPath);
        expect(mockFsReadFile).toHaveBeenCalledWith(specificPath, 'utf8');
        expect(mockYamlLoad).toHaveBeenCalledWith(VALID_CONFIG_YAML);
        expect(mockUntildify).toHaveBeenCalledWith(specificPath);
        expect(mockConsoleError).not.toHaveBeenCalled();
    });

    it('should handle tilde expansion for specific path', async () => {
        const tildePath = '~/myconfig.yaml';
        const expandedPath = '/mock/home/myconfig.yaml';
        mockFsAccess.mockResolvedValue(undefined);
        mockFsReadFile.mockResolvedValue(VALID_CONFIG_YAML);
        mockYamlLoad.mockReturnValue(VALID_CONFIG);

        const result = await loadConfig(tildePath);

        expect(result).toEqual({ config: VALID_CONFIG, filePath: expandedPath });
        expect(mockUntildify).toHaveBeenCalledWith(tildePath);
        expect(mockFsAccess).toHaveBeenCalledWith(expandedPath);
        expect(mockFsReadFile).toHaveBeenCalledWith(expandedPath, 'utf8');
        expect(mockConsoleError).not.toHaveBeenCalled();
    });

    it('should return null and log error if specific path does not exist', async () => {
        const specificPath = '/path/to/nonexistent.yaml';
        mockFsAccess.mockRejectedValue(new Error('ENOENT')); // File does not exist

        const result = await loadConfig(specificPath);

        expect(result).toBeNull();
        expect(mockFsAccess).toHaveBeenCalledWith(specificPath);
        expect(mockFsReadFile).not.toHaveBeenCalled();
        expect(mockYamlLoad).not.toHaveBeenCalled();
        expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Specified config file not found'));
    });

    it('should return null and log error on file read error', async () => {
        const specificPath = '/path/to/readerror.yaml';
        mockFsAccess.mockResolvedValue(undefined);
        mockFsReadFile.mockRejectedValue(new Error('Read permission denied'));

        const result = await loadConfig(specificPath);

        expect(result).toBeNull();
        expect(mockFsReadFile).toHaveBeenCalledWith(specificPath, 'utf8');
        expect(mockYamlLoad).not.toHaveBeenCalled();
        expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Error loading or parsing config file'));
        expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Read permission denied'));
    });

    it('should return null and log error on YAML parse error', async () => {
        const specificPath = '/path/to/bad.yaml';
        const invalidYaml = 'profiles: \n test: ['; // Invalid YAML
        mockFsAccess.mockResolvedValue(undefined);
        mockFsReadFile.mockResolvedValue(invalidYaml);
        const parseError = new Error('YAML parsing failed');
        mockYamlLoad.mockImplementation(() => { throw parseError; });

        const result = await loadConfig(specificPath);

        expect(result).toBeNull();
        expect(mockYamlLoad).toHaveBeenCalledWith(invalidYaml);
        expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Error loading or parsing config file'));
        expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('YAML parsing failed'));
    });

    it('should return null and log error if config is not an object', async () => {
        const specificPath = '/path/to/scalar.yaml';
        mockFsAccess.mockResolvedValue(undefined);
        mockFsReadFile.mockResolvedValue('just a string');
        mockYamlLoad.mockReturnValue('just a string'); // Parsed to non-object

        const result = await loadConfig(specificPath);

        expect(result).toBeNull();
        expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Config file is empty or not a valid object'));
    });

    it('should return null and log error if config lacks profiles key', async () => {
        const specificPath = '/path/to/noprofiles.yaml';
        const configWithoutProfiles = { other: 'data' };
        mockFsAccess.mockResolvedValue(undefined);
        mockFsReadFile.mockResolvedValue('other: data');
        mockYamlLoad.mockReturnValue(configWithoutProfiles);

        const result = await loadConfig(specificPath);

        expect(result).toBeNull();
        expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Config file must contain a top-level "profiles" object'));
    });

    // --- Tests for Automatic Searching ---

    it('should load config from project .mcp-saferun.yaml if found', async () => {
        const projectPath = path.join(MOCK_CWD, '.mcp-saferun.yaml');
        // Mock project file found, others not
        mockFsAccess.mockImplementation(async (p) => {
            if (p === projectPath) return undefined;
            throw new Error('ENOENT');
        });
        mockFsReadFile.mockResolvedValue(VALID_CONFIG_YAML);
        mockYamlLoad.mockReturnValue(VALID_CONFIG);

        const result = await loadConfig(); // No specific path

        expect(result).toEqual({ config: VALID_CONFIG, filePath: projectPath });
        expect(mockFsAccess).toHaveBeenCalledWith(projectPath);
        expect(mockFsReadFile).toHaveBeenCalledWith(projectPath, 'utf8');
        expect(mockConsoleError).not.toHaveBeenCalled();
        expect(mockConsoleWarn).not.toHaveBeenCalled();
    });

    it('should load config from project .mcp-saferun.yml if found', async () => {
        const projectPathYaml = path.join(MOCK_CWD, '.mcp-saferun.yaml');
        const projectPathYml = path.join(MOCK_CWD, '.mcp-saferun.yml');
        mockFsAccess.mockImplementation(async (p) => {
            if (p === projectPathYaml) throw new Error('ENOENT'); // .yaml not found
            if (p === projectPathYml) return undefined; // .yml found
            throw new Error('ENOENT');
        });
        mockFsReadFile.mockResolvedValue(VALID_CONFIG_YAML);
        mockYamlLoad.mockReturnValue(VALID_CONFIG);

        const result = await loadConfig();

        expect(result).toEqual({ config: VALID_CONFIG, filePath: projectPathYml });
        expect(mockFsAccess).toHaveBeenCalledWith(projectPathYaml);
        expect(mockFsAccess).toHaveBeenCalledWith(projectPathYml);
        expect(mockFsReadFile).toHaveBeenCalledWith(projectPathYml, 'utf8');
    });

    it('should load config from user dir if project dir fails', async () => {
        const userPath = path.join(MOCK_USER_CONFIG_DIR, '.mcp-saferun.yaml');
        const projectPathYaml = path.join(MOCK_CWD, '.mcp-saferun.yaml');
        const projectPathYml = path.join(MOCK_CWD, '.mcp-saferun.yml');

        mockFsAccess.mockImplementation(async (p) => {
            if (p === projectPathYaml || p === projectPathYml) throw new Error('ENOENT'); // Project files not found
            if (p === userPath) return undefined; // User file found
            throw new Error('ENOENT');
        });
        mockFsReadFile.mockResolvedValue(VALID_CONFIG_YAML);
        mockYamlLoad.mockReturnValue(VALID_CONFIG);

        const result = await loadConfig();

        expect(result).toEqual({ config: VALID_CONFIG, filePath: userPath });
        expect(mockFsMkdir).toHaveBeenCalledWith(MOCK_USER_CONFIG_DIR, { recursive: true });
        expect(mockFsAccess).toHaveBeenCalledWith(projectPathYaml);
        expect(mockFsAccess).toHaveBeenCalledWith(projectPathYml);
        expect(mockFsAccess).toHaveBeenCalledWith(userPath);
        expect(mockFsReadFile).toHaveBeenCalledWith(userPath, 'utf8');
    });

     it('should load config from user dir .yml if .yaml fails', async () => {
        const userPathYaml = path.join(MOCK_USER_CONFIG_DIR, '.mcp-saferun.yaml');
        const userPathYml = path.join(MOCK_USER_CONFIG_DIR, '.mcp-saferun.yml');
        const projectPathYaml = path.join(MOCK_CWD, '.mcp-saferun.yaml');
        const projectPathYml = path.join(MOCK_CWD, '.mcp-saferun.yml');

        mockFsAccess.mockImplementation(async (p) => {
            if (p === projectPathYaml || p === projectPathYml) throw new Error('ENOENT');
            if (p === userPathYaml) throw new Error('ENOENT'); // User .yaml not found
            if (p === userPathYml) return undefined; // User .yml found
            throw new Error('ENOENT');
        });
        mockFsReadFile.mockResolvedValue(VALID_CONFIG_YAML);
        mockYamlLoad.mockReturnValue(VALID_CONFIG);

        const result = await loadConfig();

        expect(result).toEqual({ config: VALID_CONFIG, filePath: userPathYml });
        expect(mockFsMkdir).toHaveBeenCalledWith(MOCK_USER_CONFIG_DIR, { recursive: true });
        expect(mockFsAccess).toHaveBeenCalledWith(userPathYaml);
        expect(mockFsAccess).toHaveBeenCalledWith(userPathYml);
        expect(mockFsReadFile).toHaveBeenCalledWith(userPathYml, 'utf8');
    });

    it('should return null and warn if no config file is found anywhere', async () => {
        // Mock all access calls to fail
        mockFsAccess.mockRejectedValue(new Error('ENOENT'));

        const result = await loadConfig();

        expect(result).toBeNull();
        expect(mockFsAccess).toHaveBeenCalledTimes(4); // .yaml/.yml in project, .yaml/.yml in user
        expect(mockFsReadFile).not.toHaveBeenCalled();
        expect(mockConsoleWarn).toHaveBeenCalledWith(expect.stringContaining('No config file found'));
        expect(mockConsoleError).not.toHaveBeenCalled();
    });
}); 