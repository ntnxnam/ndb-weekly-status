#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function setupConfig() {
  console.log('🚀 Story Point Calculator - Configuration Setup\n');
  console.log('This will help you configure your Jira connection.\n');

  try {
    // Get Jira URL
    const baseUrl = await question('Enter your Jira URL (e.g., https://company.atlassian.net): ');
    if (!baseUrl) {
      throw new Error('Jira URL is required');
    }

    // Get username/email
    const username = await question('Enter your Jira email address: ');
    if (!username) {
      throw new Error('Email address is required');
    }

    // Get API token
    const apiToken = await question('Enter your Jira API token: ');
    if (!apiToken) {
      throw new Error('API token is required');
    }

    // Get JQL query (with default)
    const defaultJql = "filter = 'NDB-StatusUpdates'";
    const jqlInput = await question(`Enter your JQL query (press Enter for default: ${defaultJql}): `);
    const jql = jqlInput.trim() || defaultJql;

    // Get port (with default)
    const portInput = await question('Enter server port (press Enter for default: 3000): ');
    const port = portInput.trim() || '3000';

    // Create config object
    const config = {
      jira: {
        baseUrl: baseUrl.trim(),
        username: username.trim(),
        apiToken: apiToken.trim(),
        jql: jql
      },
      server: {
        port: parseInt(port)
      }
    };

    // Write config.json
    const configPath = path.join(__dirname, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log('\n✅ Configuration saved to config.json (this file is ignored by Git for security)');

    // Create .env file
    const envContent = `# Story Point Calculator Configuration
JIRA_BASE_URL=${config.jira.baseUrl}
JIRA_USERNAME=${config.jira.username}
JIRA_API_TOKEN=${config.jira.apiToken}
JIRA_JQL=${config.jira.jql}
PORT=${config.server.port}
`;

    const envPath = path.join(__dirname, '.env');
    fs.writeFileSync(envPath, envContent);
    console.log('✅ Environment variables saved to .env');

    // Create private key file
    const keyPath = path.join(__dirname, 'jira-key-private.txt');
    fs.writeFileSync(keyPath, config.jira.apiToken);
    console.log('✅ API token saved to jira-key-private.txt (this file is ignored by Git for security)');

    console.log('\n🎉 Configuration complete!');
    console.log('\nNext steps:');
    console.log('1. Run: npm install');
    console.log('2. Run: npm start');
    console.log('3. Open: http://localhost:' + config.server.port);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Run setup if called directly
if (require.main === module) {
  setupConfig();
}

module.exports = setupConfig;
