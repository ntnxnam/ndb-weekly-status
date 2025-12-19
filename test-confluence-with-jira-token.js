require('dotenv').config();
const axios = require('axios');

const jiraToken = process.env.JIRA_API_TOKEN;
const confToken = process.env.CONFLUENCE_API_TOKEN;
const testPageId = '460996552';
const baseUrl = process.env.CONFLUENCE_BASE_URL || 'https://confluence.eng.nutanix.com:8443';

console.log('🔍 Testing Confluence with Jira Token...');
console.log(`📋 Jira token length: ${jiraToken ? jiraToken.length : 'NOT SET'}`);
console.log(`📋 Confluence token length: ${confToken ? confToken.length : 'NOT SET'}`);
console.log(`📋 Tokens are same: ${jiraToken === confToken}`);
console.log('');

if (!jiraToken) {
  console.error('❌ JIRA_API_TOKEN not found in .env file');
  process.exit(1);
}

// Test with Jira token
console.log('🧪 Test: Using Jira Token for Confluence');
console.log(`   URL: ${baseUrl}/rest/api/content/${testPageId}?expand=version`);
console.log(`   Header: Authorization: Bearer ${jiraToken.substring(0, 20)}...`);
console.log('');

axios.get(`${baseUrl}/rest/api/content/${testPageId}`, {
  headers: {
    'Authorization': `Bearer ${jiraToken.trim().replace(/\r?\n/g, '')}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  },
  params: {
    expand: 'version'
  },
  timeout: 10000,
  validateStatus: function (status) {
    return status >= 200 && status < 600;
  }
})
.then(response => {
  if (response.status === 200) {
    console.log('✅ SUCCESS with Jira token!');
    console.log(`   Status: ${response.status}`);
    console.log(`   Page Title: ${response.data.title || 'N/A'}`);
    console.log(`   Page ID: ${response.data.id || 'N/A'}`);
    console.log('');
    console.log('✅ Jira token works for Confluence! Use JIRA_API_TOKEN for both.');
  } else {
    console.log(`❌ Status: ${response.status}`);
    console.log(`   Response: ${JSON.stringify(response.data)}`);
  }
})
.catch(error => {
  console.log('❌ FAILED with Jira token');
  if (error.response) {
    console.log(`   Status: ${error.response.status} ${error.response.statusText}`);
    console.log(`   Response: ${JSON.stringify(error.response.data)}`);
  } else {
    console.log(`   Error: ${error.message}`);
  }
  process.exit(1);
});

