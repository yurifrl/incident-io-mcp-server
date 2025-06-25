#!/usr/bin/env node

import axios from "axios";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// -------------------------
// Configuration
// -------------------------
const apiKey = process.env.API_KEY;
if (!apiKey) {
  console.error("API_KEY env var required");
  process.exit(1);
}

// -------------------------
// Axios clients
// -------------------------
const incidentV2 = axios.create({
  baseURL: "https://api.incident.io/v2",
  headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
});

const incidentV1 = axios.create({
  baseURL: "https://api.incident.io/v1",
  headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
});

// -------------------------
// Simple in-memory caches
// -------------------------
let severities: any[] = [];
let incidentTypes: any[] = [];
let incidentStatuses: any[] = [];

async function refreshCache() {
  try {
    const [sevRes, typeRes, statusRes] = await Promise.all([
      incidentV1.get("/severities"),
      incidentV1.get("/incident_types"),
      incidentV1.get("/incident_statuses"),
    ]);
    severities = sevRes.data.severities;
    incidentTypes = typeRes.data.incident_types;
    incidentStatuses = statusRes.data.incident_statuses;
  } catch (err) {
    console.error("Failed refreshing cache", err);
  }
}

await refreshCache();
setInterval(refreshCache, 60 * 60 * 1000);

// -------------------------
// MCP server setup
// -------------------------
const server = new McpServer({ name: "incident-io", version: "1.0.0" });

// Utility helpers -----------------------------------------------------------
const toText = (obj: unknown) => JSON.stringify(obj, null, 2);

function findSeverityId(nameOrId: string): string | undefined {
  const byId = severities.find((s) => s.id === nameOrId);
  if (byId) return byId.id;
  const byName = severities.find((s) => s.name.toLowerCase() === nameOrId.toLowerCase());
  return byName?.id;
}

function findIncidentTypeId(nameOrId?: string): string | undefined {
  if (!nameOrId) return undefined;
  const byId = incidentTypes.find((t) => t.id === nameOrId);
  if (byId) return byId.id;
  const byName = incidentTypes.find((t) => t.name.toLowerCase() === nameOrId.toLowerCase());
  return byName?.id;
}

function findStatusId(name?: string): string | undefined {
  if (!name) return undefined;
  const match = incidentStatuses.find((s) => s.name.toLowerCase() === name.toLowerCase());
  return match?.id;
}

// Tools --------------------------------------------------------------------

// list_incidents ------------------------------------------------------------
server.registerTool(
  "list_incidents",
  {
    title: "List Incidents",
    description: "Return a page of incidents from incident.io",
    inputSchema: {
      page_size: z.number().int().min(1).max(100).optional(),
      after: z.string().optional(),
    },
  },
  async ({ page_size = 25, after }: { page_size?: number; after?: string }) => {
    const qs = new URLSearchParams();
    qs.append("page_size", String(page_size));
    if (after) qs.append("after", after);
    const { data } = await incidentV2.get(`/incidents?${qs.toString()}`);
    return { content: [{ type: "text", text: toText({ incidents: data.incidents, pagination: data.pagination_meta }) }] };
  }
);

// get_incident --------------------------------------------------------------
server.registerTool(
  "get_incident",
  {
    title: "Get Incident",
    description: "Fetch a single incident by reference (e.g. INC-42)",
    inputSchema: { reference: z.string() },
  },
  async ({ reference }: { reference: string }) => {
    try {
      const { data } = await incidentV2.get(`/incidents/${reference}`);
      return { content: [{ type: "text", text: toText(data.incident) }] };
    } catch (err: any) {
      if (err.response?.status === 404) {
        return { isError: true, content: [{ type: "text", text: `Incident ${reference} not found` }] };
      }
      return { isError: true, content: [{ type: "text", text: toText(err.response?.data ?? err.message) }] };
    }
  }
);

// edit_incident -------------------------------------------------------------
server.registerTool(
  "edit_incident",
  {
    title: "Edit Incident",
    description: "Edit an incident's properties, such as its name or summary.",
    inputSchema: {
      reference: z.string(),
      name: z.string().optional(),
      summary: z.string().optional(),
    },
  },
  async ({ reference, name, summary }: { reference: string; name?: string; summary?: string }) => {
    try {
      const { data: incidentData } = await incidentV2.get(`/incidents/${reference}`);
      const incidentId = incidentData.incident.id;

      const payload: Record<string, unknown> = {};
      if (name) payload.name = name;
      if (summary) payload.summary = summary;

      if (Object.keys(payload).length === 0) {
        return { isError: true, content: [{ type: "text", text: "Nothing to update" }] };
      }

      const { data } = await incidentV2.post(`/incidents/${incidentId}`, payload);
      return { content: [{ type: "text", text: toText(data.incident) }] };
    } catch (err: any) {
      if (err.response?.status === 404) {
        return { isError: true, content: [{ type: "text", text: `Incident ${reference} not found` }] };
      }
      return { isError: true, content: [{ type: "text", text: toText(err.response?.data ?? err.message) }] };
    }
  }
);

// list_incident_updates ----------------------------------------------------
server.registerTool(
  "list_incident_updates",
  {
    title: "List Incident Updates",
    description: "Get the timeline of updates for a specific incident.",
    inputSchema: {
      reference: z.string(),
    },
  },
  async ({ reference }: { reference: string }) => {
    try {
      const { data: incidentData } = await incidentV2.get(`/incidents/${reference}`);
      const incidentId = incidentData.incident.id;

      const { data } = await incidentV2.get(`/incidents/${incidentId}/updates`);
      return { content: [{ type: "text", text: toText(data.incident_updates) }] };
    } catch (err: any) {
      if (err.response?.status === 404) {
        return { isError: true, content: [{ type: "text", text: `Incident ${reference} not found` }] };
      }
      return { isError: true, content: [{ type: "text", text: toText(err.response?.data ?? err.message) }] };
    }
  }
);

// list_incident_timestamps ------------------------------------------------
server.registerTool(
  "list_incident_timestamps",
  {
    title: "List Incident Timestamps",
    description: "List all timestamps for an incident.",
    inputSchema: {
      reference: z.string(),
    },
  },
  async ({ reference }: { reference: string }) => {
    try {
      const { data: incidentData } = await incidentV2.get(`/incidents/${reference}`);
      const incidentId = incidentData.incident.id;

      const { data } = await incidentV2.get(`/incidents/${incidentId}/timestamps`);
      return { content: [{ type: "text", text: toText(data.incident_timestamps) }] };
    } catch (err: any) {
      if (err.response?.status === 404) {
        return { isError: true, content: [{ type: "text", text: `Incident ${reference} not found` }] };
      }
      return { isError: true, content: [{ type: "text", text: toText(err.response?.data ?? err.message) }] };
    }
  }
);

// list_severities -----------------------------------------------------------
server.registerTool(
  "list_severities",
  { title: "List Severities", description: "Return cached severities" },
  async () => ({ content: [{ type: "text", text: toText(severities) }] })
);

// list_incident_types -------------------------------------------------------
server.registerTool(
  "list_incident_types",
  { title: "List Incident Types", description: "Return cached incident types" },
  async () => ({ content: [{ type: "text", text: toText(incidentTypes) }] })
);

// get_incident_type ---------------------------------------------------------
server.registerTool(
  "get_incident_type",
  {
    title: "Get Incident Type",
    description: "Get details for a specific incident type.",
    inputSchema: {
      id: z.string(),
    },
  },
  async ({ id }: { id: string }) => {
    try {
      const { data } = await incidentV1.get(`/incident_types/${id}`);
      return { content: [{ type: "text", text: toText(data.incident_type) }] };
    } catch (err: any) {
      if (err.response?.status === 404) {
        return { isError: true, content: [{ type: "text", text: `Incident type ${id} not found` }] };
      }
      return { isError: true, content: [{ type: "text", text: toText(err.response?.data ?? err.message) }] };
    }
  }
);

// list_incident_statuses ----------------------------------------------------
server.registerTool(
  "list_incident_statuses",
  {
    title: "List Incident Statuses",
    description: "Return cached incident statuses.",
  },
  async () => ({ content: [{ type: "text", text: toText(incidentStatuses) }] })
);

// create_incident -----------------------------------------------------------
server.registerTool(
  "create_incident",
  {
    title: "Create Incident",
    description: "Create a new incident via incident.io API (subset of fields).",
    inputSchema: {
      name: z.string(),
      summary: z.string(),
      severity: z.string().optional(),
      severity_id: z.string().optional(),
      status: z.string().optional(),
      created_at: z.string().optional(),
      visibility: z.enum(["public", "private"]).optional(),
      incident_type: z.string().optional(),
      incident_type_id: z.string().optional(),
      mode: z.enum(["standard", "retrospective", "test", "tutorial"]).optional(),
      idempotency_key: z.string().optional(),
      custom_field_entries: z
        .array(
          z.object({
            custom_field_id: z.string(),
            values: z.array(
              z.object({
                value_text: z.string().optional(),
                value_link: z.string().optional(),
                value_numeric: z.number().optional(),
                value_option_id: z.string().optional(),
                value_catalog_entry_id: z.string().optional(),
                value_timestamp: z.string().optional(),
              })
            ),
          })
        )
        .optional(),
      incident_role_assignments: z
        .array(
          z.object({
            assignee: z
              .object({
                id: z.string().optional(),
                email: z.string().optional(),
                slack_user_id: z.string().optional(),
              })
              .optional(),
            incident_role_id: z.string(),
          })
        )
        .optional(),
      incident_timestamp_values: z
        .array(
          z.object({
            incident_timestamp_id: z.string(),
            value: z.string(),
          })
        )
        .optional(),
      slack_channel_name_override: z.string().optional(),
      slack_team_id: z.string().optional(),

      // Convenience params mapping to custom fields
      product: z.string().optional(),
      region: z.string().optional(),
      feature: z.string().optional(),

      test_incident: z.boolean().optional(),
    },
  },
  // eslint-disable-next-line max-params
  async (args: Record<string, any>) => {
    const {
      name,
      summary,
      severity,
      severity_id,
      status,
      created_at,
      visibility,
      incident_type,
      incident_type_id,
      mode,
      idempotency_key,
      custom_field_entries = [],
      incident_role_assignments = [],
      incident_timestamp_values = [],
      slack_channel_name_override,
      slack_team_id,
      product,
      region,
      feature,
      test_incident,
    } = args;

    // Determine severity
    const finalSeverityId = severity_id ?? findSeverityId(severity ?? "");
    if (!finalSeverityId) {
      return { isError: true, content: [{ type: "text", text: `Invalid severity provided` }] };
    }

    // Determine incident type
    const finalIncidentTypeId = incident_type_id ?? findIncidentTypeId(incident_type);

    // Determine status
    const finalStatusId = findStatusId(status);

    const payload: Record<string, unknown> = {
      idempotency_key: idempotency_key ?? `mcp-${Date.now()}`,
      severity_id: finalSeverityId,
      incident_status_id: finalStatusId,
      visibility: visibility ?? "private",
      mode: mode ?? "standard",
      incident_type_id: finalIncidentTypeId,
      name,
      summary,
      created_at,
      custom_field_entries: [
        ...custom_field_entries,
        ...(product ? [{ custom_field_id: "product", values: [{ value_text: product }] }] : []),
        ...(region ? [{ custom_field_id: "region", values: [{ value_text: region }] }] : []),
        ...(feature ? [{ custom_field_id: "feature", values: [{ value_text: feature }] }] : []),
      ],
      description: summary,
      test_incident,
      incident_role_assignments,
      incident_timestamp_values,
      slack_channel_name_override,
      slack_team_id,
    };

    try {
      const { data } = await incidentV2.post("/incidents", payload);
      return { content: [{ type: "text", text: toText(data.incident) }] };
    } catch (err: any) {
      return { isError: true, content: [{ type: "text", text: toText(err.response?.data ?? err.message) }] };
    }
  }
);

// update_incident_status ----------------------------------------------------
server.registerTool(
  "update_incident_status",
  {
    title: "Update Incident Status",
    description: "Set a new status for an incident by reference",
    inputSchema: { reference: z.string(), status: z.string() },
  },
  async ({ reference, status }: { reference: string; status: string }) => {
    const statusId = findStatusId(status);
    if (!statusId) {
      return { isError: true, content: [{ type: "text", text: `Invalid status provided: ${status}` }] };
    }

    try {
      // First, get the incident to ensure it exists and to get its ID.
      const { data: incidentData } = await incidentV2.get(`/incidents/${reference}`);
      const incidentId = incidentData.incident.id;

      const resp = await incidentV2.post(`/incidents/${incidentId}/status`, { incident_status_id: statusId });
      return { content: [{ type: "text", text: toText(resp.data.incident) }] };
    } catch (err: any) {
      if (err.response?.status === 404) {
        return { isError: true, content: [{ type: "text", text: `Incident ${reference} not found` }] };
      }
      return { isError: true, content: [{ type: "text", text: toText(err.response?.data ?? err.message) }] };
    }
  }
);

// add_incident_timestamp ----------------------------------------------------
server.registerTool(
  "add_incident_timestamp",
  {
    title: "Add Incident Timestamp",
    description: "Add a timestamp to an incident",
    inputSchema: {
      reference: z.string(),
      timestamp_name: z.string(),
      value: z.string().describe("ISO 8601 timestamp"),
    },
  },
  async ({ reference, timestamp_name, value }: { reference: string; timestamp_name: string; value: string }) => {
    const { data } = await incidentV2.get("/incidents");
    const incident = data.incidents.find((i: any) => i.reference === reference);
    if (!incident) return { isError: true, content: [{ type: "text", text: `Incident ${reference} not found` }] };

    try {
      const resp = await incidentV2.post(`/incidents/${incident.id}/timestamps`, { timestamp_name, value });
      return { content: [{ type: "text", text: toText(resp.data) }] };
    } catch (err: any) {
      return { isError: true, content: [{ type: "text", text: toText(err.response?.data ?? err.message) }] };
    }
  }
);

// User & Role Management ----------------------------------------------------

// list_users ----------------------------------------------------------------
server.registerTool(
  "list_users",
  {
    title: "List Users",
    description: "List all users in the organization.",
    inputSchema: {
      page_size: z.number().int().min(1).max(100).optional(),
      after: z.string().optional(),
    },
  },
  async ({ page_size = 25, after }: { page_size?: number; after?: string }) => {
    const qs = new URLSearchParams();
    qs.append("page_size", String(page_size));
    if (after) qs.append("after", after);
    try {
      const { data } = await incidentV2.get(`/users?${qs.toString()}`);
      return { content: [{ type: "text", text: toText(data) }] };
    } catch (err: any) {
      return { isError: true, content: [{ type: "text", text: toText(err.response?.data ?? err.message) }] };
    }
  }
);

// get_user ------------------------------------------------------------------
server.registerTool(
  "get_user",
  {
    title: "Get User",
    description: "Get details for a specific user by ID.",
    inputSchema: {
      id: z.string(),
    },
  },
  async ({ id }: { id: string }) => {
    try {
      const { data } = await incidentV2.get(`/users/${id}`);
      return { content: [{ type: "text", text: toText(data.user) }] };
    } catch (err: any) {
      if (err.response?.status === 404) {
        return { isError: true, content: [{ type: "text", text: `User ${id} not found` }] };
      }
      return { isError: true, content: [{ type: "text", text: toText(err.response?.data ?? err.message) }] };
    }
  }
);

// list_incident_roles -------------------------------------------------------
server.registerTool(
  "list_incident_roles",
  {
    title: "List Incident Roles",
    description: "Return available incident roles.",
  },
  async () => {
    const { data } = await incidentV2.get("/incident_roles");
    return { content: [{ type: "text", text: toText(data.incident_roles) }] };
  }
);

// assign_role_to_incident -------------------------------------------------
server.registerTool(
  "assign_role_to_incident",
  {
    title: "Assign Role to Incident",
    description: "Assign a user to a specific role for an incident.",
    inputSchema: {
      reference: z.string(),
      incident_role_id: z.string(),
      user_id: z.string().optional(),
      email: z.string().optional(),
    },
  },
  async ({ reference, incident_role_id, user_id, email }: { reference: string; incident_role_id: string; user_id?: string; email?: string }) => {
    if (!user_id && !email) {
      return { isError: true, content: [{ type: "text", text: `User ID or email is required.` }] };
    }

    try {
      const { data: incidentData } = await incidentV2.get(`/incidents/${reference}`);
      const incidentId = incidentData.incident.id;

      const payload: Record<string, any> = {
        incident_id: incidentId,
        incident_role_id: incident_role_id,
        assignee: {},
      };
      if (user_id) payload.assignee.id = user_id;
      if (email) payload.assignee.email = email;

      const { data } = await incidentV1.post("/incident_memberships", payload);
      return { content: [{ type: "text", text: toText(data.incident_membership) }] };
    } catch (err: any) {
      return { isError: true, content: [{ type: "text", text: toText(err.response?.data ?? err.message) }] };
    }
  }
);

// revoke_role_from_incident -------------------------------------------------
server.registerTool(
  "revoke_role_from_incident",
  {
    title: "Revoke Role from Incident",
    description: "Revoke a user's role from an incident.",
    inputSchema: {
      reference: z.string(),
      incident_role_id: z.string(),
      user_id: z.string().optional(),
      email: z.string().optional(),
    },
  },
  async ({ reference, incident_role_id, user_id, email }: { reference: string; incident_role_id: string; user_id?: string; email?: string }) => {
    if (!user_id && !email) {
      return { isError: true, content: [{ type: "text", text: `User ID or email is required.` }] };
    }

    try {
      const { data: incidentData } = await incidentV2.get(`/incidents/${reference}`);
      const incidentId = incidentData.incident.id;

      const payload: Record<string, any> = {
        incident_id: incidentId,
        incident_role_id: incident_role_id,
        assignee: {},
      };
      if (user_id) payload.assignee.id = user_id;
      if (email) payload.assignee.email = email;

      const { data } = await incidentV1.post("/incident_memberships/revoke", payload);
      return { content: [{ type: "text", text: toText(data) }] };
    } catch (err: any) {
      return { isError: true, content: [{ type: "text", text: toText(err.response?.data ?? err.message) }] };
    }
  }
);

// ----------------------------------------------------------------------------
// Start transport
// ----------------------------------------------------------------------------
const transport = new StdioServerTransport();
await server.connect(transport); 