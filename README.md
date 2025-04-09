# Incident.io MCP Server

A Model Context Protocol server for Incident.io integration.

## Installation from GitHub

```bash
# Install directly from GitHub
npm install -g github:clio/incident-io-mcp-server

# Or clone and install locally
git clone https://github.com/clio/incident-io-mcp-server.git
cd incident-io-mcp-server
npm install
npm run build
```

## Usage

Run the server:

```bash
# If installed globally
incident-io-mcp-server

# Or if installed locally
node ./dist/index.js
```

Required environment variables:
- `API_KEY`: Your Incident.io API key

Optional environment variables:
- `PORT`: Server port (default: 3000)

## Configuration

Example MCP configuration:

```json
{
  "mcpServers": {
    "incident-io": {
      "command": "node",
      "args": ["./node_modules/incident-io-mcp-server/dist/index.js"],
      "env": {
        "API_KEY": "your-api-key-here",
        "PORT": "3000"
      }
    }
  }
}
```

## Endpoints

- `GET /health`: Health check endpoint
- `GET /mcp/incidents`: Get latest incidents
- `GET /mcp/severities`: Get available severities
- `POST /mcp/incidents`: Create a new incident 