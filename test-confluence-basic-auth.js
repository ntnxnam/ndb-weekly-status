require('dotenv').config();
const axios = require('axios');

const token = process.env.CONFLUENCE_API_TOKEN;
const email = process.env.CONFLUENCE_EMAIL || 'namratha.singh@nutanix.com';
const testPageId = '460996552';
const baseUrl = process.env.CONFLUENCE_BASE_URL || 'https://confluence.eng.nutanix.com:8443';

if (!token) {
  console.error('❌ CONFLUENCE_API_TOKEN not found in .env file');
  process.exit(1);
}

console.log('🔍 Testing Confluence with Basic Auth (email:token)...');
console.log(`📋 Email: ${email}`);
console.log(`📋 Token length: ${token.length}`);
console.log(`📋 Base URL: ${baseUrl}`);
console.log(`📋 Test Page ID: ${testPageId}`);
console.log('');

// Test Basic Auth
const basicAuth = Buffer.from(`${email}:${token}`).toString('base64');
console.log('🧪 Test: Basic Auth (email:token base64 encoded)');
console.log(`   URL: ${baseUrl}/rest/api/content/${testPageId}?expand=version,metadata.labels`);
console.log(`   Header: Authorization: Basic ${basicAuth.substring(0, 30)}...`);
console.log('');

axios.get(`${baseUrl}/rest/api/content/${testPageId}`, {
  headers: {
    'Authorization': `Basic ${basicAuth}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  },
  params: {
    expand: 'version,metadata.labels'
  },
  timeout: 10000,
  validateStatus: function (status) {
    return status >= 200 && status < 600;
  }
})
.then(response => {
  if (response.status === 200) {
    console.log('✅ SUCCESS with Basic Auth!');
    console.log(`   Status: ${response.status}`);
    console.log(`   Page Title: ${response.data.title || 'N/A'}`);
    console.log(`   Page ID: ${response.data.id || 'N/A'}`);
    if (response.data.metadata && response.data.metadata.labels) {
      console.log(`   Labels: ${response.data.metadata.labels.results.map(l => l.name).join(', ')}`);
    }
    console.log('');
    console.log('✅ Basic Auth works! Use email:token format for Confluence API calls.');
  } else {
    console.log(`❌ Status: ${response.status}`);
    console.log(`   Response: ${JSON.stringify(response.data)}`);
  }
})
.catch(error => {
  console.log('❌ FAILED with Basic Auth');
  if (error.response) {
    console.log(`   Status: ${error.response.status} ${error.response.statusText}`);
    console.log(`   Response: ${JSON.stringify(error.response.data)}`);
    if (error.response.headers['www-authenticate']) {
      console.log(`   WWW-Authenticate: ${error.response.headers['www-authenticate']}`);
    }
  } else {
    console.log(`   Error: ${error.message}`);
  }
  process.exit(1);
});

