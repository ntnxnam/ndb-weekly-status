require('dotenv').config();
const axios = require('axios');

async function testConfluenceAPI() {
  const token = process.env.JIRA_API_TOKEN;
  const baseUrl = 'https://confluence.eng.nutanix.com:8443';
  const pageId = '468276167';
  
  if (!token) {
    console.error('❌ JIRA_API_TOKEN not found in .env');
    process.exit(1);
  }
  
  const cleanToken = token.trim().replace(/\r?\n/g, '');
  
  console.log('🧪 Comprehensive Confluence API Test\n');
  console.log(`📄 Page ID: ${pageId}`);
  console.log(`🔗 Base URL: ${baseUrl}`);
  console.log(`🔑 Token: ${cleanToken.substring(0, 20)}...\n`);
  
  // Test different API endpoints and authentication methods
  const tests = [
    {
      name: 'Test 1: /rest/api/content/{id} with Bearer token',
      url: `${baseUrl}/rest/api/content/${pageId}`,
      headers: { 'Authorization': `Bearer ${cleanToken}`, 'Accept': 'application/json' }
    },
    {
      name: 'Test 2: /wiki/rest/api/content/{id} with Bearer token',
      url: `${baseUrl}/wiki/rest/api/content/${pageId}`,
      headers: { 'Authorization': `Bearer ${cleanToken}`, 'Accept': 'application/json' }
    },
    {
      name: 'Test 3: /rest/api/content/{id} with Basic Auth (email:token)',
      url: `${baseUrl}/rest/api/content/${pageId}`,
      headers: { 'Authorization': `Basic ${Buffer.from(`namratha.singh@nutanix.com:${cleanToken}`).toString('base64')}`, 'Accept': 'application/json' }
    },
    {
      name: 'Test 4: /wiki/rest/api/content/{id} with Basic Auth (email:token)',
      url: `${baseUrl}/wiki/rest/api/content/${pageId}`,
      headers: { 'Authorization': `Basic ${Buffer.from(`namratha.singh@nutanix.com:${cleanToken}`).toString('base64')}`, 'Accept': 'application/json' }
    },
    {
      name: 'Test 5: /rest/api/content/{id}?expand=version with Bearer',
      url: `${baseUrl}/rest/api/content/${pageId}?expand=version`,
      headers: { 'Authorization': `Bearer ${cleanToken}`, 'Accept': 'application/json' }
    },
    {
      name: 'Test 6: /wiki/rest/api/content/{id}?expand=version with Bearer',
      url: `${baseUrl}/wiki/rest/api/content/${pageId}?expand=version`,
      headers: { 'Authorization': `Bearer ${cleanToken}`, 'Accept': 'application/json' }
    },
    {
      name: 'Test 7: /rest/api/v2/content/{id} with Bearer (v2 API)',
      url: `${baseUrl}/rest/api/v2/content/${pageId}`,
      headers: { 'Authorization': `Bearer ${cleanToken}`, 'Accept': 'application/json' }
    },
    {
      name: 'Test 8: /wiki/rest/api/v2/content/{id} with Bearer (v2 API)',
      url: `${baseUrl}/wiki/rest/api/v2/content/${pageId}`,
      headers: { 'Authorization': `Bearer ${cleanToken}`, 'Accept': 'application/json' }
    }
  ];
  
  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    console.log(`\n${test.name}`);
    console.log('─'.repeat(80));
    
    try {
      const response = await axios.get(test.url, {
        headers: test.headers,
        timeout: 10000,
        validateStatus: function (status) {
          return status >= 200 && status < 600;
        }
      });
      
      console.log(`Status: ${response.status}`);
      console.log(`Content-Type: ${response.headers['content-type'] || 'N/A'}`);
      
      if (response.status === 200) {
        if (response.headers['content-type']?.includes('application/json')) {
          console.log(`✅ SUCCESS! Got JSON response`);
          console.log(`   Title: "${response.data?.title || 'N/A'}"`);
          console.log(`   Type: ${response.data?.type || 'N/A'}`);
          console.log(`   ID: ${response.data?.id || 'N/A'}`);
          console.log(`\n🎉 THIS IS THE CORRECT API ENDPOINT AND AUTHENTICATION METHOD!`);
          console.log(`   URL: ${test.url}`);
          console.log(`   Headers: ${JSON.stringify(test.headers, null, 2)}`);
          break; // Found working method, stop testing
        } else if (response.headers['content-type']?.includes('text/html')) {
          console.log(`❌ Got HTML (login page) - Authentication failed`);
          const htmlPreview = typeof response.data === 'string' ? response.data.substring(0, 200) : 'N/A';
          if (htmlPreview.includes('Log into')) {
            console.log(`   Response is a login page`);
          }
        } else {
          console.log(`⚠️ Unexpected content type: ${response.headers['content-type']}`);
        }
      } else if (response.status === 401) {
        console.log(`❌ 401 Unauthorized`);
        if (response.data && typeof response.data === 'object') {
          console.log(`   Error: ${JSON.stringify(response.data).substring(0, 200)}`);
        }
      } else if (response.status === 404) {
        console.log(`❌ 404 Not Found - Endpoint doesn't exist`);
      } else {
        console.log(`⚠️ Status ${response.status}`);
      }
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
      if (error.response) {
        console.log(`   Status: ${error.response.status}`);
      }
    }
    
    // Small delay between requests
    if (i < tests.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  console.log('\n\n📊 Summary:');
  console.log('If none of the tests returned JSON with a title, authentication is not working.');
  console.log('In that case, extracting titles from URLs is the best approach.');
}

testConfluenceAPI().catch(console.error);

