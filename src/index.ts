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
  baseURL: 'https://api.incident.io',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  },
});

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
          severity: 'string (required)',
          status: 'string (optional)',
          created_at: 'string (optional)',
          custom_fields: 'object (optional)',
          test_incident: 'boolean (optional)',
          visibility: 'string (optional)',
          description: 'string (optional)',
          incident_type: 'string (optional)',
          incident_role_assignments: 'array (optional)',
          labels: 'array (optional)',
          postmortem_document_url: 'string (optional)',
          slack_channel_id: 'string (optional)',
          slack_channel_name: 'string (optional)',
          slack_team_id: 'string (optional)',
          slack_team_name: 'string (optional)'
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
            'visibility'
          ],
          optional: [
            'summary',
            'description',
            'incident_type',
            'incident_role_assignments',
            'labels',
            'postmortem_document_url',
            'slack_channel_id',
            'slack_channel_name',
            'slack_team_id',
            'slack_team_name',
            'custom_fields',
            'test_incident',
            'updated_at',
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
            'call_url_expires_in_years'
          ]
        },
        pagination: {
          description: 'The response includes pagination information to fetch all incidents',
          fields: {
            total_count: 'Total number of incidents available',
            page_size: 'Number of incidents returned in this page',
            after: 'Cursor to use for fetching the next page',
            has_more: 'Boolean indicating if there are more incidents to fetch'
          }
        }
      },
      '/mcp/severities': {
        method: 'GET',
        description: 'Get available severities'
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
    const response = await incidentIoApi.get(`/v1/incidents?${queryParams.toString()}`);
    console.log('Response pagination:', response.data.pagination_meta);

    const incidents = response.data.incidents;
    const pagination = response.data.pagination_meta;

    // Transform the incidents data with all available properties
    const transformedIncidents = incidents.map((incident: any) => {
      // Base fields that are always present
      const baseIncident = {
        id: incident.id,
        reference: incident.reference,
        name: incident.name,
        status: incident.status,
        severity: incident.severity.name,
        created_at: incident.created_at,
        permalink: incident.permalink,
        visibility: incident.visibility
      };

      // Optional fields that may be present
      const optionalFields = {
        summary: incident.summary,
        description: incident.description,
        incident_type: incident.incident_type,
        incident_role_assignments: incident.incident_role_assignments,
        labels: incident.labels,
        postmortem_document_url: incident.postmortem_document_url,
        slack_channel_id: incident.slack_channel_id,
        slack_channel_name: incident.slack_channel_name,
        slack_team_id: incident.slack_team_id,
        slack_team_name: incident.slack_team_name,
        custom_fields: incident.custom_fields,
        test_incident: incident.test_incident,
        updated_at: incident.updated_at,
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
        call_url_expires_in_years: incident.call_url_expires_in_years
      };

      // Filter out undefined optional fields
      const filteredOptionalFields = Object.fromEntries(
        Object.entries(optionalFields).filter(([_, value]) => value !== undefined)
      );

      return { ...baseIncident, ...filteredOptionalFields };
    });

    // Check if there are more incidents based on the total count
    const hasMore = pagination.after !== null && pagination.after !== undefined;

    res.json({
      incidents: transformedIncidents,
      total_count: pagination.total_record_count,
      page_size: pageSize,
      after: pagination.after,
      has_more: hasMore
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
    const response = await incidentIoApi.get('/v1/severities');
    res.json(response.data);
  } catch (error: any) {
    console.error('Error fetching severities:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to fetch severities',
      details: error.response?.data || { message: error.message }
    });
  }
});

// MCP endpoint to create incidents
app.post('/mcp/incidents', async (req: Request, res: Response) => {
  try {
    const {
      name,
      summary,
      severity,
      status = 'investigating',
      created_at,
      custom_fields = {},
      test_incident = false,
      visibility = 'private',
      description,
      incident_type,
      incident_role_assignments,
      labels,
      postmortem_document_url,
      slack_channel_id,
      slack_channel_name,
      slack_team_id,
      slack_team_name
    } = req.body;

    // Validate required fields
    if (!name || !summary || !severity) {
      return res.status(400).json({
        error: 'Missing required fields',
        details: {
          required: ['name', 'summary', 'severity'],
          received: Object.keys(req.body)
        }
      });
    }

    // Fetch available severities and find the matching ID
    const severitiesResponse = await incidentIoApi.get('/v1/severities');
    const severityId = severitiesResponse.data.severities.find(
      (s: any) => s.name.toLowerCase() === severity.toLowerCase()
    )?.id;

    if (!severityId) {
      return res.status(400).json({
        error: 'Invalid severity',
        details: {
          message: `Severity "${severity}" not found. Available severities: ${severitiesResponse.data.severities.map((s: any) => s.name).join(', ')}`,
        }
      });
    }

    // Generate a unique idempotency key using timestamp and random string
    const idempotency_key = `mcp-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;

    // Create the incident with all available fields
    const requestPayload = {
      idempotency_key,
      visibility,
      severity_id: severityId,
      incident: {
        name,
        summary,
        status,
        created_at,
        custom_fields,
        test_incident,
        description,
        incident_type,
        incident_role_assignments,
        labels,
        postmortem_document_url,
        slack_channel_id,
        slack_channel_name,
        slack_team_id,
        slack_team_name
      }
    };
    
    console.log('Creating incident with payload:', JSON.stringify(requestPayload, null, 2));
    const response = await incidentIoApi.post('/v1/incidents', requestPayload);

    // Transform the response to match our format with all available fields
    const baseIncident = {
      id: response.data.incident.id,
      reference: response.data.incident.reference,
      name: response.data.incident.name,
      status: response.data.incident.status,
      severity: response.data.incident.severity.name,
      created_at: response.data.incident.created_at,
      permalink: response.data.incident.permalink,
      visibility: response.data.incident.visibility
    };

    // Optional fields that may be present
    const optionalFields = {
      summary: response.data.incident.summary,
      description: response.data.incident.description,
      incident_type: response.data.incident.incident_type,
      incident_role_assignments: response.data.incident.incident_role_assignments,
      labels: response.data.incident.labels,
      postmortem_document_url: response.data.incident.postmortem_document_url,
      slack_channel_id: response.data.incident.slack_channel_id,
      slack_channel_name: response.data.incident.slack_channel_name,
      slack_team_id: response.data.incident.slack_team_id,
      slack_team_name: response.data.incident.slack_team_name,
      custom_fields: response.data.incident.custom_fields,
      test_incident: response.data.incident.test_incident,
      updated_at: response.data.incident.updated_at,
      resolved_at: response.data.incident.resolved_at,
      started_at: response.data.incident.started_at,
      ended_at: response.data.incident.ended_at
    };

    // Filter out undefined optional fields
    const filteredOptionalFields = Object.fromEntries(
      Object.entries(optionalFields).filter(([_, value]) => value !== undefined)
    );

    const createdIncident = { ...baseIncident, ...filteredOptionalFields };

    res.status(201).json(createdIncident);
  } catch (error: any) {
    console.error('Error creating incident:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Failed to create incident',
      details: error.response?.data || { message: error.message }
    });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`MCP Server running on port ${port}`);
}); 