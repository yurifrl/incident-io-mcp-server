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

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'healthy' });
});

// MCP endpoint to get latest incidents
app.get('/mcp/incidents', async (req: Request, res: Response) => {
  try {
    const response = await incidentIoApi.get('/v1/incidents');
    
    // Transform the incidents data
    const incidents = response.data.incidents.map((incident: any) => ({
      id: incident.id,
      reference: incident.reference,
      name: incident.name,
      status: incident.status,
      severity: incident.severity.name,
      created_at: incident.created_at,
      summary: incident.summary,
      permalink: incident.permalink
    }));

    res.json({
      incidents,
      total_count: response.data.pagination_meta.total_record_count
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
      visibility = 'private'
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

    // Create the incident
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
        test_incident
      }
    };
    
    console.log('Creating incident with payload:', JSON.stringify(requestPayload, null, 2));
    const response = await incidentIoApi.post('/v1/incidents', requestPayload);

    // Transform the response to match our format
    const createdIncident = {
      id: response.data.incident.id,
      reference: response.data.incident.reference,
      name: response.data.incident.name,
      status: response.data.incident.status,
      severity: response.data.incident.severity.name,
      created_at: response.data.incident.created_at,
      summary: response.data.incident.summary,
      permalink: response.data.incident.permalink,
      test_incident: response.data.incident.test_incident,
      visibility: response.data.incident.visibility
    };

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