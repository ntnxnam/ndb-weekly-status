const axios = require('axios');
const fs = require('fs');
const path = require('path');

class JiraClient {
  constructor() {
    this.config = this.loadConfig();
    this.backendConfig = this.loadBackendConfig();
    this.userConfig = this.loadUserConfig();
    this.baseUrl = this.config.jira.baseUrl;
    this.pat = this.config.jira.apiToken;
  }

  loadConfig() {
    // Try to load from environment variables first
    if (process.env.JIRA_BASE_URL) {
      return {
        jira: {
          baseUrl: process.env.JIRA_BASE_URL,
          username: process.env.JIRA_USERNAME,
          apiToken: process.env.JIRA_API_TOKEN,
          jql: process.env.JIRA_JQL
        },
        server: {
          port: process.env.PORT || 3000
        }
      };
    }

    // Try to load from config.json
    try {
      const configPath = path.join(__dirname, 'config.json');
      const configData = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(configData);
      
      // Try to load API token from private key file
      try {
        const keyPath = path.join(__dirname, 'jira-key-private.txt');
        const apiToken = fs.readFileSync(keyPath, 'utf8').trim();
        
        // Replace placeholder or use the token from file
        if (apiToken && !apiToken.includes('YOUR_JIRA_API_TOKEN_HERE')) {
          config.jira.apiToken = apiToken;
        }
      } catch (keyError) {
        console.log('No jira-key-private.txt found, using token from config.json');
      }
      
      return config;
    } catch (error) {
      console.error('Error loading config:', error.message);
      throw new Error('Configuration not found. Please set up config.json or environment variables.');
    }
  }

  loadBackendConfig() {
    try {
      const backendConfigPath = path.join(__dirname, 'backend-default-config.json');
      const backendConfigData = fs.readFileSync(backendConfigPath, 'utf8');
      return JSON.parse(backendConfigData);
    } catch (error) {
      console.log('No backend-default-config.json found, using minimal default');
      return {
        defaultColumns: [
          { key: 'key', label: 'Key', type: 'link', jiraField: 'key', isDefault: true, isEditable: false },
          { key: 'summary', label: 'Summary', type: 'text', jiraField: 'summary', isDefault: true, isEditable: false }
        ],
        allPossibleFields: ['key', 'summary', 'status', 'assignee', 'priority', 'issuetype', 'project']
      };
    }
  }

  loadUserConfig() {
    try {
      const userConfigPath = path.join(__dirname, 'user-column-config.json');
      const userConfigData = fs.readFileSync(userConfigPath, 'utf8');
      return JSON.parse(userConfigData);
    } catch (error) {
      console.log('No user-column-config.json found, using empty user config');
      return { userColumns: [] };
    }
  }

  async fetchAllData(jql = null) {
    try {
      const query = jql || this.config.jira.jql;
      console.log('Fetching ALL data with all possible fields...');
      
      // Ensure allPossibleFields is available
      const fields = this.backendConfig?.allPossibleFields || [
        'key', 'summary', 'status', 'assignee', 'priority', 'issuetype', 'project', 'created', 'updated'
      ];
      
      console.log('Using fields:', fields);
      
      const response = await axios.post(
        `${this.baseUrl}/rest/api/3/search`,
        {
          jql: query,
          maxResults: 100,
          fields: fields
        },
        {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.pat.trim().replace(/\r?\n/g, '')}`
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error fetching all Jira data:', error.response?.data || error.message);
      throw new Error(`Failed to fetch all Jira data: ${error.response?.data?.errorMessages?.[0] || error.message}`);
    }
  }

  async refreshColumns(jql = null) {
    try {
      const query = jql || this.config.jira.jql;
      console.log('Refreshing with configured columns only...');
      
      // Get all columns (default + user configured)
      const allColumns = this.getAllColumns();
      const fields = allColumns?.map(col => col.jiraField) || ['key', 'summary', 'status'];
      console.log('Fetching fields:', fields);
      
      const response = await axios.post(
        `${this.baseUrl}/rest/api/3/search`,
        {
          jql: query,
          maxResults: 100,
          fields: fields
        },
        {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.pat.trim().replace(/\r?\n/g, '')}`
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error refreshing columns:', error.response?.data || error.message);
      throw new Error(`Failed to refresh columns: ${error.response?.data?.errorMessages?.[0] || error.message}`);
    }
  }

  // Legacy method for backward compatibility
  async searchIssues(jql = null) {
    return await this.refreshColumns(jql);
  }

  async getIssueDetails(issueKey) {
    try {
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
      console.error(`Error fetching issue ${issueKey}:`, error.response?.data || error.message);
      throw new Error(`Failed to fetch issue details: ${error.message}`);
    }
  }

  getAllColumns() {
    // Combine default columns (always first) with user columns
    const defaultColumns = this.backendConfig?.defaultColumns || [];
    const userColumns = this.userConfig?.userColumns || [];
    return [...defaultColumns, ...userColumns];
  }

  formatIssues(issues, useAllColumns = false) {
    if (!Array.isArray(issues)) {
      console.warn('formatIssues: issues is not an array', issues);
      return [];
    }
    
    return issues.map(issue => {
      const formattedIssue = {
        url: `${this.baseUrl}/browse/${issue.key}`
      };
      
      // Get columns to use
      const columns = this.getAllColumns();
      
      // Format each field based on column configuration
      if (Array.isArray(columns)) {
        columns.forEach(column => {
          if (column && column.jiraField && column.key) {
            const fieldValue = this.getFieldValue(issue, column.jiraField);
            formattedIssue[column.key] = this.formatFieldValue(fieldValue, column.type);
          }
        });
      }
      
      return formattedIssue;
    });
  }

  getFieldValue(issue, jiraField) {
    // Handle nested field access (e.g., status.name, assignee.displayName)
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
        return typeof value === 'object' ? value.name || value.toString() : value.toString();
      case 'date':
        return new Date(value).toLocaleDateString();
      case 'datetime':
        return new Date(value).toLocaleString();
      case 'text':
      default:
        if (typeof value === 'object') {
          return value.name || value.toString();
        }
        return value.toString();
    }
  }

  getTableConfig() {
    return {
      defaultColumns: this.backendConfig.defaultColumns,
      userColumns: this.userConfig.userColumns,
      allColumns: this.getAllColumns(),
      allPossibleFields: this.backendConfig.allPossibleFields
    };
  }

  saveUserConfig(userColumns) {
    try {
      const userConfigPath = path.join(__dirname, 'user-column-config.json');
      const configData = JSON.stringify({ userColumns }, null, 2);
      fs.writeFileSync(userConfigPath, configData);
      
      // Reload user config
      this.userConfig = this.loadUserConfig();
      console.log('User configuration saved successfully');
      return true;
    } catch (error) {
      console.error('Error saving user configuration:', error.message);
      return false;
    }
  }

  getBackendConfig() {
    return this.backendConfig;
  }
}

module.exports = JiraClient;
