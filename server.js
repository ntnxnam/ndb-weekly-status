const express = require('express');
const cors = require('cors');
const JiraClient = require('./jira-client-clean');
const ConfluenceClient = require('./confluence-client');
const TextProcessor = require('./text-processor');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();

// Load port from config or environment variable
function getPort() {
  // Try environment variable first
  if (process.env.PORT) {
    return parseInt(process.env.PORT);
  }
  
  // Try to load from config.json
  try {
    const configPath = path.join(__dirname, 'config.json');
    const configData = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configData);
    return config.server?.port || 3001;
  } catch (error) {
    // Default to 3001 if config not found
    return 3001;
  }
}

const port = getPort();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize Jira client
let jiraClient;
try {
  console.log('🔧 [Server] Initializing Jira client...');
  jiraClient = new JiraClient();
  console.log('✅ [Server] Jira client initialized successfully');
} catch (error) {
  console.error('❌ [Server] Failed to initialize Jira client:', {
    message: error.message,
    stack: error.stack
  });
  console.error('❌ [Server] Please check your configuration files (config.json, jira-key-private.txt)');
  process.exit(1);
}

// Initialize Confluence client
let confluenceClient;
try {
  console.log('🔧 [Server] Initializing Confluence client...');
  confluenceClient = new ConfluenceClient();
  console.log('✅ [Server] Confluence client initialized successfully');
} catch (error) {
  console.warn('⚠️ [Server] Confluence client initialization failed (will use token from request):', error.message);
  confluenceClient = new ConfluenceClient(); // Create anyway, will use token from request
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Fetch all data (expensive operation)
app.get('/api/fetch-all-data', async (req, res) => {
  const startTime = Date.now();
  try {
    const jql = req.query.jql; // Optional custom JQL query
    const userToken = req.headers['x-jira-token']; // Token from frontend
    
    if (!userToken) {
      return res.status(401).json({
        success: false,
        error: 'No authentication token provided. Please authenticate first using the Authenticate button.'
      });
    }
    
    console.log(`📥 [API] /api/fetch-all-data - JQL: ${jql || 'default'}`);
    console.log(`📥 [API] /api/fetch-all-data - Using user-provided token`);
    
    const data = await jiraClient.fetchAllData(jql, userToken);
    const formattedIssues = jiraClient.formatIssues(data.issues, true);
    
    const duration = Date.now() - startTime;
    console.log(`✅ [API] /api/fetch-all-data - Success in ${duration}ms - ${formattedIssues.length} issues`);
    
    res.json({
      success: true,
      total: data.total,
      issues: formattedIssues,
      message: 'All data fetched successfully'
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ [API] /api/fetch-all-data - Failed after ${duration}ms:`, {
      message: error.message,
      stack: error.stack,
      query: req.query
    });
    
    const statusCode = error.response?.status || 500;
    res.status(statusCode).json({
      success: false,
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Refresh columns (uses configured columns only)
app.get('/api/refresh-columns', async (req, res) => {
  const startTime = Date.now();
  try {
    const jql = req.query.jql; // Optional custom JQL query
    const userToken = req.headers['x-jira-token']; // Token from frontend
    
    if (!userToken) {
      return res.status(401).json({
        success: false,
        error: 'No authentication token provided. Please authenticate first using the Authenticate button.'
      });
    }
    
    console.log(`📥 [API] /api/refresh-columns - JQL: ${jql || 'default'}`);
    console.log(`📥 [API] /api/refresh-columns - Using user-provided token`);
    
    const data = await jiraClient.refreshColumns(jql, userToken);
    const formattedIssues = jiraClient.formatIssues(data.issues, false);
    
    const duration = Date.now() - startTime;
    console.log(`✅ [API] /api/refresh-columns - Success in ${duration}ms - ${formattedIssues.length} issues`);
    
    res.json({
      success: true,
      total: data.total,
      issues: formattedIssues,
      message: 'Columns refreshed successfully'
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ [API] /api/refresh-columns - Failed after ${duration}ms:`, {
      message: error.message,
      stack: error.stack,
      query: req.query
    });
    
    const statusCode = error.response?.status || 500;
    res.status(statusCode).json({
      success: false,
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Legacy endpoint for backward compatibility
app.get('/api/issues', async (req, res) => {
  try {
    const jql = req.query.jql; // Optional custom JQL query
    const data = await jiraClient.refreshColumns(jql);
    const formattedIssues = jiraClient.formatIssues(data.issues, false);
    
    res.json({
      success: true,
      total: data.total,
      issues: formattedIssues
    });
  } catch (error) {
    console.error('Error fetching issues:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/issue/:key', async (req, res) => {
  try {
    const issueKey = req.params.key;
    const issue = await jiraClient.getIssueDetails(issueKey);
    
    res.json({
      success: true,
      issue: issue
    });
  } catch (error) {
    console.error('Error fetching issue details:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/table-config', (req, res) => {
  try {
    const tableConfig = jiraClient.getTableConfig();
    res.json({
      success: true,
      config: tableConfig
    });
  } catch (error) {
    console.error('Error fetching table config:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/backend-config', (req, res) => {
  try {
    const backendConfig = jiraClient.getBackendConfig();
    res.json({
      success: true,
      config: backendConfig
    });
  } catch (error) {
    console.error('Error fetching backend config:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Fetch all field names from Jira
app.get('/api/field-names', async (req, res) => {
  try {
    const userToken = req.headers['x-jira-token'];
    
    if (!userToken) {
      return res.status(401).json({
        success: false,
        error: 'No authentication token provided. Please authenticate first.'
      });
    }
    
    const jiraConfig = jiraClient.configManager.getJiraConfig();
    const baseUrl = jiraConfig.baseUrl.replace(/\/$/, '');
    
    const axios = require('axios');
    const fieldsResponse = await axios.get(`${baseUrl}/rest/api/2/field`, {
      headers: {
        'Authorization': `Bearer ${userToken}`,
        'Accept': 'application/json'
      }
    });
    
    const fieldMap = {};
    if (fieldsResponse.data && Array.isArray(fieldsResponse.data)) {
      fieldsResponse.data.forEach(field => {
        fieldMap[field.id] = field.name;
        // Also map by key if different from id
        if (field.key && field.key !== field.id) {
          fieldMap[field.key] = field.name;
        }
      });
    }
    
    console.log(`📋 [API] /api/field-names - Loaded ${Object.keys(fieldMap).length} field names`);
    
    res.json({
      success: true,
      fieldMap: fieldMap,
      count: Object.keys(fieldMap).length
    });
  } catch (error) {
    console.error('❌ [API] /api/field-names - Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch field names'
    });
  }
});

app.post('/api/save-column-config', express.json(), (req, res) => {
  try {
    const { userColumns } = req.body;
    
    if (!Array.isArray(userColumns)) {
      return res.status(400).json({
        success: false,
        error: 'userColumns must be an array'
      });
    }
    
    const success = jiraClient.saveUserConfig(userColumns);
    
    if (success) {
      res.json({
        success: true,
        message: 'Column configuration saved successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to save column configuration'
      });
    }
  } catch (error) {
    console.error('Error saving column config:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/test-token', express.json(), async (req, res) => {
  const startTime = Date.now();
  try {
    const { token, email } = req.body;
    
    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Token is required'
      });
    }
    
    console.log(`🔐 [API] /api/test-token - Testing token authentication...`);
    
    // Test the token with PAT endpoint
    const axios = require('axios');
    const ConfigManager = require('./config');
    const configManager = new ConfigManager();
    const jiraConfig = configManager.getJiraConfig();
    const baseUrl = jiraConfig.baseUrl || 'https://jira.nutanix.com';
    const cleanBaseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    
    try {
      const testResponse = await axios.get(
        `${cleanBaseUrl}/rest/pat/latest/tokens`,
        {
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${token.trim()}`
          },
          timeout: 10000
        }
      );
      
      if (testResponse.status === 200 && Array.isArray(testResponse.data)) {
        console.log(`✅ [API] /api/test-token - Token is valid, found ${testResponse.data.length} tokens`);
        res.json({
          success: true,
          message: 'Token is valid',
          tokenCount: testResponse.data.length
        });
      } else {
        throw new Error('Invalid response from token endpoint');
      }
    } catch (error) {
      console.error('❌ [API] /api/test-token - Token test failed:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      
      if (error.response?.status === 401 || error.response?.status === 403) {
        return res.status(401).json({
          success: false,
          error: 'Invalid token. Please check your Bearer token (PAT).'
        });
      }
      
      throw error;
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ [API] /api/test-token - Failed after ${duration}ms:`, error.message);
    
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to test token'
    });
  }
});

// Fetch Confluence summary for a single page
app.get('/api/confluence/summary', async (req, res) => {
  const startTime = Date.now();
  try {
    const { url } = req.query;
    const userToken = req.headers['x-confluence-token'] || req.headers['x-jira-token'];
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'Confluence URL is required'
      });
    }
    
    console.log(`📄 [API] /api/confluence/summary - Fetching summary for: ${url}`);
    
    const result = await confluenceClient.getSummary(url, userToken);
    const duration = Date.now() - startTime;
    
    if (result.success) {
      console.log(`✅ [API] /api/confluence/summary - Success in ${duration}ms`);
    } else {
      console.log(`⚠️ [API] /api/confluence/summary - Failed in ${duration}ms: ${result.error}`);
    }
    
    res.json(result);
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ [API] /api/confluence/summary - Failed after ${duration}ms:`, error.message);
    
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch Confluence summary'
    });
  }
});

// Batch fetch Confluence summaries
app.post('/api/confluence/summaries', express.json(), async (req, res) => {
  const startTime = Date.now();
  try {
    const { urls } = req.body;
    const userToken = req.headers['x-confluence-token'] || req.headers['x-jira-token'];
    
    if (!urls || !Array.isArray(urls)) {
      return res.status(400).json({
        success: false,
        error: 'URLs array is required'
      });
    }
    
    console.log(`📄 [API] /api/confluence/summaries - Fetching ${urls.length} summaries`);
    
    const results = await confluenceClient.getSummaries(urls, userToken);
    const duration = Date.now() - startTime;
    
    console.log(`✅ [API] /api/confluence/summaries - Completed in ${duration}ms`);
    
    res.json({
      success: true,
      summaries: results
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ [API] /api/confluence/summaries - Failed after ${duration}ms:`, error.message);
    
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch Confluence summaries'
    });
  }
});

// Summarize text (for customfield_23073 and similar fields)
app.post('/api/summarize-text', express.json(), async (req, res) => {
  const startTime = Date.now();
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'Text is required'
      });
    }
    
    console.log(`📝 [API] /api/summarize-text - Summarizing text (${text.length} chars)`);
    
    const textProcessor = new TextProcessor();
    const result = textProcessor.summarize(text);
    
    const duration = Date.now() - startTime;
    console.log(`✅ [API] /api/summarize-text - Success in ${duration}ms`);
    
    res.json({
      success: true,
      summary: result.summary,
      date: result.date,
      display: result.display
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ [API] /api/summarize-text - Failed after ${duration}ms:`, error.message);
    
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to summarize text'
    });
  }
});

// Batch summarize texts
app.post('/api/summarize-texts', express.json(), async (req, res) => {
  const startTime = Date.now();
  try {
    const { texts } = req.body;
    
    if (!Array.isArray(texts)) {
      return res.status(400).json({
        success: false,
        error: 'Texts array is required'
      });
    }
    
    console.log(`📝 [API] /api/summarize-texts - Summarizing ${texts.length} texts`);
    
    const textProcessor = new TextProcessor();
    const results = textProcessor.batchSummarize(texts);
    
    const duration = Date.now() - startTime;
    console.log(`✅ [API] /api/summarize-texts - Success in ${duration}ms`);
    
    res.json({
      success: true,
      summaries: results
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ [API] /api/summarize-texts - Failed after ${duration}ms:`, error.message);
    
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to summarize texts'
    });
  }
});

// Auto-discover fields from Jira tickets
app.get('/api/discover-fields', async (req, res) => {
  const startTime = Date.now();
  try {
    const jql = req.query.jql || 'filter = 165194'; // Use provided JQL or default
    const userToken = req.headers['x-jira-token'];
    
    if (!userToken) {
      return res.status(401).json({
        success: false,
        error: 'No authentication token provided. Please authenticate first.'
      });
    }
    
    console.log(`🔍 [API] /api/discover-fields - Discovering fields from JQL: ${jql}`);
    
    // First, fetch field metadata from Jira's field API to get names
    const jiraConfig = jiraClient.configManager.getJiraConfig();
    const baseUrl = jiraConfig.baseUrl.replace(/\/$/, '');
    
    let fieldMetadata = {};
    try {
      const axios = require('axios');
      const fieldsResponse = await axios.get(`${baseUrl}/rest/api/2/field`, {
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'Accept': 'application/json'
        }
      });
      
      // Create a map of field ID to field name
      if (fieldsResponse.data && Array.isArray(fieldsResponse.data)) {
        fieldsResponse.data.forEach(field => {
          fieldMetadata[field.id] = field.name;
          // Also map by key if different from id
          if (field.key && field.key !== field.id) {
            fieldMetadata[field.key] = field.name;
          }
        });
      }
      console.log(`📋 [API] /api/discover-fields - Loaded ${Object.keys(fieldMetadata).length} field names from Jira`);
      console.log(`📋 [API] Sample field mappings:`, Object.keys(fieldMetadata).slice(0, 5).map(k => `${k} -> ${fieldMetadata[k]}`));
    } catch (fieldError) {
      console.warn(`⚠️ [API] /api/discover-fields - Could not fetch field metadata: ${fieldError.message}`);
      console.warn(`⚠️ [API] Field error details:`, fieldError.response?.data || fieldError.message);
      // Continue without field names - we'll just use IDs
    }
    
    // Fetch just 1 ticket to discover all available fields
    const data = await jiraClient.fetchAllData(jql, userToken);
    
    if (!data.issues || data.issues.length === 0) {
      return res.json({
        success: false,
        error: 'No tickets found. Please check your JQL query.'
      });
    }
    
    // Extract all field names from the first ticket
    const sampleIssue = data.issues[0];
    const discoveredFields = [];
    const fieldMap = {}; // Map field ID to { id, name }
    
    // Add standard fields with their names
    const standardFieldNames = {
      'key': 'Key',
      'summary': 'Summary',
      'status': 'Status',
      'assignee': 'Assignee',
      'priority': 'Priority',
      'issuetype': 'Issue Type',
      'project': 'Project',
      'created': 'Created',
      'updated': 'Updated',
      'resolution': 'Resolution',
      'labels': 'Labels',
      'components': 'Components',
      'fixVersions': 'Fix Versions'
    };
    
    Object.keys(standardFieldNames).forEach(fieldId => {
      discoveredFields.push(fieldId);
      fieldMap[fieldId] = {
        id: fieldId,
        name: standardFieldNames[fieldId]
      };
    });
    
    if (sampleIssue.fields) {
      // Get all field names from the fields object
      Object.keys(sampleIssue.fields).forEach(fieldName => {
        if (!discoveredFields.includes(fieldName)) {
          discoveredFields.push(fieldName);
          // Get the field name from metadata, or use a formatted version of the ID
          const fieldNameFromMetadata = fieldMetadata[fieldName] || null;
          fieldMap[fieldName] = {
            id: fieldName,
            name: fieldNameFromMetadata || fieldName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
          };
        }
      });
    }
    
    // Sort fields (standard fields first, then custom fields)
    discoveredFields.sort((a, b) => {
      const aIsCustom = a.startsWith('customfield_');
      const bIsCustom = b.startsWith('customfield_');
      if (aIsCustom && !bIsCustom) return 1;
      if (!aIsCustom && bIsCustom) return -1;
      return a.localeCompare(b);
    });
    
    const duration = Date.now() - startTime;
    console.log(`✅ [API] /api/discover-fields - Discovered ${discoveredFields.length} fields in ${duration}ms`);
    
    res.json({
      success: true,
      fields: discoveredFields,
      fieldMap: fieldMap, // Include field name mapping
      count: discoveredFields.length,
      message: `Discovered ${discoveredFields.length} fields from your tickets`
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ [API] /api/discover-fields - Failed after ${duration}ms:`, error.message);
    
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to discover fields'
    });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

app.listen(port, () => {
  console.log(`🚀 NDB Weekly Status app running at http://localhost:${port}`);
  console.log(`📊 Jira integration ready`);
});
