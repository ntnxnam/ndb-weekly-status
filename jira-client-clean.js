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

  async fetchAllData(jql = null, userToken = null) {
    try {
      const query = jql || this.jiraConfig.jql;
      const tokenToUse = userToken || this.pat;
      console.log('🔄 [fetchAllData] Starting fetch with JQL:', query);
      console.log('🔄 [fetchAllData] Base URL:', this.baseUrl);
      console.log('🔄 [fetchAllData] Using token:', userToken ? 'User-provided' : 'Config');
      
      let fields = this.configManager.config.allPossibleFields;
      if (!fields || fields.length === 0) {
        console.warn('⚠️ [fetchAllData] No fields configured, using defaults');
        const backendConfig = this.configManager.getBackendConfig();
        fields = backendConfig.allPossibleFields || ['key', 'summary', 'status'];
      }
      
      // Normalize fields - ensure we request base fields (e.g., 'status' not 'status.name')
      // Jira API needs base field names, not nested paths
      fields = fields.map(field => {
        // Extract base field name (e.g., 'status.name' -> 'status', 'assignee.displayName' -> 'assignee')
        const baseField = field.split('.')[0];
        return baseField;
      });
      
      // Remove duplicates
      fields = [...new Set(fields)];
      
      console.log(`📊 [fetchAllData] Using ${fields.length} fields for comprehensive data fetch`);
      
      const response = await this.makeJiraRequest(query, fields, tokenToUse);
      
      // Check if response is HTML (redirect to login)
      if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE html>')) {
        console.error('❌ [fetchAllData] Received HTML response - Bearer token not accepted for this endpoint');
        throw new Error('Bearer token authentication failed. The token works for PAT management but not for search API. Please check if your Jira instance requires a different authentication method for API v3 endpoints.');
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

  async refreshColumns(jql = null, userToken = null) {
    try {
      const query = jql || this.jiraConfig.jql;
      const tokenToUse = userToken || this.pat;
      console.log('🔄 [refreshColumns] Starting refresh with JQL:', query);
      console.log('🔄 [refreshColumns] Base URL:', this.baseUrl);
      console.log('🔄 [refreshColumns] Using token:', userToken ? 'User-provided' : 'Config');
      
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
      
      // Normalize fields - ensure we request base fields (e.g., 'status' not 'status.name')
      fields = fields.map(field => {
        const baseField = field.split('.')[0];
        return baseField;
      });
      
      // Remove duplicates
      fields = [...new Set(fields)];
      console.log(`📊 [refreshColumns] Using ${fields.length} backend configured fields:`, fields);
      
      if (!fields || fields.length === 0) {
        console.warn('⚠️ [refreshColumns] No fields found, using defaults');
        fields = ['key', 'summary', 'status'];
      }
      
      const response = await this.makeJiraRequest(query, fields, tokenToUse);
      
      // Check if response is HTML (redirect to login)
      if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE html>')) {
        console.error('❌ [refreshColumns] Received HTML response - Bearer token not accepted for this endpoint');
        throw new Error('Bearer token authentication failed. The token works for PAT management but not for search API. Please check if your Jira instance requires a different authentication method for API v3 endpoints.');
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

  async makeJiraRequest(jql, fields, token = null) {
    const tokenToUse = token || this.pat;
    const cleanBaseUrl = this.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    const searchUrl = `${cleanBaseUrl}/rest/api/2/search`;
    
    console.log('🔐 [makeJiraRequest] Attempting Jira request...');
    console.log('🔐 [makeJiraRequest] JQL:', jql);
    console.log('🔐 [makeJiraRequest] Fields count:', fields?.length || 0);
    console.log('🔐 [makeJiraRequest] Request URL:', searchUrl);
    console.log('🔐 [makeJiraRequest] Using token:', token ? 'User-provided' : 'Config');
    
    // Try different authentication methods - Bearer Token first (most reliable for API v2)
    const authMethods = [
      { name: 'Bearer Token (API v2)', method: () => this.tryBearerTokenRequest(jql, fields, tokenToUse) }
    ];
    
    // Only try other methods if Bearer token is not provided
    if (!tokenToUse) {
      authMethods.push(
        { name: 'PAT Token Header', method: () => this.tryPATTokenRequest(jql, fields, tokenToUse) },
        { name: 'Basic Auth', method: () => this.tryBasicAuthRequest(jql, fields) }
      );
    }

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

  async tryPATTokenRequest(jql, fields) {
    const cleanToken = this.pat.trim().replace(/\r?\n/g, '');
    console.log('🔐 [tryPATTokenRequest] Trying PAT token with alternative header formats...');
    
    // Try different header formats for PAT token
    const headerFormats = [
      { name: 'X-API-Token', header: `X-API-Token: ${cleanToken}` },
      { name: 'X-Auth-Token', header: `X-Auth-Token: ${cleanToken}` },
      { name: 'Authorization Token', header: `Authorization: Token ${cleanToken}` },
      { name: 'Authorization PAT', header: `Authorization: PAT ${cleanToken}` }
    ];
    
    for (const format of headerFormats) {
      try {
        console.log(`🔐 [tryPATTokenRequest] Trying ${format.name}...`);
        const headers = {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        };
        
        // Parse the header format
        const [headerName, headerValue] = format.header.split(': ');
        headers[headerName] = headerValue;
        
        const cleanBaseUrl = this.baseUrl.replace(/\/$/, '');
        const response = await axios.post(
          `${cleanBaseUrl}/rest/api/2/search`,
          {
            jql: jql,
            maxResults: 100,
            fields: fields
          },
          {
            headers: headers,
            validateStatus: function (status) {
              return status >= 200 && status < 600;
            },
            timeout: 30000
          }
        );
        
        if (response.status === 200) {
          console.log(`✅ [tryPATTokenRequest] Success with ${format.name}`);
          return response;
        }
        
        // Check if response is HTML redirect
        if (response.status === 302 || (typeof response.data === 'string' && response.data.includes('<!DOCTYPE'))) {
          console.log(`⚠️ [tryPATTokenRequest] ${format.name} resulted in redirect, trying next...`);
          continue;
        }
      } catch (error) {
        console.log(`⚠️ [tryPATTokenRequest] ${format.name} failed: ${error.message}`);
        if (format === headerFormats[headerFormats.length - 1]) {
          throw error;
        }
        continue;
      }
    }
    
    throw new Error('All PAT token header formats failed');
  }

  async tryOAuthRequest(jql, fields) {
    // OAuth 2.0 implementation would go here
    // This requires OAuth client credentials from JIRA admin
    throw new Error('OAuth not configured');
  }

  async tryBasicAuthRequest(jql, fields) {
    const cleanToken = this.pat.trim().replace(/\r?\n/g, '');
    const username = this.jiraConfig.username || 'namratha.singh';
    
    // Try different username formats
    const usernameFormats = [
      username,  // Just username
      `${username}@nutanix.com`,  // With domain
      username.includes('@') ? username : `${username}@nutanix.com`  // Smart format
    ];
    
    for (const userFormat of usernameFormats) {
      try {
        console.log(`🔐 [tryBasicAuthRequest] Trying username format: ${userFormat}`);
        const auth = Buffer.from(`${userFormat}:${cleanToken}`).toString('base64');
        
        const cleanBaseUrl = this.baseUrl.replace(/\/$/, '');
        const response = await axios.post(
          `${cleanBaseUrl}/rest/api/2/search`,
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
            },
            validateStatus: function (status) {
              return status >= 200 && status < 600;
            }
          }
        );
        
        if (response.status === 200) {
          console.log(`✅ [tryBasicAuthRequest] Success with username format: ${userFormat}`);
          return response;
        }
        
        if (response.status === 403 && response.data?.message?.includes('Basic Authentication has been disabled')) {
          console.log(`⚠️ [tryBasicAuthRequest] Basic Auth disabled, trying next format...`);
          continue;
        }
        
        // If we get here, it's a different error
        throw new Error(`HTTP ${response.status}: ${response.data?.message || response.statusText}`);
      } catch (error) {
        if (error.response?.status === 403 && error.response?.data?.message?.includes('Basic Authentication has been disabled')) {
          console.log(`⚠️ [tryBasicAuthRequest] Basic Auth disabled for ${userFormat}, trying next...`);
          continue;
        }
        // If it's the last format, throw the error
        if (userFormat === usernameFormats[usernameFormats.length - 1]) {
          throw error;
        }
      }
    }
    
    throw new Error('Basic Authentication has been disabled on this instance');
  }

  async tryBearerTokenRequest(jql, fields, token = null) {
    try {
      const tokenToUse = token || this.pat;
      const cleanToken = tokenToUse.trim().replace(/\r?\n/g, '');
      const cleanBaseUrl = this.baseUrl.replace(/\/$/, ''); // Remove trailing slash
      const searchUrl = `${cleanBaseUrl}/rest/api/2/search`;
      
      console.log('🔐 [tryBearerTokenRequest] Token length:', cleanToken.length);
      console.log('🔐 [tryBearerTokenRequest] Token starts with:', cleanToken.substring(0, 10) + '...');
      console.log('🔐 [tryBearerTokenRequest] Request URL:', searchUrl);
      
      const response = await axios.post(
        searchUrl,
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
          timeout: 30000, // 30 second timeout
          validateStatus: function (status) {
            // Don't throw error for any status, we'll handle it
            return status >= 200 && status < 600;
          }
        }
      );
      
      // Check if response is HTML (SAML redirect)
      const contentType = response.headers['content-type'] || '';
      const responseData = response.data;
      
      console.log('📋 [tryBearerTokenRequest] Response status:', response.status);
      console.log('📋 [tryBearerTokenRequest] Content-Type:', contentType);
      console.log('📋 [tryBearerTokenRequest] Response data type:', typeof responseData);
      
      if (response.status !== 200) {
        console.error('❌ [tryBearerTokenRequest] Non-200 status:', response.status);
        
        // Handle specific error cases
        if (response.status === 401 || response.status === 403) {
          throw new Error('Authentication failed. Please check your Bearer token (PAT) is valid and has not expired.');
        }
        
        if (response.status === 302) {
          throw new Error('Authentication redirect detected. Please verify your Bearer token is correct.');
        }
        
        if (typeof responseData === 'string' && (responseData.includes('<!DOCTYPE') || responseData.includes('<html'))) {
          console.error('❌ [tryBearerTokenRequest] Received HTML response');
          throw new Error('Received HTML instead of JSON. Please check your Bearer token is valid.');
        }
        
        // Check for Jira error messages
        if (responseData && typeof responseData === 'object' && responseData.errorMessages) {
          throw new Error(`Jira API error: ${responseData.errorMessages.join('; ')}`);
        }
        
        throw new Error(`HTTP ${response.status}: ${response.statusText || 'Unknown error'}`);
      }
      
      if (contentType.includes('text/html') || (typeof responseData === 'string' && responseData.includes('<!DOCTYPE'))) {
        console.error('❌ [tryBearerTokenRequest] Response is HTML, not JSON');
        throw new Error('Received HTML response instead of JSON. Please verify your Bearer token.');
      }
      
      if (!responseData || typeof responseData !== 'object') {
        console.error('❌ [tryBearerTokenRequest] Invalid response data type:', typeof responseData);
        throw new Error('Invalid response format from Jira API. Expected JSON but got: ' + typeof responseData);
      }
      
      // Validate response structure
      if (!responseData.issues && !Array.isArray(responseData.issues)) {
        console.warn('⚠️ [tryBearerTokenRequest] Response missing issues array');
      }
      
      console.log('✅ [tryBearerTokenRequest] Request successful');
      return response;
    } catch (error) {
      const errorData = error.response?.data;
      let dataPreview = 'N/A';
      if (errorData) {
        if (typeof errorData === 'string') {
          dataPreview = errorData.substring(0, 200);
        } else {
          try {
            dataPreview = JSON.stringify(errorData).substring(0, 200);
          } catch (e) {
            dataPreview = String(errorData).substring(0, 200);
          }
        }
      }
      
      console.error('❌ [tryBearerTokenRequest] Request failed:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        contentType: error.response?.headers?.['content-type'],
        dataPreview: dataPreview
      });
      throw error;
    }
  }

  async getIssueDetails(issueKey) {
    try {
      if (!issueKey) {
        throw new Error('Issue key is required');
      }

      const cleanBaseUrl = this.baseUrl.replace(/\/$/, '');
      const response = await axios.get(
        `${cleanBaseUrl}/rest/api/2/issue/${issueKey}`,
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
    
    const cleanBaseUrl = this.baseUrl.replace(/\/$/, '');
    return issues.map(issue => {
      const formattedIssue = {
        url: `${cleanBaseUrl}/browse/${issue.key}`,
        key: issue.key || ''
      };
      
      // Process columns in the order defined in backend configuration
      columns.forEach(column => {
        if (column && column.jiraField && column.key) {
          const fieldValue = this.getFieldValue(issue, column.jiraField);
          
          // Special handling for customfield_23073 - store raw value for summarization
          if (column.jiraField === 'customfield_23073' || column.key === 'customfield_23073') {
            // Store the raw value - will be summarized on the frontend
            formattedIssue[column.key] = fieldValue;
            formattedIssue[column.key + '_raw'] = fieldValue; // Keep raw for reference
          }
          // Special handling for labelCheck type
          else if (column.type === 'labelCheck') {
            // If labelToCheck is dynamic (based on fixVersions), extract it
            let labelToCheck = column.labelToCheck;
            if (column.labelPattern && column.labelPattern === 'fixVersion') {
              // Get fixVersions and construct label dynamically
              const fixVersions = this.getFieldValue(issue, 'fixVersions');
              labelToCheck = this.extractLabelFromFixVersions(fixVersions);
            }
            
            if (labelToCheck) {
              const labels = this.getFieldValue(issue, 'labels');
              formattedIssue[column.key] = this.checkLabel(labels, labelToCheck);
            } else {
              formattedIssue[column.key] = 'No';
            }
          } else {
            formattedIssue[column.key] = this.formatFieldValue(fieldValue, column.type);
          }
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
        // If we can't find the nested field, try to get the parent field
        // For example, if status.name doesn't exist, try just status
        if (fieldParts.length > 1 && part === fieldParts[fieldParts.length - 1]) {
          const parentField = fieldParts[0];
          const parentValue = issue.fields[parentField];
          if (parentValue && typeof parentValue === 'object') {
            // Try common property names
            return parentValue.name || parentValue.displayName || parentValue.value || null;
          }
        }
        return null;
      }
    }
    
    // Special handling for URL custom fields (CG/PG Confluence links)
    // Jira URL fields can be stored in different formats:
    // 1. Object with 'url' property: { url: "https://..." }
    // 2. Object with 'value' property: { value: "https://..." }
    // 3. Plain string URL: "https://..."
    // 4. Rich text with HTML links: "<a href='https://...'>Link</a>"
    if (value && typeof value === 'object') {
      // Check if it's a URL field object
      if (value.url) {
        return value.url;
      }
      if (value.value && typeof value.value === 'string' && value.value.startsWith('http')) {
        return value.value;
      }
      // Check for rich text content that might contain URLs
      if (value.content) {
        // Try to extract URL from content array (Atlassian Document Format)
        const url = this.extractUrlFromContent(value.content);
        if (url) return url;
      }
      // Check if the object itself has a string representation that's a URL
      if (value.toString && typeof value.toString === 'function') {
        const strValue = value.toString();
        if (strValue.startsWith('http')) {
          return strValue;
        }
      }
    }
    
    // If value is a string, check if it contains a URL (for rich text fields)
    if (typeof value === 'string') {
      // Check if it's already a URL
      if (value.startsWith('http')) {
        return value;
      }
      // Try to extract URL from HTML/rich text
      const urlMatch = value.match(/https?:\/\/[^\s<>"']+/i);
      if (urlMatch) {
        return urlMatch[0];
      }
    }
    
    return value;
  }

  // Extract URL from Atlassian Document Format (ADF) content
  extractUrlFromContent(content) {
    if (!content || !Array.isArray(content)) {
      return null;
    }
    
    for (const item of content) {
      if (item.type === 'paragraph' || item.type === 'text') {
        if (item.content && Array.isArray(item.content)) {
          for (const subItem of item.content) {
            if (subItem.type === 'text' && subItem.marks) {
              for (const mark of subItem.marks) {
                if (mark.type === 'link' && mark.attrs && mark.attrs.href) {
                  return mark.attrs.href;
                }
              }
            }
            if (subItem.type === 'inlineCard' && subItem.attrs && subItem.attrs.url) {
              return subItem.attrs.url;
            }
          }
        }
        if (item.text && item.marks) {
          for (const mark of item.marks) {
            if (mark.type === 'link' && mark.attrs && mark.attrs.href) {
              return mark.attrs.href;
            }
          }
        }
      }
      if (item.type === 'inlineCard' && item.attrs && item.attrs.url) {
        return item.attrs.url;
      }
      // Recursively search nested content
      if (item.content) {
        const nestedUrl = this.extractUrlFromContent(item.content);
        if (nestedUrl) return nestedUrl;
      }
    }
    
    return null;
  }

  formatFieldValue(value, type) {
    if (value === null || value === undefined) {
      return type === 'badge' ? 'Unknown' : '';
    }
    
    switch (type) {
      case 'link':
        return value;
      case 'confluence':
        // Handle different URL formats from Jira
        if (typeof value === 'string') {
          // If it's already a URL string, return it
          if (value.startsWith('http')) {
            return value;
          }
          // Try to extract URL from HTML/rich text
          const urlMatch = value.match(/https?:\/\/[^\s<>"']+/i);
          if (urlMatch) {
            return urlMatch[0];
          }
        }
        if (typeof value === 'object') {
          // Check common URL field properties
          if (value.url) return value.url;
          if (value.value && typeof value.value === 'string' && value.value.startsWith('http')) {
            return value.value;
          }
          if (value.href) return value.href;
          // Try to extract from ADF content
          if (value.content) {
            const extractedUrl = this.extractUrlFromContent(value.content);
            if (extractedUrl) return extractedUrl;
          }
        }
        // Fallback: try to convert to string and extract URL
        const strValue = value ? value.toString() : '';
        const fallbackMatch = strValue.match(/https?:\/\/[^\s<>"']+/i);
        return fallbackMatch ? fallbackMatch[0] : strValue;
      case 'badge':
        return typeof value === 'object' ? (value.name || value.displayName || value.toString()) : value.toString();
      case 'date':
        return new Date(value).toLocaleDateString();
      case 'datetime':
        return new Date(value).toLocaleString();
      case 'text':
      default:
        // Handle arrays (like fixVersions)
        if (Array.isArray(value)) {
          if (value.length === 0) return '';
          // If array of objects, extract names
          if (typeof value[0] === 'object') {
            return value.map(item => item.name || item.toString()).join(', ');
          }
          return value.join(', ');
        }
        if (typeof value === 'object') {
          return value.displayName || value.name || value.toString();
        }
        return value.toString();
    }
  }

  // Extract label pattern from fixVersions (e.g., "NDB-2.11" -> "ndb-2.11-wishlist")
  extractLabelFromFixVersions(fixVersions) {
    if (!fixVersions) return null;
    
    // Handle array of fix version objects
    const versions = Array.isArray(fixVersions) ? fixVersions : [fixVersions];
    
    for (const version of versions) {
      const versionName = typeof version === 'string' ? version : (version.name || version.toString());
      
      // Match patterns like "NDB-2.11", "2.11", "NDB-2.10", etc.
      const match = versionName.match(/(?:NDB-)?(\d+\.\d+)/i);
      if (match) {
        const versionNum = match[1]; // e.g., "2.11"
        return `ndb-${versionNum}-wishlist`;
      }
    }
    
    return null;
  }

  // Check if a specific label exists in the labels array
  checkLabel(labels, labelToCheck) {
    if (!labels || !labelToCheck) return 'No';
    if (Array.isArray(labels)) {
      return labels.some(label => {
        const labelStr = typeof label === 'string' ? label : (label.name || label.toString());
        return labelStr.toLowerCase() === labelToCheck.toLowerCase();
      }) ? 'Yes' : 'No';
    }
    // If labels is a string, check directly
    if (typeof labels === 'string') {
      return labels.toLowerCase().includes(labelToCheck.toLowerCase()) ? 'Yes' : 'No';
    }
    return 'No';
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
