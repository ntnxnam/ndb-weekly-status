require('dotenv').config();
const axios = require('axios');

async function testApiPaths() {
  const token = process.env.JIRA_API_TOKEN;
  const baseUrl = 'https://confluence.eng.nutanix.com:8443';
  const pageId = '468276167';
  
  if (!token) {
    console.error('❌ JIRA_API_TOKEN not found in .env');
    process.exit(1);
  }
  
  const cleanToken = token.trim().replace(/\r?\n/g, '');
  
  // Test different API paths
  const apiPaths = [
    '/rest/api/content/' + pageId,  // Standard path
    '/wiki/rest/api/content/' + pageId,  // With /wiki prefix
    '/rest/api/content/' + pageId + '?expand=version',  // With expand
    '/wiki/rest/api/content/' + pageId + '?expand=version',  // With /wiki and expand
  ];
  
  console.log('🧪 Testing Different Confluence API Paths...\n');
  console.log(`📄 Page ID: ${pageId}`);
  console.log(`🔑 Using token: ${cleanToken.substring(0, 20)}...\n`);
  
  for (let i = 0; i < apiPaths.length; i++) {
    const apiPath = apiPaths[i];
    const fullUrl = baseUrl + apiPath;
    
    console.log(`\nTest ${i + 1}: ${apiPath}`);
    console.log('─'.repeat(80));
    
    try {
      const response = await axios.get(fullUrl, {
        headers: {
          'Authorization': `Bearer ${cleanToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        timeout: 10000,
        validateStatus: function (status) {
          return status >= 200 && status < 600;
        }
      });
      
      console.log(`Status: ${response.status}`);
      
      if (response.status === 200) {
        console.log(`✅ SUCCESS!`);
        console.log(`   Title: "${response.data?.title || 'N/A'}"`);
        console.log(`   Type: ${response.data?.type || 'N/A'}`);
        console.log(`   Space: ${response.data?.space?.key || 'N/A'}`);
        console.log(`\n🎉 This is the correct API path!`);
        break;
      } else if (response.status === 401) {
        console.log(`❌ 401 Unauthorized - Authentication failed`);
        if (response.data) {
          console.log(`   Response: ${JSON.stringify(response.data).substring(0, 200)}`);
        }
      } else if (response.status === 404) {
        console.log(`❌ 404 Not Found - Path doesn't exist`);
      } else {
        console.log(`⚠️ Status ${response.status}`);
        if (response.data) {
          console.log(`   Response: ${JSON.stringify(response.data).substring(0, 200)}`);
        }
      }
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
      if (error.response) {
        console.log(`   Status: ${error.response.status}`);
      }
    }
    
    // Small delay between requests
    if (i < apiPaths.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  console.log('\n\n📊 Summary:');
  console.log('If none of the paths work with 200 status, the issue is authentication, not the API path.');
  console.log('In that case, we should extract titles from URLs instead of calling the API.');
}

testApiPaths().catch(console.error);

