import { jest, describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Import the functions normally now
import { resolvePlaceholders, resolveSinglePlaceholder, ResolutionError } from './placeholder-resolver.js';

// --- Remove All Previous Mocking Setup ---
// No more jest.unstable_mockModule or top-level await imports needed

// --- Test Setup ---

// Helper to get the directory name in ES module scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Setup temporary files for testing
const testDir = path.join(__dirname, 'test_files');
const testFilePath = path.join(testDir, 'test_secret.txt');
const testFileContent = 'secret_from_file';

beforeAll(async () => {
  // Just file system setup
  await fs.mkdir(testDir, { recursive: true });
  await fs.writeFile(testFilePath, testFileContent);
});

afterAll(async () => {
  await fs.rm(testDir, { recursive: true, force: true });
});

// --- Test Suites ---

describe('resolveSinglePlaceholder', () => {

  // Create a mock getter for keytar
  let mockKeytarGetter: jest.Mock;

  beforeEach(() => {
     // Reset the mock before each test
     mockKeytarGetter = jest.fn().mockResolvedValue('mock-keytar-secret');
  });

  // --- Environment Variable Tests ---
  it('should resolve environment variables correctly', async () => {
    process.env.TEST_VAR = 'test_value';
    // Pass undefined for keytarGetter as it's not needed for this test
    await expect(resolveSinglePlaceholder('env:TEST_VAR', undefined)).resolves.toBe('test_value');
    delete process.env.TEST_VAR;
  });

  it('should throw ResolutionError for unset environment variables', async () => {
    await expect(resolveSinglePlaceholder('env:UNSET_VAR', undefined))
      .rejects.toThrow(ResolutionError);
    await expect(resolveSinglePlaceholder('env:UNSET_VAR', undefined))
      .rejects.toThrow('environment variable "UNSET_VAR" is not set');
  });

  it('should throw ResolutionError for empty environment variable name', async () => {
    await expect(resolveSinglePlaceholder('env:', undefined))
      .rejects.toThrow(ResolutionError);
    await expect(resolveSinglePlaceholder('env:', undefined))
      .rejects.toThrow('environment variable name cannot be empty');
  });

  // --- File Tests ---
  it('should resolve file paths correctly', async () => {
    await expect(resolveSinglePlaceholder(`file:${testFilePath}`, undefined)).resolves.toBe(testFileContent);
  });

  it('should throw ResolutionError for non-existent files', async () => {
    const nonExistentPath = path.join(testDir, 'non_existent.txt');
    await expect(resolveSinglePlaceholder(`file:${nonExistentPath}`, undefined))
      .rejects.toThrow(ResolutionError);
     await expect(resolveSinglePlaceholder(`file:${nonExistentPath}`, undefined))
      .rejects.toThrow(/file not found at/);
  });

  it('should throw ResolutionError for empty file path', async () => {
    await expect(resolveSinglePlaceholder('file:', undefined))
      .rejects.toThrow(ResolutionError);
    await expect(resolveSinglePlaceholder('file:', undefined))
       .rejects.toThrow('file path cannot be empty');
  });

  // --- Keyring Tests (Using Dependency Injection) ---
  it('should resolve keyring placeholders correctly using injected getter', async () => {
    // Pass the mock getter
    await expect(resolveSinglePlaceholder('keyring:service:account', mockKeytarGetter)).resolves.toBe('mock-keytar-secret');
    // Check that the mock getter was called
    expect(mockKeytarGetter).toHaveBeenCalledWith('service', 'account');
  });

  it('should throw ResolutionError if injected getter returns null', async () => {
    mockKeytarGetter.mockResolvedValue(null);
    await expect(resolveSinglePlaceholder('keyring:service:account', mockKeytarGetter))
        .rejects.toThrow(ResolutionError);
    await expect(resolveSinglePlaceholder('keyring:service:account', mockKeytarGetter))
        .rejects.toThrow('secret not found in keychain');
  });

    it('should throw ResolutionError if injected getter throws', async () => {
      const getterError = new Error('Injected getter failed');
      mockKeytarGetter.mockRejectedValue(getterError);
      await expect(resolveSinglePlaceholder('keyring:service:account', mockKeytarGetter))
          .rejects.toThrow(ResolutionError);
      await expect(resolveSinglePlaceholder('keyring:service:account', mockKeytarGetter))
          .rejects.toThrow(/could not get secret.*Injected getter failed/);
    });

  it('should throw ResolutionError for invalid keyring format (even with getter)', async () => {
    await expect(resolveSinglePlaceholder('keyring:invalid', mockKeytarGetter))
      .rejects.toThrow(ResolutionError);
     await expect(resolveSinglePlaceholder('keyring:invalid', mockKeytarGetter))
      .rejects.toThrow('invalid format: expected "keyring:service:account"');
    // Getter should not have been called for invalid format
    expect(mockKeytarGetter).not.toHaveBeenCalled();
  });

  // --- Literal Tests ---
  it('should return the value literally if no prefix matches', async () => {
    await expect(resolveSinglePlaceholder('just_a_literal_string', undefined)).resolves.toBe('just_a_literal_string');
    await expect(resolveSinglePlaceholder('', undefined)).resolves.toBe(''); // Empty string
    await expect(resolveSinglePlaceholder('http://example.com', undefined)).resolves.toBe('http://example.com');
  });
});

describe('resolvePlaceholders', () => {

   // Create a mock getter for keytar
   let mockKeytarGetter: jest.Mock;

  beforeEach(() => {
    // Reset mock function call history
    mockKeytarGetter = jest.fn().mockResolvedValue('mock-keytar-secret');
    process.env.TEST_ENV_VAR1 = 'value1';
    process.env.TEST_ENV_VAR2 = 'value2';
  });

  afterEach(() => {
    delete process.env.TEST_ENV_VAR1;
    delete process.env.TEST_ENV_VAR2;
  });

  it('should resolve a mix of placeholder types using injected getter', async () => {
    const instructions = {
      VAR1: 'env:TEST_ENV_VAR1',
      VAR2: `file:${testFilePath}`,
      VAR3: 'literal_value',
      VAR4: 'keyring:mock_service:mock_account'
    };
    const expected = {
      VAR1: 'value1',
      VAR2: testFileContent,
      VAR3: 'literal_value',
      VAR4: 'mock-keytar-secret' // From injected mock keytar
    };
    // Pass the mock getter to resolvePlaceholders
    await expect(resolvePlaceholders(instructions, mockKeytarGetter)).resolves.toEqual(expected);
    expect(mockKeytarGetter).toHaveBeenCalledTimes(1);
    expect(mockKeytarGetter).toHaveBeenCalledWith('mock_service', 'mock_account');
  });

  it('should pass through non-placeholder values', async () => {
    const instructions = {
      KEY1: 'plain_string',
      KEY2: 'another_string'
    };
    await expect(resolvePlaceholders(instructions, mockKeytarGetter)).resolves.toEqual(instructions);
    // Getter should not be called if no keyring: prefixes
    expect(mockKeytarGetter).not.toHaveBeenCalled();
  });

  it('should throw ResolutionError if any single placeholder fails (with injected getter)', async () => {
    const instructions = {
      GOOD_VAR: 'env:TEST_ENV_VAR1',
      BAD_VAR: 'env:NON_EXISTENT_VAR' // This one will fail
    };
    await expect(resolvePlaceholders(instructions, mockKeytarGetter))
      .rejects.toThrow(ResolutionError);
    await expect(resolvePlaceholders(instructions, mockKeytarGetter))
      .rejects.toThrow(/Placeholder "env:NON_EXISTENT_VAR" for env var "BAD_VAR" resolution failed/);
     // Getter should not have been called
     expect(mockKeytarGetter).not.toHaveBeenCalled();
  });

   it('should throw ResolutionError if injected getter fails during resolvePlaceholders', async () => {
     mockKeytarGetter.mockRejectedValue(new Error('Getter failed'));
     const instructions = {
       KEYRING_VAR: 'keyring:service:account'
     };
     await expect(resolvePlaceholders(instructions, mockKeytarGetter))
       .rejects.toThrow(ResolutionError);
     await expect(resolvePlaceholders(instructions, mockKeytarGetter))
       .rejects.toThrow(/Placeholder "keyring:service:account" for env var "KEYRING_VAR" resolution failed:.*Getter failed/);
     expect(mockKeytarGetter).toHaveBeenCalledWith('service', 'account');
   });

  it('should handle an empty instructions object', async () => {
    const instructions = {};
    await expect(resolvePlaceholders(instructions, mockKeytarGetter)).resolves.toEqual({});
    expect(mockKeytarGetter).not.toHaveBeenCalled();
  });
}); 