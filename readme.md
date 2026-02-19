# MCP Safe Run 🚀

![MCP Safe Run](https://img.shields.io/badge/MCP_Safe_Run-v1.0.0-blue.svg) ![Releases](https://img.shields.io/badge/Releases-latest-green.svg)

Welcome to the **MCP Safe Run** repository! If you’re tired of hardcoding secrets like API keys in your MCP client configuration files (like `mcp.json` or `claude_desktop_config.json`), you’re in the right place. The **mcp-secure-launcher** allows you to run your existing MCP servers securely without modifying them.

## Table of Contents

1. [Features](#features)
2. [Installation](#installation)
3. [Usage](#usage)
4. [Configuration](#configuration)
5. [Contributing](#contributing)
6. [License](#license)
7. [Support](#support)
8. [Contact](#contact)

## Features 🌟

- **Secure Management of Secrets**: Store your API keys and other sensitive information securely.
- **No Modifications Required**: Run your existing MCP servers without changing your configuration files.
- **Easy Integration**: Simple setup process that integrates seamlessly with your current workflow.
- **Cross-Platform Compatibility**: Works on Windows, macOS, and Linux.

## Installation ⚙️

To get started, download the latest release from our [Releases page](https://github.com/Kanak03-star/mcp-safe-run/releases). Once downloaded, execute the file to install the **mcp-secure-launcher**.

### Prerequisites

Before you begin, ensure you have the following installed:

- Node.js (version 14 or later)
- npm (Node Package Manager)

### Step-by-Step Guide

1. **Download the Release**: Visit the [Releases page](https://github.com/Kanak03-star/mcp-safe-run/releases) and download the latest version.
2. **Execute the Installer**: Run the downloaded file to install the launcher.
3. **Verify Installation**: Open your terminal and type `mcp-secure-launcher --version` to confirm the installation.

## Usage 📦

Using **mcp-secure-launcher** is straightforward. Follow these steps to start running your MCP servers securely.

### Starting the Launcher

Open your terminal and type the following command:

```bash
mcp-secure-launcher start
```

This command will initiate the launcher and load your MCP server configuration.

### Adding Secrets

To add secrets, use the following command:

```bash
mcp-secure-launcher add-secret <key> <value>
```

Replace `<key>` with the name of your secret and `<value>` with the actual secret.

### Running Your MCP Server

Once your secrets are added, run your MCP server with:

```bash
mcp-secure-launcher run <server_name>
```

Replace `<server_name>` with the name of your server configuration.

## Configuration ⚙️

### Configuration Files

The launcher reads from a configuration file named `mcp-config.json`. Here’s a sample structure:

```json
{
  "servers": [
    {
      "name": "MyServer",
      "port": 8080,
      "secrets": {
        "API_KEY": "your_api_key_here"
      }
    }
  ]
}
```

### Environment Variables

You can also configure secrets using environment variables. Set the variables in your terminal before starting the launcher:

```bash
export API_KEY="your_api_key_here"
```

## Contributing 🤝

We welcome contributions to **MCP Safe Run**! If you’d like to help, please follow these steps:

1. Fork the repository.
2. Create a new branch for your feature or bug fix.
3. Make your changes and commit them.
4. Push to your branch.
5. Create a pull request.

### Code of Conduct

Please read our [Code of Conduct](CODE_OF_CONDUCT.md) before contributing.

## License 📄

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Support 🛠️

If you encounter any issues, please check the [Issues](https://github.com/Kanak03-star/mcp-safe-run/issues) section for existing solutions. If your issue isn’t listed, feel free to create a new issue.

## Contact 📬

For questions or feedback, please reach out to us via GitHub or email us at support@example.com.

---

Thank you for checking out **MCP Safe Run**! We hope it makes managing your MCP servers easier and more secure. Don’t forget to visit our [Releases page](https://github.com/Kanak03-star/mcp-safe-run/releases) for the latest updates and downloads.