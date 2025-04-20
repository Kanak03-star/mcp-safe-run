# mcp-safe-run

**Securely launch MCP servers by resolving credentials from external sources.**

This tool acts as a wrapper, allowing you to define environment variables for a target command using placeholders that resolve secrets from environment variables, files, or the OS keychain, without exposing secrets directly in your shell history or process list.

## Installation

```sh
npm install -g mcp-secure-launcher
```

> **Note:** This CLI uses [keytar](https://github.com/atom/node-keytar) for OS keychain support. On macOS, install Xcode Command Line Tools. On Linux, install `libsecret-1-dev` and `build-essential` (or equivalent build tools). On Windows, install Visual Studio Build Tools (`npm install --global --production windows-build-tools`).

## Usage

```sh
mcp-safe-run [options] <targetCommand> [targetArgs...]
```

### Options

- `-V, --version`                 Output the current version.
- `-c, --config <path>`           Path to a custom configuration file (.yaml or .yml).
- `-p, --profile <name>`          Name of the profile to use from the configuration file.
- `--target-env <jsonString>`     JSON mapping of target environment variables. **Overrides config file profile settings.**
- `-v, --verbose`                 Enable verbose logging (outputs diagnostic details).
- `-h, --help`                    Display help information.

### Placeholder Syntax

Placeholders can be used within the `--target-env` JSON string or in the `target-env` section of a configuration file profile.

- `env:VAR_NAME`          Use the value of environment variable `VAR_NAME`.
- `file:/path/to/file`    Read and trim the contents of the specified file (supports `~` for home directory).
- `keyring:service:account` Retrieve a secret from the OS keychain using the specified `service` and `account`.
- *Literal values*        Any other string is passed through unchanged.

## Configuration File

For managing multiple configurations, you can use a YAML configuration file (e.g., `.mcp-saferun.yaml` or `.mcp-saferun.yml`).

**Search Order:**
1. Path specified by `-c, --config <path>`.
2. `.mcp-saferun.yaml` or `.mcp-saferun.yml` in the current working directory.
3. `config.yaml` or `config.yml` inside `~/.config/mcp-safe-run/` (the directory is created if it doesn't exist).

**Format:**

```yaml
# Example .mcp-saferun.yaml
profiles:
  # Profile name (used with -p dev)
  dev:
    target-env:
      API_KEY: "env:DEV_API_KEY"
      SECRET: "keyring:my-service:dev-user"
      DB_URL: "postgresql://localhost/dev_db"

  staging:
    target-env:
      API_KEY: "file:./staging-key.txt"
      SECRET: "keyring:my-service:staging-user"
      DB_URL: "env:STAGING_DB_URL"

# Global settings can be added here if needed in the future
# global:
#   setting: value
```

**Precedence:**
1. Environment variables provided via `--target-env` (highest precedence).
2. Environment variables defined in the selected profile (`-p <name>`) from the configuration file.
3. Environment variables inherited from the shell where `mcp-safe-run` is executed (lowest precedence).

## Examples

1.  **Using `--target-env` (CLI only):**

    ```sh
    export GH_TOKEN_FOR_MCP=ghp_...TOKEN...
    mcp-safe-run --target-env '{"GITHUB_TOKEN":"env:GH_TOKEN_FOR_MCP", "OTHER_VAR":"literal_value"}' \
      npx -y @modelcontextprotocol/server-github --port 8080
    ```

2.  **Using a Config File Profile:**

    *Create `.mcp-saferun.yaml` in your project:* 
    ```yaml
    profiles:
      github_server:
        target-env:
          GITHUB_TOKEN: "keyring:mcp:github"
          PORT: "8080"
    ```

    *Run using the profile:* 
    ```sh
    # Make sure the keychain entry exists:
    # keytar set mcp github ghp_...TOKEN...

    mcp-safe-run -p github_server npx -y @modelcontextprotocol/server-github
    # The target command will receive GITHUB_TOKEN and PORT in its environment
    ```

3.  **Using a Specific Config File:**

    ```sh
    mcp-safe-run -c ~/configs/mcp-servers.yaml -p prod_server node my_server.js
    ```

4.  **Overriding a Config Profile with `--target-env`:**

    *Assume `.mcp-saferun.yaml` exists with the `github_server` profile from example 2.* 
    ```sh
    # Temporarily override the PORT defined in the profile
    mcp-safe-run -p github_server --target-env '{"PORT":"9000"}' \
      npx -y @modelcontextprotocol/server-github
    # GITHUB_TOKEN comes from the profile (keyring), but PORT is set to 9000 by the CLI flag.
    ```

5.  **Verbose Mode:**

    ```sh
    mcp-safe-run -v -p github_server npx -y @modelcontextprotocol/server-github
    # Shows config loading, resolved values (if verbose), final environment, etc.
    ```

## Troubleshooting

- **Config File Not Found:** Check search paths and file names (`.mcp-saferun.yaml`/`.yml`). Ensure correct path with `-c`. Check permissions.
- **Profile Not Found:** Verify the profile name used with `-p` exists in the loaded config file.
- **YAML Errors:** Ensure the config file is valid YAML. Use an online validator if unsure.
- **Placeholder Errors:** (`env:`, `file:`, `keyring:`)
    - **`env:`**: Check if the environment variable is actually set (`echo $VAR_NAME`).
    - **`file:`**: Check file path (including `~` expansion), permissions (`ls -l`), and content (`cat`).
    - **`keyring:`**: Verify the secret exists in the OS keychain (use OS tools or `keytar` CLI if installed). Ensure `keytar` prerequisites are met.
- **`keytar` Build/Runtime Issues:** Check platform notes below and ensure necessary build tools/libraries are installed.
- **Invalid JSON (`--target-env`):** Ensure proper quoting, especially when used in a shell.
- **Unsupported Placeholder (`env:`) in Some Clients (Cursor, Windsurf, Claude Desktop):** These environments don’t pass shell environment variables to `mcp-safe-run`, so `env:` placeholders won’t resolve. `file:` and `keyring:` placeholders still work. For example:

    ```sh
    mcp-safe-run --target-env '{"API_KEY":"file:./api_key.txt","SECRET":"keyring:my-service:account","DB_URL":"file:./db_url.txt"}' <targetCommand> [args...]
    ```

## Platform Notes

- **macOS:** Requires Xcode Command Line Tools.
- **Linux:** Requires `libsecret-1-dev` and build tools like `build-essential`.
- **Windows:** Requires Visual Studio Build Tools (can be installed via `npm install --global --production windows-build-tools`).

## License

MIT
