/**
 * Centralized Configuration Manager
 * Single source of truth for all application configuration
 */

const fs = require('fs');
const path = require('path');

class ConfigManager {
  constructor() {
    this.config = this.loadConfiguration();
  }

  loadConfiguration() {
    // Priority order: Environment variables > config.json > backend-default-config.json > defaults
    
    // 1. Try environment variables first
    if (process.env.JIRA_BASE_URL) {
      return {
        jira: {
          baseUrl: process.env.JIRA_BASE_URL,
          username: process.env.JIRA_USERNAME,
          apiToken: process.env.JIRA_API_TOKEN,
          jql: process.env.JIRA_JQL || 'filter = "NDB-StatusUpdates"'
        },
        server: {
          port: parseInt(process.env.PORT) || 8080
        },
        defaultColumns: this.getDefaultColumns(),
        allPossibleFields: this.getAllPossibleFields()
      };
    }

    // 2. Try config.json
    try {
      const configPath = path.join(__dirname, 'config.json');
      const configData = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(configData);
      
      // Load API token from environment variable (.env file)
      // Priority: Environment variable > config.json
      if (process.env.JIRA_API_TOKEN) {
        config.jira.apiToken = process.env.JIRA_API_TOKEN.trim();
      } else if (!config.jira.apiToken || config.jira.apiToken.includes('YOUR_JIRA_API_TOKEN_HERE')) {
        // Token not in .env and not in config.json, log warning
        console.log('⚠️ JIRA_API_TOKEN not found in .env file. Please add it to your .env file.');
      }
      
      return {
        ...config,
        defaultColumns: this.getDefaultColumns(),
        allPossibleFields: this.getAllPossibleFields()
      };
    } catch (error) {
      console.log('No config.json found, using backend default');
    }

    // 3. Try backend-default-config.json
    try {
      const backendConfigPath = path.join(__dirname, 'backend-default-config.json');
      const backendConfigData = fs.readFileSync(backendConfigPath, 'utf8');
      return JSON.parse(backendConfigData);
    } catch (error) {
      console.log('No backend-default-config.json found, using minimal defaults');
    }

    // 4. Fallback to minimal defaults
    return {
      jira: {
        baseUrl: 'https://jira.nutanix.com/',
        username: '',
        apiToken: '',
        jql: 'filter = "NDB-StatusUpdates"'
      },
      server: {
        port: 8080
      },
      defaultColumns: this.getDefaultColumns(),
      allPossibleFields: this.getAllPossibleFields()
    };
  }

  getDefaultColumns() {
    return [
      {
        key: 'key',
        label: 'Key',
        type: 'link',
        jiraField: 'key',
        isDefault: true,
        isEditable: false
      },
      {
        key: 'summary',
        label: 'Summary',
        type: 'text',
        jiraField: 'summary',
        isDefault: true,
        isEditable: false
      },
      {
        key: 'status',
        label: 'Status',
        type: 'badge',
        jiraField: 'status.name',
        isDefault: true,
        isEditable: false
      },
      {
        key: 'fixVersions',
        label: 'Fix Version',
        type: 'text',
        jiraField: 'fixVersions',
        isDefault: true,
        isEditable: false
      },
      {
        key: 'ndb_2_11_wishlist',
        label: 'Wishlist',
        type: 'labelCheck',
        jiraField: 'labels',
        labelPattern: 'fixVersion',
        isDefault: true,
        isEditable: false
      },
      {
        key: 'cg',
        label: 'CG Completion',
        type: 'confluence',
        jiraField: 'customfield_10000', // TODO: Update with actual CG custom field ID
        isDefault: true,
        isEditable: false
      },
      {
        key: 'pg',
        label: 'PG Completion',
        type: 'confluence',
        jiraField: 'customfield_10001', // TODO: Update with actual PG custom field ID
        isDefault: true,
        isEditable: false
      }
    ];
  }

  getAllPossibleFields() {
    return [
      'key',
      'summary',
      'status',
      'assignee',
      'priority',
      'issuetype',
      'project',
      'created',
      'updated',
      'resolution',
      'labels',
      'components',
      'fixVersions',
      'customfield_10020',
      'customfield_10021',
      'customfield_10022',
      'customfield_10023',
      'customfield_10024',
      'customfield_10025',
      'customfield_10026',
      'customfield_10027',
      'customfield_10028',
      'customfield_10029',
      'customfield_10030',
      'customfield_10031',
      'customfield_10032',
      'customfield_10033',
      'customfield_10034',
      'customfield_10035',
      'customfield_10036',
      'customfield_10037',
      'customfield_10038',
      'customfield_10039',
      'customfield_10040',
      'customfield_10041',
      'customfield_10042',
      'customfield_10043',
      'customfield_10044',
      'customfield_10045',
      'customfield_10046',
      'customfield_10047',
      'customfield_10048',
      'customfield_10049',
      'customfield_10050',
      'customfield_23073',
      'customfield_35863'
    ];
  }

  getUserConfig() {
    try {
      const userConfigPath = path.join(__dirname, 'user-column-config.json');
      const userConfigData = fs.readFileSync(userConfigPath, 'utf8');
      return JSON.parse(userConfigData);
    } catch (error) {
      return { userColumns: [] };
    }
  }

  saveUserConfig(userColumns) {
    try {
      const userConfigPath = path.join(__dirname, 'user-column-config.json');
      const configData = JSON.stringify({ userColumns }, null, 2);
      fs.writeFileSync(userConfigPath, configData);
      return true;
    } catch (error) {
      console.error('Error saving user configuration:', error.message);
      return false;
    }
  }

  getTableConfig() {
    const userConfig = this.getUserConfig();
    
    // Merge columns, avoiding duplicates based on key
    const defaultCols = this.config.defaultColumns || [];
    const userCols = userConfig.userColumns || [];
    
    // Create a map to track columns by key
    const columnMap = new Map();
    
    // Add default columns first
    defaultCols.forEach(col => {
      if (col && col.key) {
        columnMap.set(col.key, col);
      }
    });
    
    // Add user columns, but only if they don't already exist (user columns override defaults)
    userCols.forEach(col => {
      if (col && col.key) {
        columnMap.set(col.key, col);
      }
    });
    
    // Convert map back to array, preserving order: defaults first, then user columns
    const allColumns = [
      ...defaultCols.filter(col => columnMap.has(col.key)),
      ...userCols.filter(col => !defaultCols.some(dc => dc.key === col.key))
    ];
    
    return {
      defaultColumns: defaultCols,
      userColumns: userCols,
      allColumns: allColumns,
      allPossibleFields: this.config.allPossibleFields
    };
  }

  getJiraConfig() {
    return this.config.jira;
  }

  getServerConfig() {
    return this.config.server;
  }

  getBackendConfig() {
    return {
      defaultColumns: this.config.defaultColumns || this.getDefaultColumns(),
      allPossibleFields: this.config.allPossibleFields || this.getAllPossibleFields()
    };
  }
}

module.exports = ConfigManager;
