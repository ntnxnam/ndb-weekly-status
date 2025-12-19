require('dotenv').config();
const axios = require('axios');

const token = process.env.CONFLUENCE_API_TOKEN;
const testPageId = '460996552'; // From FEAT-18289 logs
const baseUrl = process.env.CONFLUENCE_BASE_URL || 'https://confluence.eng.nutanix.com:8443';

if (!token) {
  console.error('❌ CONFLUENCE_API_TOKEN not found in .env file');
  process.exit(1);
}

console.log('🔍 Testing Confluence Token...');
console.log(`📋 Token length: ${token.length}`);
console.log(`📋 Token preview: ${token.substring(0, 20)}...`);
console.log(`📋 Base URL: ${baseUrl}`);
console.log(`📋 Test Page ID: ${testPageId}`);
console.log('');

// Test 1: PAT tokens endpoint (to verify token)
console.log('🧪 Test 1: PAT Tokens Endpoint (verify token)');
console.log(`   URL: ${baseUrl}/rest/pat/latest/tokens`);
console.log(`   Header: Authorization: Bearer ${token.substring(0, 20)}...`);
console.log('');

axios.get(`${baseUrl}/rest/pat/latest/tokens`, {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json'
  },
  timeout: 10000
})
.then(response => {
  console.log('✅ SUCCESS with PAT tokens endpoint!');
  console.log(`   Status: ${response.status}`);
  console.log(`   Response: ${JSON.stringify(response.data, null, 2)}`);
  console.log('');
  
  // If PAT endpoint works, try the content endpoint
  console.log('🧪 Test 2: Content API with Bearer Token');
  console.log(`   URL: ${baseUrl}/rest/api/content/${testPageId}?expand=version`);
  console.log('');
  
  return axios.get(`${baseUrl}/rest/api/content/${testPageId}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json'
    },
    params: {
      expand: 'version'
    },
    timeout: 10000
  });
})
.then(response => {
  console.log('✅ SUCCESS with Content API!');
  console.log(`   Status: ${response.status}`);
  console.log(`   Page Title: ${response.data.title || 'N/A'}`);
  console.log(`   Page ID: ${response.data.id || 'N/A'}`);
  console.log('');
  console.log('✅ Your token is working correctly!');
})
.catch(error => {
  console.log('❌ FAILED with PAT tokens endpoint');
  if (error.response) {
    console.log(`   Status: ${error.response.status} ${error.response.statusText}`);
    console.log(`   Response: ${JSON.stringify(error.response.data)}`);
    if (error.response.headers['www-authenticate']) {
      console.log(`   WWW-Authenticate: ${error.response.headers['www-authenticate']}`);
    }
  } else {
    console.log(`   Error: ${error.message}`);
  }
  console.log('');
  
  // Test 2: Try content API directly
  console.log('🧪 Test 2: Content API with Bearer Token (direct)');
  console.log(`   URL: ${baseUrl}/rest/api/content/${testPageId}?expand=version`);
  console.log('');
  
  return axios.get(`${baseUrl}/rest/api/content/${testPageId}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json'
    },
    params: {
      expand: 'version'
    },
    timeout: 10000
  });
})
.then(response => {
  console.log('✅ SUCCESS with Content API!');
  console.log(`   Status: ${response.status}`);
  console.log(`   Page Title: ${response.data.title || 'N/A'}`);
  console.log(`   Page ID: ${response.data.id || 'N/A'}`);
  console.log('');
  console.log('✅ Your token works with Content API!');
})
.catch(error => {
  console.log('❌ FAILED with Content API');
  if (error.response) {
    console.log(`   Status: ${error.response.status} ${error.response.statusText}`);
    console.log(`   Response: ${JSON.stringify(error.response.data)}`);
  } else {
    console.log(`   Error: ${error.message}`);
  }
  console.log('');
  
  // Test 3: Try without Bearer prefix
  console.log('🧪 Test 3: Token without Bearer prefix');
  console.log(`   URL: ${baseUrl}/rest/api/content/${testPageId}?expand=version`);
  console.log('');
  
  return axios.get(`${baseUrl}/rest/api/content/${testPageId}`, {
    headers: {
      'Authorization': token,
      'Accept': 'application/json'
    },
    params: {
      expand: 'version'
    },
    timeout: 10000
  });
})
.then(response => {
  if (response.status === 200) {
    console.log('✅ SUCCESS with Basic Auth!');
    console.log(`   Status: ${response.status}`);
    console.log(`   Page Title: ${response.data.title || 'N/A'}`);
    console.log(`   Page ID: ${response.data.id || 'N/A'}`);
    console.log('');
    console.log('✅ Your token works with Basic Auth!');
    process.exit(0);
  } else {
    throw new Error(`HTTP ${response.status}`);
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
  console.log('');
  
  // Test 2: Try without Bearer prefix (some instances use token directly)
  console.log('🧪 Test 2: Token without Bearer prefix');
  console.log(`   URL: ${baseUrl}/rest/api/content/${testPageId}?expand=version`);
  console.log(`   Header: Authorization: ${token.substring(0, 20)}...`);
  console.log('');
  
  return axios.get(`${baseUrl}/rest/api/content/${testPageId}`, {
    headers: {
      'Authorization': token,
      'Accept': 'application/json'
    },
    params: {
      expand: 'version'
    },
    timeout: 10000
  });
})
.then(response => {
  console.log('✅ SUCCESS without Bearer prefix!');
  console.log(`   Status: ${response.status}`);
  console.log(`   Page Title: ${response.data.title || 'N/A'}`);
  console.log('');
  console.log('✅ Your token works without Bearer prefix!');
})
.catch(error => {
  console.log('❌ FAILED without Bearer prefix');
  if (error.response) {
    console.log(`   Status: ${error.response.status} ${error.response.statusText}`);
    console.log(`   Response: ${JSON.stringify(error.response.data)}`);
  } else {
    console.log(`   Error: ${error.message}`);
  }
  console.log('');
  console.log('❌ Token authentication failed with both methods.');
  console.log('');
  console.log('💡 Troubleshooting:');
  console.log('   1. Verify the token is valid and not expired');
  console.log('   2. Check if the token has Confluence read permissions');
  console.log('   3. Verify the Confluence instance URL is correct');
  console.log('   4. Check if this instance requires a different authentication method');
  console.log('   5. Try accessing the page in a browser to verify it exists');
  process.exit(1);
});

