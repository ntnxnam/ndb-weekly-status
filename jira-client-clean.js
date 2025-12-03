const axios = require('axios');
const ConfigManager = require('./config');
const MockJiraService = require('./mock-jira-service');

/**
 * Clean, robust JiraClient with proper error handling and validation
 */
class JiraClient {
  constructor() {
    this.configManager = new ConfigManager();
    this.jiraConfig = this.configManager.getJiraConfig();
    this.baseUrl = this.jiraConfig.baseUrl;
    this.pat = this.jiraConfig.apiToken;
    
    // Initialize mock service for fallback
    this.mockService = new MockJiraService();
    this.useMock = false;
    
    this.validateConfiguration();
  }

  validateConfiguration() {
    if (!this.baseUrl) {
      throw new Error('JIRA base URL is required');
    }
    
    if (!this.pat) {
      throw new Error('JIRA API token is required');
    }
    
    console.log('✅ JiraClient configuration validated');
  }

  async fetchAllData(jql = null) {
    try {
      const query = jql || this.jiraConfig.jql;
      console.log('🔄 [fetchAllData] Starting fetch with JQL:', query);
      console.log('🔄 [fetchAllData] Base URL:', this.baseUrl);
      console.log('🔄 [fetchAllData] PAT token present:', !!this.pat);
      
      let fields = this.configManager.config.allPossibleFields;
      if (!fields || fields.length === 0) {
        console.warn('⚠️ [fetchAllData] No fields configured, using defaults');
        const backendConfig = this.configManager.getBackendConfig();
        fields = backendConfig.allPossibleFields || ['key', 'summary', 'status'];
      }
      console.log(`📊 [fetchAllData] Using ${fields.length} fields for comprehensive data fetch`);
      
      const response = await this.makeJiraRequest(query, fields);
      
      // Check if response is HTML (SAML redirect)
      if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE html>')) {
        console.error('❌ [fetchAllData] Received HTML response - SAML authentication required');
        throw new Error('SAML authentication required. Please authenticate through your browser first.');
      }
      
      const issueCount = response.data.issues?.length || 0;
      console.log(`✅ [fetchAllData] Successfully fetched ${issueCount} issues with all fields`);
      console.log(`📊 [fetchAllData] Total available: ${response.data.total || 0} issues`);
      
      return response.data;
    } catch (error) {
      console.error('❌ [fetchAllData] Error details:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        url: error.config?.url,
        method: error.config?.method
      });
      
      const errorMessage = this.extractErrorMessage(error);
      console.error('❌ [fetchAllData] Extracted error message:', errorMessage);
      
      throw new Error(`Failed to fetch all Jira data: ${errorMessage}`);
    }
  }

  async refreshColumns(jql = null) {
    try {
      const query = jql || this.jiraConfig.jql;
      console.log('🔄 [refreshColumns] Starting refresh with JQL:', query);
      console.log('🔄 [refreshColumns] Base URL:', this.baseUrl);
      console.log('🔄 [refreshColumns] PAT token present:', !!this.pat);
      
      // Use only backend configuration - no user configuration
      let backendConfig;
      try {
        backendConfig = this.configManager.getBackendConfig();
        console.log('✅ [refreshColumns] Backend config loaded successfully');
      } catch (configError) {
        console.error('❌ [refreshColumns] Failed to load backend config:', configError.message);
        console.error('❌ [refreshColumns] Config error stack:', configError.stack);
        throw new Error(`Configuration error: ${configError.message}`);
      }
      
      let fields = backendConfig.defaultColumns?.map(col => col.jiraField) || ['key', 'summary', 'status'];
      console.log(`📊 [refreshColumns] Using ${fields.length} backend configured fields:`, fields);
      
      if (!fields || fields.length === 0) {
        console.warn('⚠️ [refreshColumns] No fields found, using defaults');
        fields = ['key', 'summary', 'status'];
      }
      
      const response = await this.makeJiraRequest(query, fields);
      
      // Check if response is HTML (SAML redirect)
      if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE html>')) {
        console.error('❌ [refreshColumns] Received HTML response - SAML authentication required');
        throw new Error('SAML authentication required. Please authenticate through your browser first.');
      }
      
      const issueCount = response.data.issues?.length || 0;
      console.log(`✅ [refreshColumns] Successfully refreshed ${issueCount} issues with backend configured columns`);
      console.log(`📊 [refreshColumns] Total available: ${response.data.total || 0} issues`);
      
      return response.data;
    } catch (error) {
      console.error('❌ [refreshColumns] Error details:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        url: error.config?.url,
        method: error.config?.method,
        stack: error.stack
      });
      
      const errorMessage = this.extractErrorMessage(error);
      console.error('❌ [refreshColumns] Extracted error message:', errorMessage);
      
      throw new Error(`Failed to refresh columns: ${errorMessage}`);
    }
  }

  async fetchMockData(jql = null, useConfiguredFields = false) {
    console.log('🔧 Using mock JIRA data');
    
    const query = jql || this.jiraConfig.jql;
    let fields;
    
    if (useConfiguredFields) {
      const tableConfig = this.configManager.getTableConfig();
      fields = tableConfig.allColumns?.map(col => col.jiraField) || ['key', 'summary', 'status'];
    } else {
      fields = this.configManager.config.allPossibleFields;
    }
    
    const response = await this.mockService.searchIssues(query, fields);
    return response.data;
  }

  async makeJiraRequest(jql, fields) {
    console.log('🔐 [makeJiraRequest] Attempting Jira request...');
    console.log('🔐 [makeJiraRequest] JQL:', jql);
    console.log('🔐 [makeJiraRequest] Fields count:', fields?.length || 0);
    console.log('🔐 [makeJiraRequest] Request URL:', `${this.baseUrl}/rest/api/3/search`);
    
    // Try different authentication methods
    const authMethods = [
      { name: 'Bearer Token', method: () => this.tryBearerTokenRequest(jql, fields) },
      { name: 'Basic Auth', method: () => this.tryBasicAuthRequest(jql, fields) },
      { name: 'OAuth 2.0', method: () => this.tryOAuthRequest(jql, fields) }
    ];

    const errors = [];
    for (const authMethod of authMethods) {
      try {
        console.log(`🔐 [makeJiraRequest] Trying ${authMethod.name}...`);
        const response = await authMethod.method();
        console.log(`✅ [makeJiraRequest] ${authMethod.name} authentication successful`);
        console.log(`✅ [makeJiraRequest] Response status: ${response.status}`);
        return response;
      } catch (error) {
        const errorDetails = {
          method: authMethod.name,
          message: error.message,
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data
        };
        errors.push(errorDetails);
        console.log(`⚠️ [makeJiraRequest] ${authMethod.name} failed:`, errorDetails);
        continue;
      }
    }

    console.error('❌ [makeJiraRequest] All authentication methods failed');
    console.error('❌ [makeJiraRequest] Error summary:', errors);
    throw new Error(`All authentication methods failed. Last error: ${errors[errors.length - 1]?.message || 'Unknown error'}`);
  }

  async tryOAuthRequest(jql, fields) {
    // OAuth 2.0 implementation would go here
    // This requires OAuth client credentials from JIRA admin
    throw new Error('OAuth not configured');
  }

  async tryBasicAuthRequest(jql, fields) {
    const username = this.jiraConfig.username || 'namratha.singh';
    const auth = Buffer.from(`${username}:${this.pat.trim().replace(/\r?\n/g, '')}`).toString('base64');
    
    return await axios.post(
      `${this.baseUrl}/rest/api/3/search`,
      {
        jql: jql,
        maxResults: 100,
        fields: fields
      },
      {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Basic ${auth}`
        }
      }
    );
  }

  async tryBearerTokenRequest(jql, fields) {
    try {
      const cleanToken = this.pat.trim().replace(/\r?\n/g, '');
      console.log('🔐 [tryBearerTokenRequest] Token length:', cleanToken.length);
      console.log('🔐 [tryBearerTokenRequest] Token starts with:', cleanToken.substring(0, 10) + '...');
      
      const response = await axios.post(
        `${this.baseUrl}/rest/api/3/search`,
        {
          jql: jql,
          maxResults: 100,
          fields: fields
        },
        {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${cleanToken}`
          },
          timeout: 30000 // 30 second timeout
        }
      );
      
      console.log('✅ [tryBearerTokenRequest] Request successful');
      return response;
    } catch (error) {
      console.error('❌ [tryBearerTokenRequest] Request failed:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      });
      throw error;
    }
  }

  async getIssueDetails(issueKey) {
    try {
      if (!issueKey) {
        throw new Error('Issue key is required');
      }

      const response = await axios.get(
        `${this.baseUrl}/rest/api/3/issue/${issueKey}`,
        {
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${this.pat.trim().replace(/\r?\n/g, '')}`
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error(`❌ Error fetching issue ${issueKey}:`, error.message);
      throw new Error(`Failed to fetch issue details: ${this.extractErrorMessage(error)}`);
    }
  }

  formatIssues(issues, useAllColumns = false) {
    if (!Array.isArray(issues)) {
      console.warn('⚠️ formatIssues: issues is not an array', issues);
      return [];
    }
    
    // Use backend configuration for column ordering
    const backendConfig = this.configManager.getBackendConfig();
    const columns = backendConfig.defaultColumns || [];
    
    return issues.map(issue => {
      const formattedIssue = {
        url: `${this.baseUrl}/browse/${issue.key}`,
        key: issue.key || ''
      };
      
      // Process columns in the order defined in backend configuration
      columns.forEach(column => {
        if (column && column.jiraField && column.key) {
          const fieldValue = this.getFieldValue(issue, column.jiraField);
          formattedIssue[column.key] = this.formatFieldValue(fieldValue, column.type);
        }
      });
      
      return formattedIssue;
    });
  }

  getFieldValue(issue, jiraField) {
    if (!issue || !jiraField) {
      return null;
    }

    // Handle special fields that are at the root level
    if (jiraField === 'key') {
      return issue.key;
    }

    if (!issue.fields) {
      return null;
    }

    const fieldParts = jiraField.split('.');
    let value = issue.fields;
    
    for (const part of fieldParts) {
      if (value && typeof value === 'object') {
        value = value[part];
      } else {
        return null;
      }
    }
    
    return value;
  }

  formatFieldValue(value, type) {
    if (value === null || value === undefined) {
      return type === 'badge' ? 'Unknown' : '';
    }
    
    switch (type) {
      case 'link':
        return value;
      case 'badge':
        return typeof value === 'object' ? (value.name || value.displayName || value.toString()) : value.toString();
      case 'date':
        return new Date(value).toLocaleDateString();
      case 'datetime':
        return new Date(value).toLocaleString();
      case 'text':
      default:
        if (typeof value === 'object') {
          return value.displayName || value.name || value.toString();
        }
        return value.toString();
    }
  }

  getTableConfig() {
    return this.configManager.getTableConfig();
  }

  saveUserConfig(userColumns) {
    if (!Array.isArray(userColumns)) {
      console.error('❌ userColumns must be an array');
      return false;
    }
    
    const success = this.configManager.saveUserConfig(userColumns);
    if (success) {
      console.log('✅ User configuration saved successfully');
    } else {
      console.error('❌ Failed to save user configuration');
    }
    return success;
  }

  getBackendConfig() {
    return {
      defaultColumns: this.configManager.config.defaultColumns,
      allPossibleFields: this.configManager.config.allPossibleFields
    };
  }

  extractErrorMessage(error) {
    // Jira API error messages
    if (error.response?.data?.errorMessages?.length > 0) {
      const messages = error.response.data.errorMessages.join('; ');
      console.log('📋 [extractErrorMessage] Jira error messages:', messages);
      return messages;
    }
    
    // Generic error message
    if (error.response?.data?.message) {
      console.log('📋 [extractErrorMessage] Response message:', error.response.data.message);
      return error.response.data.message;
    }
    
    // HTTP status code errors
    if (error.response?.status) {
      const statusMessages = {
        401: 'Authentication failed. Please check your PAT token in jira-key-private.txt',
        403: 'Access forbidden. Please check your Jira permissions.',
        404: 'Resource not found. Please check your Jira URL and filter ID.',
        500: 'Jira server error. Please try again later.',
        503: 'Jira service unavailable. Please try again later.'
      };
      const message = statusMessages[error.response.status] || `HTTP ${error.response.status}: ${error.response.statusText}`;
      console.log('📋 [extractErrorMessage] HTTP status error:', message);
      return message;
    }
    
    // Network errors
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      const message = `Cannot connect to ${this.baseUrl}. Please check your network connection and VPN status.`;
      console.log('📋 [extractErrorMessage] Network error:', message);
      return message;
    }
    
    // Timeout errors
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      const message = 'Request timed out. Please check your network connection.';
      console.log('📋 [extractErrorMessage] Timeout error:', message);
      return message;
    }
    
    // Default error message
    const message = error.message || 'Unknown error occurred';
    console.log('📋 [extractErrorMessage] Default error:', message);
    return message;
  }

  // Legacy method for backward compatibility
  async searchIssues(jql = null) {
    return await this.refreshColumns(jql);
  }
}

module.exports = JiraClient;
