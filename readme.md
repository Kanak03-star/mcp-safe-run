# mcp-safe-run

**Securely launch MCP servers by resolving credentials from external sources.**

## Installation

```sh
npm install -g mcp-secure-launcher
```

> **Note:** This CLI uses [keytar] for OS keychain support. On macOS install Xcode Command Line Tools; on Linux install `libsecret-1-dev`; on Windows install `windows-build-tools`.

## Usage

```sh
mcp-safe-run [options] <targetCommand> [targetArgs...]
```

### Options

- `-V, --version`  Output the current version.
- `--target-env <jsonString>`  JSON mapping of target environment variables to placeholders or literals.
- `-v, --verbose`  Enable verbose logging (outputs diagnostic details).

### Placeholder Syntax

- `env:VAR_NAME`  Use the value of environment variable `VAR_NAME`.
- `file:/path/to/file`  Read and trim the contents of the specified file.
- `keyring:service:account`  Retrieve a secret from the OS keychain (`service`, `account`).
- *Literal values*  Any other string is passed through unchanged.

## Examples

1. **GitHub token via env:**

   ```sh
   export GH_TOKEN_FOR_MCP=ghp_...TOKEN...
   mcp-safe-run --target-env '{"GITHUB_TOKEN":"env:GH_TOKEN_FOR_MCP"}' \
     npx -y @modelcontextprotocol/server-github
   ```

2. **Token from file:**

   ```sh
   echo "secretval" > ~/.github_token
   mcp-safe-run --target-env '{"GITHUB_TOKEN":"file:~/.github_token"}' server...
   ```

3. **Keychain secret:**

   ```sh
   keytar set mcp github ghp_...TOKEN...
   mcp-safe-run --target-env '{"GITHUB_TOKEN":"keyring:mcp:github"}' server...
   ```

4. **Config JSON before/after:**

   ```json
   {
     "GITHUB_TOKEN": "env:GH_TOKEN_FOR_MCP"
   }
   ```

5. **Verbose mode logging:**

   ```sh
   export GH_TOKEN_FOR_MCP=ghp_...TOKEN...
   mcp-safe-run -v --target-env '{"GITHUB_TOKEN":"env:GH_TOKEN_FOR_MCP"}' \
     npx -y @modelcontextprotocol/server-github
   ```

## Troubleshooting

- **Env var not set:**  `echo $VAR_NAME`
- **File errors:**  `ls -l /path/to/file` and `cat /path/to/file`.
- **Keychain issues:**  Verify entries via OS keychain app or CLI.
- **Invalid JSON:**  Ensure proper quoting; use single quotes in shell.
- **Keytar build failures:**  Confirm required build dependencies are installed.

## Platform Notes

- **macOS:** Xcode Command Line Tools required.
- **Linux:** Install `libsecret-1-dev`.
- **Windows:** Requires Visual Studio Build Tools (`windows-build-tools`).

## License

MIT
