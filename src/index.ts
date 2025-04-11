#!/usr/bin/env node

import express, { Request, Response } from 'express';
import axios from 'axios';

// Get configuration from environment variables
const port = process.env.PORT || 3000;
const apiKey = process.env.API_KEY;

if (!apiKey) {
  console.error('Error: API_KEY environment variable is required');
  process.exit(1);
}

const app = express();

// Initialize axios instance for incident.io API
const incidentIoApi = axios.create({
  baseURL: 'https://api.incident.io/v2',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  },
});

// Initialize axios instance for v1 API endpoints
const incidentIoApiV1 = axios.create({
  baseURL: 'https://api.incident.io/v1',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  },
});

// Cache for incident types, statuses, and severities
let incidentTypesCache: any[] = [];
let severitiesCache: any[] = [];
const validStatuses = ['investigating', 'identified', 'monitoring', 'resolved', 'postmortem'];

// Function to refresh the cache
async function refreshCache() {
  try {
    // Get incident types from v1 API
    const typesResponse = await incidentIoApiV1.get('/incident_types');
    incidentTypesCache = typesResponse.data.incident_types;
    console.log('Cached incident types:', incidentTypesCache.map(t => t.name).join(', '));

    // Get severities from v1 API
    const severitiesResponse = await incidentIoApiV1.get('/severities');
    severitiesCache = severitiesResponse.data.severities;
    console.log('Cached severities:', severitiesCache.map(s => s.name).join(', '));
  } catch (error) {
    console.error('Error refreshing cache:', error);
  }
}

// Refresh cache on startup
refreshCache();

// Refresh cache every hour
setInterval(refreshCache, 60 * 60 * 1000);

app.use(express.json());

// Root endpoint with available endpoints
app.get('/', (req: Request, res: Response) => {
  res.json({
    endpoints: {
      '/health': {
        method: 'GET',
        description: 'Health check endpoint'
      },
      '/mcp/incidents': {
        methods: ['GET', 'POST'],
        description: 'Get latest incidents or create a new incident',
        get_parameters: {
          page_size: 'number (optional, default: 25) - Number of incidents to return per page',
          after: 'string (optional) - Cursor for pagination, use the after value from the previous response'
        },
        post_body: {
          name: 'string (required)',
          summary: 'string (required)',
          severity: 'string (required) or severity_id: string (required)',
          status: 'string (optional, default: investigating)',
          created_at: 'string (optional)',
          custom_field_entries: 'array (optional) - Array of custom field entries',
          test_incident: 'boolean (optional)',
          visibility: 'string (optional, default: private)',
          description: 'string (optional)',
          incident_type: 'string (optional)',
          incident_role_assignments: 'array (optional)',
          labels: 'array (optional)',
          postmortem_document_url: 'string (optional)',
          slack_channel_id: 'string (optional)',
          slack_channel_name: 'string (optional)',
          slack_team_id: 'string (optional)',
          slack_team_name: 'string (optional)',
          mode: 'string (optional, default: standard) - Use "retrospective" for historical incidents',
          metadata: 'object (optional) - Can contain status, created_at, postmortem_document_url, slack_channel_name, incident_type, mode'
        },
        response_fields: {
          always_present: [
            'id',
            'reference',
            'name',
            'status',
            'severity',
            'created_at',
            'permalink',
            'visibility',
            'mode',
            'summary',
            'incident_type',
            'postmortem_document_url',
            'slack_channel_id',
            'slack_channel_name',
            'slack_team_id',
            'updated_at'
          ],
          optional: [
            'description',
            'incident_role_assignments',
            'labels',
            'custom_field_entries',
            'resolved_at',
            'started_at',
            'ended_at',
            'call_url',
            'call_url_expires_at',
            'call_url_created_at',
            'call_url_updated_at',
            'call_url_expires_in',
            'call_url_expires_in_seconds',
            'call_url_expires_in_minutes',
            'call_url_expires_in_hours',
            'call_url_expires_in_days',
            'call_url_expires_in_weeks',
            'call_url_expires_in_months',
            'call_url_expires_in_years',
            'external_issue_reference',
            'duration_metrics',
            'incident_timestamp_values'
          ]
        },
        pagination: {
          description: 'The response includes pagination information to fetch all incidents',
          fields: {
            total_count: 'Total number of incidents available',
            page_size: 'Number of incidents returned in this page',
            after: 'Cursor to use for fetching the next page',
            has_more: 'Boolean indicating if there are more incidents to fetch'
          },
          usage: {
            description: 'To fetch all incidents, follow these steps:',
            steps: [
              '1. Make initial request without the after parameter',
              '2. Check has_more in the response',
              '3. If has_more is true, use the after value from the response for the next request',
              '4. Repeat steps 2-3 until has_more is false',
              '5. Combine all incidents from each response'
            ],
            example: {
              first_request: 'GET /mcp/incidents?page_size=100',
              next_request: 'GET /mcp/incidents?page_size=100&after=01JN78CSP3YCEHXY3DFN6V16YP',
              response_format: {
                incidents: 'Array of incident objects',
                pagination: {
                  total_count: 'Total number of incidents',
                  page_size: 'Number of incidents in this page',
                  after: 'Cursor for next page',
                  has_more: 'Boolean indicating if more pages exist'
                }
              }
            }
          }
        }
      },
      '/mcp/incidents/:reference': {
        method: 'GET',
        description: 'Get details of a single incident by its reference number',
        parameters: {
          reference: 'string (required) - The incident reference number (e.g., INC-1080)'
        },
        example: {
          request: 'GET /mcp/incidents/INC-1080',
          response: {
            id: 'string - Unique incident ID',
            reference: 'string - Incident reference number',
            name: 'string - Incident name',
            status: 'string - Current status',
            severity: 'string - Severity level',
            created_at: 'string - Creation timestamp',
            permalink: 'string - URL to incident in incident.io',
            visibility: 'string - Incident visibility',
            mode: 'string - Incident mode (standard or retrospective)',
            summary: 'string - Incident summary',
            incident_type: 'object - Incident type details',
            postmortem_document_url: 'string - URL to postmortem document',
            slack_channel_id: 'string - Slack channel ID',
            slack_channel_name: 'string - Slack channel name',
            slack_team_id: 'string - Slack team ID',
            updated_at: 'string - Last update timestamp',
            // ... other optional fields
          }
        }
      },
      '/mcp/incidents/:reference/status': {
        method: 'POST',
        description: 'Update the status of an incident',
        parameters: {
          reference: 'string (required) - The incident reference number (e.g., INC-1080)'
        },
        post_body: {
          status: 'string (required) - New status for the incident'
        },
        example: {
          request: 'POST /mcp/incidents/INC-1080/status',
          request_body: {
            status: 'resolved'
          },
          response: {
            id: 'string - Incident ID',
            reference: 'string - Incident reference',
            status: 'string - New status',
            updated_at: 'string - Update timestamp'
          }
        }
      },
      '/mcp/incidents/:reference/timestamps': {
        method: 'POST',
        description: 'Add a timestamp to an incident',
        parameters: {
          reference: 'string (required) - The incident reference number (e.g., INC-1080)'
        },
        post_body: {
          timestamp_name: 'string (required) - Name of the timestamp',
          value: 'string (required) - ISO 8601 timestamp'
        },
        example: {
          request: 'POST /mcp/incidents/INC-1080/timestamps',
          request_body: {
            timestamp_name: 'Impact started',
            value: '2025-04-09T11:53:53.977Z'
          },
          response: {
            incident_timestamp: {
              id: 'string - Timestamp ID',
              name: 'string - Timestamp name',
              rank: 'number - Timestamp rank'
            },
            value: {
              value: 'string - Timestamp value'
            }
          }
        }
      },
      '/mcp/severities': {
        method: 'GET',
        description: 'Get available severities',
        response: {
          severities: 'array - List of available severities',
          each_severity: {
            id: 'string - Severity ID',
            name: 'string - Severity name',
            description: 'string - Severity description',
            rank: 'number - Severity rank',
            created_at: 'string - Creation timestamp',
            updated_at: 'string - Last update timestamp'
          }
        }
      },
      '/mcp/incident_types': {
        method: 'GET',
        description: 'Get available incident types',
        response: {
          incident_types: 'array - List of available incident types',
          each_incident_type: {
            id: 'string - Incident type ID',
            name: 'string - Incident type name',
            description: 'string - Incident type description',
            rank: 'number - Incident type rank',
            created_at: 'string - Creation timestamp',
            updated_at: 'string - Last update timestamp'
          }
        }
      }
    }
  });
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'healthy' });
});

// MCP endpoint to get latest incidents
app.get('/mcp/incidents', async (req: Request, res: Response) => {
  try {
    // Get pagination parameters from query string
    const pageSize = parseInt(req.query.page_size as string) || 25;
    const after = req.query.after as string;
    
    // Build query parameters for incident.io API
    const queryParams = new URLSearchParams();
    queryParams.append('page_size', pageSize.toString());
    if (after) {
      queryParams.append('after', after);
    }

    console.log('Fetching incidents with params:', queryParams.toString());
    const response = await incidentIoApi.get(`/incidents?${queryParams.toString()}`);
    console.log('Response pagination:', response.data.pagination_meta);

    const incidents = response.data.incidents;

    // Transform the incidents data with all available properties
    const transformedIncidents = incidents.map((incident: any) => {
      // Base fields that are always present
      const baseIncident = {
        id: incident.id,
        reference: incident.reference,
        name: incident.name,
        status: incident.incident_status.name,
        severity: incident.severity.name,
        created_at: incident.created_at,
        permalink: incident.permalink,
        visibility: incident.visibility,
        mode: incident.mode,
        summary: incident.summary,
        incident_type: incident.incident_type,
        postmortem_document_url: incident.postmortem_document_url,
        slack_channel_id: incident.slack_channel_id,
        slack_channel_name: incident.slack_channel_name,
        slack_team_id: incident.slack_team_id,
        updated_at: incident.updated_at
      };

      // Optional fields that may be present
      const optionalFields = {
        description: incident.description,
        incident_role_assignments: incident.incident_role_assignments,
        labels: incident.labels,
        custom_fields: incident.custom_field_entries,
        resolved_at: incident.resolved_at,
        started_at: incident.started_at,
        ended_at: incident.ended_at,
        call_url: incident.call_url,
        call_url_expires_at: incident.call_url_expires_at,
        call_url_created_at: incident.call_url_created_at,
        call_url_updated_at: incident.call_url_updated_at,
        call_url_expires_in: incident.call_url_expires_in,
        call_url_expires_in_seconds: incident.call_url_expires_in_seconds,
        call_url_expires_in_minutes: incident.call_url_expires_in_minutes,
        call_url_expires_in_hours: incident.call_url_expires_in_hours,
        call_url_expires_in_days: incident.call_url_expires_in_days,
        call_url_expires_in_weeks: incident.call_url_expires_in_weeks,
        call_url_expires_in_months: incident.call_url_expires_in_months,
        call_url_expires_in_years: incident.call_url_expires_in_years,
        external_issue_reference: incident.external_issue_reference,
        duration_metrics: incident.duration_metrics,
        incident_timestamp_values: incident.incident_timestamp_values
      };

      // Filter out undefined optional fields
      const filteredOptionalFields = Object.fromEntries(
        Object.entries(optionalFields).filter(([_, value]) => value !== undefined)
      );

      return { ...baseIncident, ...filteredOptionalFields };
    });

    res.json({
      incidents: transformedIncidents,
      pagination: response.data.pagination_meta
    });
  } catch (error: any) {
    console.error('Error fetching incidents:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to fetch incidents',
      details: error.response?.data || { message: error.message }
    });
  }
});

// MCP endpoint to get severities
app.get('/mcp/severities', async (req: Request, res: Response) => {
  try {
    // Forward the authorization header from the request
    const response = await incidentIoApiV1.get('/severities', {
      headers: {
        'Authorization': req.headers.authorization || `Bearer ${apiKey}`
      }
    });
    res.json(response.data);
  } catch (error: any) {
    console.error('Error fetching severities:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to fetch severities',
      details: error.response?.data || { message: error.message }
    });
  }
});

// MCP endpoint to get incident types
app.get('/mcp/incident_types', async (req: Request, res: Response) => {
  try {
    // Forward the authorization header from the request
    const response = await incidentIoApiV1.get('/incident_types', {
      headers: {
        'Authorization': req.headers.authorization || `Bearer ${apiKey}`
      }
    });
    res.json(response.data);
  } catch (error: any) {
    console.error('Error fetching incident types:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to fetch incident types',
      details: error.response?.data || { message: error.message }
    });
  }
});

// MCP endpoint to create incidents
app.post('/mcp/incidents', async (req: Request, res: Response) => {
  try {
    // Extract all fields from request body
    const {
      name,
      summary,
      severity,
      severity_id,
      status,
      created_at,
      custom_field_entries = [],
      visibility,
      description,
      incident_type,
      incident_type_id,
      incident_role_assignments = [],
      labels = [],
      postmortem_document_url,
      slack_channel_id,
      slack_channel_name,
      slack_team_id,
      slack_team_name,
      idempotency_key,
      mode,
      external_issue_reference,
      incident_timestamp_values = [],
      duration_metrics
    } = req.body;

    // Validate required fields
    if (!name || !summary || (!severity && !severity_id)) {
      return res.status(400).json({
        error: 'Missing required fields',
        details: {
          required: ['name', 'summary', 'severity or severity_id'],
          received: Object.keys(req.body)
        }
      });
    }

    // If severity_id is provided, use it directly, otherwise look up the severity
    let finalSeverityId = severity_id;
    if (!finalSeverityId && severity) {
      const severityObj = severitiesCache.find(
        (s: any) => s.name.toLowerCase() === severity.toLowerCase()
      );
      
      if (!severityObj) {
        return res.status(400).json({
          error: 'Invalid severity',
          details: {
            message: `Severity "${severity}" not found. Available severities: ${severitiesCache.map((s: any) => s.name).join(', ')}`,
          }
        });
      }
      finalSeverityId = severityObj.id;
    }

    // Handle incident type
    let finalIncidentTypeId = incident_type_id;
    if (!finalIncidentTypeId && incident_type) {
      if (typeof incident_type === 'object' && incident_type.id) {
        finalIncidentTypeId = incident_type.id;
      } else if (typeof incident_type === 'string') {
        const typeObj = incidentTypesCache.find(
          (t: any) => t.name.toLowerCase() === incident_type.toLowerCase()
        );
        if (typeObj) {
          finalIncidentTypeId = typeObj.id;
        }
      }
    }

    // Generate idempotency key if not provided
    const finalIdempotencyKey = idempotency_key || `mcp-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;

    // Create the incident with all available fields
    const requestPayload = {
      idempotency_key: finalIdempotencyKey,
      visibility: visibility,
      incident: {
        name,
        summary,
        severity_id: finalSeverityId,
        incident_status_id: status,
        created_at,
        custom_field_entries,
        description,
        incident_type_id: finalIncidentTypeId,
        incident_role_assignments,
        labels,
        postmortem_document_url,
        slack_channel_id,
        slack_channel_name,
        slack_team_id,
        slack_team_name,
        mode,
        external_issue_reference,
        incident_timestamp_values,
        duration_metrics,
        preserve_name: true
      }
    };
    
    // Log the request payload for debugging
    console.log('Creating incident with payload:', JSON.stringify(requestPayload, null, 2));
    
    // Make the API request
    try {
      const response = await incidentIoApi.post('/incidents', requestPayload);
      console.log('API response:', response.data);

      // Transform the response to match our format
      const baseIncident = {
        id: response.data.incident.id,
        reference: response.data.incident.reference,
        name: response.data.incident.name,
        status: response.data.incident.incident_status.name,
        severity: response.data.incident.severity.name,
        created_at: response.data.incident.created_at,
        permalink: response.data.incident.permalink,
        visibility: response.data.incident.visibility,
        mode: response.data.incident.mode,
        summary: response.data.incident.summary,
        incident_type: response.data.incident.incident_type,
        postmortem_document_url: response.data.incident.postmortem_document_url,
        slack_channel_id: response.data.incident.slack_channel_id,
        slack_channel_name: response.data.incident.slack_channel_name,
        slack_team_id: response.data.incident.slack_team_id,
        updated_at: response.data.incident.updated_at
      };

      // Optional fields that may be present
      const optionalFields = {
        description: response.data.incident.description,
        incident_role_assignments: response.data.incident.incident_role_assignments,
        labels: response.data.incident.labels,
        custom_field_entries: response.data.incident.custom_field_entries,
        resolved_at: response.data.incident.resolved_at,
        started_at: response.data.incident.started_at,
        ended_at: response.data.incident.ended_at,
        call_url: response.data.incident.call_url,
        call_url_expires_at: response.data.incident.call_url_expires_at,
        call_url_created_at: response.data.incident.call_url_created_at,
        call_url_updated_at: response.data.incident.call_url_updated_at,
        call_url_expires_in: response.data.incident.call_url_expires_in,
        call_url_expires_in_seconds: response.data.incident.call_url_expires_in_seconds,
        call_url_expires_in_minutes: response.data.incident.call_url_expires_in_minutes,
        call_url_expires_in_hours: response.data.incident.call_url_expires_in_hours,
        call_url_expires_in_days: response.data.incident.call_url_expires_in_days,
        call_url_expires_in_weeks: response.data.incident.call_url_expires_in_weeks,
        call_url_expires_in_months: response.data.incident.call_url_expires_in_months,
        call_url_expires_in_years: response.data.incident.call_url_expires_in_years,
        external_issue_reference: response.data.incident.external_issue_reference,
        duration_metrics: response.data.incident.duration_metrics,
        incident_timestamp_values: response.data.incident.incident_timestamp_values
      };

      // Filter out undefined optional fields
      const filteredOptionalFields = Object.fromEntries(
        Object.entries(optionalFields).filter(([_, value]) => value !== undefined)
      );

      const createdIncident = { ...baseIncident, ...filteredOptionalFields };

      res.status(201).json(createdIncident);
    } catch (error: any) {
      console.error('API error:', error.response?.data || error.message);
      throw error;
    }
  } catch (error: any) {
    console.error('Error creating incident:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to create incident',
      details: error.response?.data || { message: error.message }
    });
  }
});

// MCP endpoint to get a single incident by reference
app.get('/mcp/incidents/:reference', async (req: Request, res: Response) => {
  try {
    const { reference } = req.params;
    
    // First, get all incidents to find the one with matching reference
    const response = await incidentIoApi.get('/incidents');
    const incident = response.data.incidents.find((inc: any) => inc.reference === reference);

    if (!incident) {
      return res.status(404).json({
        error: 'Incident not found',
        details: `No incident found with reference ${reference}`
      });
    }

    // Transform the incident data with all available properties
    const baseIncident = {
      id: incident.id,
      reference: incident.reference,
      name: incident.name,
      status: incident.incident_status.name,
      severity: incident.severity.name,
      created_at: incident.created_at,
      permalink: incident.permalink,
      visibility: incident.visibility,
      mode: incident.mode,
      summary: incident.summary,
      incident_type: incident.incident_type,
      postmortem_document_url: incident.postmortem_document_url,
      slack_channel_id: incident.slack_channel_id,
      slack_channel_name: incident.slack_channel_name,
      slack_team_id: incident.slack_team_id,
      updated_at: incident.updated_at
    };

    // Optional fields that may be present
    const optionalFields = {
      description: incident.description,
      incident_role_assignments: incident.incident_role_assignments,
      labels: incident.labels,
      custom_fields: incident.custom_field_entries,
      resolved_at: incident.resolved_at,
      started_at: incident.started_at,
      ended_at: incident.ended_at,
      call_url: incident.call_url,
      call_url_expires_at: incident.call_url_expires_at,
      call_url_created_at: incident.call_url_created_at,
      call_url_updated_at: incident.call_url_updated_at,
      call_url_expires_in: incident.call_url_expires_in,
      call_url_expires_in_seconds: incident.call_url_expires_in_seconds,
      call_url_expires_in_minutes: incident.call_url_expires_in_minutes,
      call_url_expires_in_hours: incident.call_url_expires_in_hours,
      call_url_expires_in_days: incident.call_url_expires_in_days,
      call_url_expires_in_weeks: incident.call_url_expires_in_weeks,
      call_url_expires_in_months: incident.call_url_expires_in_months,
      call_url_expires_in_years: incident.call_url_expires_in_years,
      external_issue_reference: incident.external_issue_reference,
      duration_metrics: incident.duration_metrics,
      incident_timestamp_values: incident.incident_timestamp_values
    };

    // Filter out undefined optional fields
    const filteredOptionalFields = Object.fromEntries(
      Object.entries(optionalFields).filter(([_, value]) => value !== undefined)
    );

    res.json({ ...baseIncident, ...filteredOptionalFields });
  } catch (error: any) {
    console.error('Error fetching incident:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to fetch incident',
      details: error.response?.data || { message: error.message }
    });
  }
});

// MCP endpoint to update incident status
app.post('/mcp/incidents/:reference/status', async (req: Request, res: Response) => {
  try {
    const { reference } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        error: 'Missing required field',
        details: {
          required: ['status'],
          received: Object.keys(req.body)
        }
      });
    }

    // First, get the incident to find its ID
    const incidentsResponse = await incidentIoApi.get('/incidents');
    const incident = incidentsResponse.data.incidents.find((inc: any) => inc.reference === reference);

    if (!incident) {
      return res.status(404).json({
        error: 'Incident not found',
        details: `No incident found with reference ${reference}`
      });
    }

    // Update the incident status
    const response = await incidentIoApi.post(`/incidents/${incident.id}/status`, {
      status
    });

    res.json({
      id: response.data.incident.id,
      reference: response.data.incident.reference,
      status: response.data.incident.incident_status.name,
      updated_at: response.data.incident.updated_at
    });
  } catch (error: any) {
    console.error('Error updating incident status:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to update incident status',
      details: error.response?.data || { message: error.message }
    });
  }
});

// MCP endpoint to add incident timestamps
app.post('/mcp/incidents/:reference/timestamps', async (req: Request, res: Response) => {
  try {
    const { reference } = req.params;
    const { timestamp_name, value } = req.body;

    if (!timestamp_name || !value) {
      return res.status(400).json({
        error: 'Missing required fields',
        details: {
          required: ['timestamp_name', 'value'],
          received: Object.keys(req.body)
        }
      });
    }

    // First, get the incident to find its ID
    const incidentsResponse = await incidentIoApi.get('/incidents');
    const incident = incidentsResponse.data.incidents.find((inc: any) => inc.reference === reference);

    if (!incident) {
      return res.status(404).json({
        error: 'Incident not found',
        details: `No incident found with reference ${reference}`
      });
    }

    // Add the timestamp
    const response = await incidentIoApi.post(`/incidents/${incident.id}/timestamps`, {
      timestamp_name,
      value
    });

    res.json(response.data);
  } catch (error: any) {
    console.error('Error adding incident timestamp:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to add incident timestamp',
      details: error.response?.data || { message: error.message }
    });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`MCP Server running on port ${port}`);
}); 