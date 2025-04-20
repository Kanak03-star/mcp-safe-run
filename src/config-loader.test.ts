import { jest, describe, it, expect, afterEach, beforeEach } from '@jest/globals';
import path from 'path';
import { PathLike } from 'fs';

// --- Type Imports ---
// Import types for functions we will mock
import type * as fsPromises from 'fs/promises';
import type * as os from 'os';
import type * as yaml from 'js-yaml';
import type untildify from 'untildify';
import type { ConfigFile } from './config-loader.js';

// Import the function under test
import { loadConfig } from './config-loader.js';

// --- Test Suite ---
describe('loadConfig', () => {
    // --- Mock Variables Declaration ---
    let mockFsAccess: jest.Mock<typeof fsPromises.access>;
    let mockFsReadFile: jest.Mock<typeof fsPromises.readFile>;
    let mockFsMkdir: jest.Mock<typeof fsPromises.mkdir>;
    let mockYamlLoad: jest.Mock<typeof yaml.load>;
    let mockOsHomedir: jest.Mock<typeof os.homedir>;
    let mockUntildify: jest.Mock<typeof untildify>;
    let mockProcessCwd: any;
    let mockConsoleError: any;
    let mockConsoleWarn: any;

    // --- Test Constants ---
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

    // --- Helper for Dependencies ---
    // Bundle mocks into the dependency object expected by loadConfig
    const getMockDeps = () => ({
        fsAccess: mockFsAccess,
        fsReadFile: mockFsReadFile as any, // Cast readFile mock due to complex overload types
        fsMkdir: mockFsMkdir,
        osHomedir: mockOsHomedir,
        yamlLoad: mockYamlLoad,
        untildify: mockUntildify,
        cwd: mockProcessCwd,
    });

    beforeEach(() => {
        // Create fresh mocks for each test
        mockFsAccess = jest.fn<typeof fsPromises.access>().mockResolvedValue(undefined);
        mockFsReadFile = jest.fn<typeof fsPromises.readFile>();
        mockFsMkdir = jest.fn<typeof fsPromises.mkdir>().mockResolvedValue(undefined);
        mockYamlLoad = jest.fn<typeof yaml.load>();
        mockOsHomedir = jest.fn<typeof os.homedir>().mockReturnValue(MOCK_HOME);
        mockUntildify = jest.fn<typeof untildify>().mockImplementation((p: string) => p.startsWith('~') ? path.join(MOCK_HOME, p.substring(1)) : p);

        // Reset spies
        mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
        mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        mockProcessCwd = jest.spyOn(process, 'cwd').mockReturnValue(MOCK_CWD);
    });

    afterEach(() => {
        mockConsoleError.mockRestore();
        mockConsoleWarn.mockRestore();
        mockProcessCwd.mockRestore();
        jest.clearAllMocks(); // Clear all mocks, including the jest.fn() ones
    });

    // --- Tests for Specific Path ---
    it('should load config from a specific valid path', async () => {
        const specificPath = '/path/to/my.yaml';
        mockFsReadFile.mockResolvedValue(VALID_CONFIG_YAML); // Provide mock return value
        mockYamlLoad.mockReturnValue(VALID_CONFIG);

        // Pass the mock dependencies object
        const result = await loadConfig(specificPath, getMockDeps());

        expect(result).toEqual({ config: VALID_CONFIG, filePath: specificPath });
        expect(mockFsAccess).toHaveBeenCalledWith(specificPath);
        expect(mockFsReadFile).toHaveBeenCalledWith(specificPath, 'utf8');
        expect(mockYamlLoad).toHaveBeenCalledWith(VALID_CONFIG_YAML);
        expect(mockUntildify).toHaveBeenCalledWith(specificPath);
        expect(mockConsoleError).not.toHaveBeenCalled();
    });

    it('should handle tilde expansion for specific path', async () => {
        const tildePath = '~/myconfig.yaml';
        const expectedExpandedPath = path.join(MOCK_HOME, 'myconfig.yaml');
        mockFsReadFile.mockResolvedValue(VALID_CONFIG_YAML);
        mockYamlLoad.mockReturnValue(VALID_CONFIG);

        const result = await loadConfig(tildePath, getMockDeps());

        expect(mockUntildify).toHaveBeenCalledWith(tildePath);
        expect(mockFsAccess).toHaveBeenCalledWith(expectedExpandedPath);
        expect(result).toEqual({ config: VALID_CONFIG, filePath: expectedExpandedPath });
        expect(mockFsReadFile).toHaveBeenCalledWith(expectedExpandedPath, 'utf8');
        expect(mockConsoleError).not.toHaveBeenCalled();
    });

    it('should return null and log error if specific path does not exist', async () => {
        const specificPath = '/path/to/nonexistent.yaml';
        const accessError = new Error('ENOENT');
        mockFsAccess.mockRejectedValue(accessError);

        const result = await loadConfig(specificPath, getMockDeps());

        expect(result).toBeNull();
        expect(mockFsAccess).toHaveBeenCalledWith(specificPath);
        expect(mockFsReadFile).not.toHaveBeenCalled();
        expect(mockYamlLoad).not.toHaveBeenCalled();
        expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Specified config file not found'));
    });

    it('should return null and log error on file read error', async () => {
        const specificPath = '/path/to/readerror.yaml';
        const readError = new Error('Read permission denied');
        mockFsReadFile.mockRejectedValue(readError);

        const result = await loadConfig(specificPath, getMockDeps());

        expect(result).toBeNull();
        expect(mockFsReadFile).toHaveBeenCalledWith(specificPath, 'utf8');
        expect(mockYamlLoad).not.toHaveBeenCalled();
        expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Error loading or parsing config file'));
        expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Read permission denied'));
    });

    it('should return null and log error on YAML parse error', async () => {
        const specificPath = '/path/to/bad.yaml';
        const invalidYaml = 'profiles: \n test: [';
        mockFsReadFile.mockResolvedValue(invalidYaml);
        const parseError = new Error('YAML parsing failed');
        mockYamlLoad.mockImplementation(() => { throw parseError; });

        const result = await loadConfig(specificPath, getMockDeps());

        expect(result).toBeNull();
        expect(mockYamlLoad).toHaveBeenCalledWith(invalidYaml);
        expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Error loading or parsing config file'));
        expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('YAML parsing failed'));
    });

    it('should return null and log error if config is not an object', async () => {
        const specificPath = '/path/to/scalar.yaml';
        mockFsReadFile.mockResolvedValue('just a string');
        mockYamlLoad.mockReturnValue('just a string');

        const result = await loadConfig(specificPath, getMockDeps());

        expect(result).toBeNull();
        expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Config file is empty or not a valid object'));
    });

    it('should return null and log error if config lacks profiles key', async () => {
        const specificPath = '/path/to/noprofiles.yaml';
        const configWithoutProfiles = { other: 'data' };
        mockFsReadFile.mockResolvedValue('other: data');
        mockYamlLoad.mockReturnValue(configWithoutProfiles);

        const result = await loadConfig(specificPath, getMockDeps());

        expect(result).toBeNull();
        expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Config file must contain a top-level "profiles" object'));
    });

    // --- Tests for Automatic Searching ---

    it('should load config from project .mcp-saferun.yaml if found', async () => {
        const projectPath = path.join(MOCK_CWD, '.mcp-saferun.yaml');
        mockFsAccess.mockImplementation(async (p: PathLike): Promise<void> => {
            if (p === projectPath) return undefined;
            throw new Error('ENOENT');
        });
        mockFsReadFile.mockResolvedValue(VALID_CONFIG_YAML);
        mockYamlLoad.mockReturnValue(VALID_CONFIG);

        // Pass mock deps for automatic search
        const result = await loadConfig(undefined, getMockDeps());

        expect(result).toEqual({ config: VALID_CONFIG, filePath: projectPath });
        expect(mockFsAccess).toHaveBeenCalledWith(projectPath);
        expect(mockFsReadFile).toHaveBeenCalledWith(projectPath, 'utf8');
        expect(mockConsoleError).not.toHaveBeenCalled();
        expect(mockConsoleWarn).not.toHaveBeenCalled();
    });

    it('should load config from project .mcp-saferun.yml if found', async () => {
        const projectPathYaml = path.join(MOCK_CWD, '.mcp-saferun.yaml');
        const projectPathYml = path.join(MOCK_CWD, '.mcp-saferun.yml');
        mockFsAccess.mockImplementation(async (p: PathLike): Promise<void> => {
            if (p === projectPathYaml) throw new Error('ENOENT');
            if (p === projectPathYml) return undefined;
            throw new Error('ENOENT');
        });
        mockFsReadFile.mockResolvedValue(VALID_CONFIG_YAML);
        mockYamlLoad.mockReturnValue(VALID_CONFIG);

        const result = await loadConfig(undefined, getMockDeps());

        expect(result).toEqual({ config: VALID_CONFIG, filePath: projectPathYml });
        expect(mockFsAccess).toHaveBeenCalledWith(projectPathYaml);
        expect(mockFsAccess).toHaveBeenCalledWith(projectPathYml);
        expect(mockFsReadFile).toHaveBeenCalledWith(projectPathYml, 'utf8');
    });

    it('should load config from user dir if project dir fails', async () => {
        const userPath = path.join(MOCK_USER_CONFIG_DIR, '.mcp-saferun.yaml');
        const projectPathYaml = path.join(MOCK_CWD, '.mcp-saferun.yaml');
        const projectPathYml = path.join(MOCK_CWD, '.mcp-saferun.yml');

        mockFsAccess.mockImplementation(async (p: PathLike): Promise<void> => {
            if (p === projectPathYaml || p === projectPathYml) throw new Error('ENOENT');
            if (p === userPath) return undefined;
            throw new Error('ENOENT');
        });
        mockFsReadFile.mockResolvedValue(VALID_CONFIG_YAML);
        mockYamlLoad.mockReturnValue(VALID_CONFIG);

        const result = await loadConfig(undefined, getMockDeps());

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

        mockFsAccess.mockImplementation(async (p: PathLike): Promise<void> => {
            if (p === projectPathYaml || p === projectPathYml) throw new Error('ENOENT');
            if (p === userPathYaml) throw new Error('ENOENT');
            if (p === userPathYml) return undefined;
            throw new Error('ENOENT');
        });
        mockFsReadFile.mockResolvedValue(VALID_CONFIG_YAML);
        mockYamlLoad.mockReturnValue(VALID_CONFIG);

        const result = await loadConfig(undefined, getMockDeps());

        expect(result).toEqual({ config: VALID_CONFIG, filePath: userPathYml });
        expect(mockFsMkdir).toHaveBeenCalledWith(MOCK_USER_CONFIG_DIR, { recursive: true });
        expect(mockFsAccess).toHaveBeenCalledWith(userPathYaml);
        expect(mockFsAccess).toHaveBeenCalledWith(userPathYml);
        expect(mockFsReadFile).toHaveBeenCalledWith(userPathYml, 'utf8');
    });

    it('should return null and warn if no config file is found anywhere', async () => {
        const noEntError = new Error('ENOENT');
        mockFsAccess.mockRejectedValue(noEntError);

        const result = await loadConfig(undefined, getMockDeps());

        expect(result).toBeNull();
        expect(mockFsAccess).toHaveBeenCalledTimes(4);
        expect(mockFsReadFile).not.toHaveBeenCalled();
        expect(mockConsoleWarn).toHaveBeenCalledWith(expect.stringContaining('No config file found'));
        expect(mockConsoleError).not.toHaveBeenCalled();
    });
}); 