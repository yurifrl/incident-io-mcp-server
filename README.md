# Incident.io MCP Server

A Model Context Protocol server for Incident.io integration.

## Usage

You can run the server directly from GitHub using `npx`.

```bash
# With npx
npx github:yurifrl/incident-io-mcp-server
```

### Local Development

```bash
# Clone the repository
git clone https://github.com/yurifrl/incident-io-mcp-server.git
cd incident-io-mcp-server

# Install dependencies
npm install

# Run the server
npm run dev
```

Required environment variables:
- `API_KEY`: Your Incident.io API key

## Configuration

When using with a MCP client, you can configure it like this.
This example assumes you are running it directly from GitHub.

```json
{
  "mcpServers": {
    "incident-io": {
      "command": "npx",
      "args": ["github:yurifrl/incident-io-mcp-server"],
      "env": {
        "API_KEY": "your-api-key-here"
      }
    }
  }
}
```

## Available Tools

This server provides the following tools to interact with the Incident.io API.

### Incidents

*   **`list_incidents`**: Returns a paginated list of incidents.
*   **`get_incident`**: Fetches a single incident by its reference (e.g., `INC-123`).
*   **`create_incident`**: Creates a new incident. Requires fields like `name` and `summary`, and can optionally take `severity`, `status`, and more.
*   **`edit_incident`**: Edits an existing incident's properties, such as its `name` or `summary`.
*   **`update_incident_status`**: Updates the status of a specific incident.

### Incident Details

*   **`list_incident_updates`**: Gets the timeline of updates for a specific incident.
*   **`list_incident_timestamps`**: Lists all timestamps (e.g., `detected`, `resolved`) for an incident.
*   **`add_incident_timestamp`**: Adds a new timestamp to an incident.

### Users & Roles

*   **`list_users`**: Lists all users in the organization.
*   **`get_user`**: Gets details for a specific user by their ID.
*   **`list_incident_roles`**: Returns all available incident roles.
*   **`assign_role_to_incident`**: Assigns a user to a role for a specific incident.
*   **`revoke_role_from_incident`**: Revokes a user's role from an incident.

### Metadata

*   **`list_severities`**: Returns a list of all possible incident severities.
*   **`list_incident_types`**: Returns a list of all incident types.
*   **`get_incident_type`**: Gets details for a specific incident type.
*   **`list_incident_statuses`**: Returns a list of all possible incident statuses.
