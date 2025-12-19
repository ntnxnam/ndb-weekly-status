require('dotenv').config();
const axios = require('axios');

async function testCheckResponse() {
  const token = process.env.JIRA_API_TOKEN;
  const baseUrl = 'https://confluence.eng.nutanix.com:8443';
  const pageId = '468276167';
  
  if (!token) {
    console.error('❌ JIRA_API_TOKEN not found in .env');
    process.exit(1);
  }
  
  const cleanToken = token.trim().replace(/\r?\n/g, '');
  
  console.log('🧪 Testing Confluence API Response Structure...\n');
  console.log(`📄 Page ID: ${pageId}`);
  console.log(`🔗 URL: ${baseUrl}/rest/api/content/${pageId}?expand=version,metadata.labels\n`);
  
  try {
    const response = await axios.get(`${baseUrl}/rest/api/content/${pageId}`, {
      headers: {
        'Authorization': `Bearer ${cleanToken}`,
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
    });
    
    console.log(`✅ Status: ${response.status}`);
    console.log(`\n📋 Response Structure:`);
    console.log(JSON.stringify({
      id: response.data?.id,
      type: response.data?.type,
      title: response.data?.title,
      space: response.data?.space?.key,
      version: response.data?.version?.number,
      hasMetadata: !!response.data?.metadata,
      hasLabels: !!response.data?.metadata?.labels,
      labelCount: response.data?.metadata?.labels?.results?.length || 0,
      labels: response.data?.metadata?.labels?.results?.map(l => l.name) || []
    }, null, 2));
    
    console.log(`\n📄 Full Title: "${response.data?.title || 'NOT FOUND'}"`);
    
    if (response.data?.title) {
      console.log(`\n✅ SUCCESS! We can use: "${response.data.title}"`);
    } else {
      console.log(`\n⚠️ Title is missing. Checking alternative fields...`);
      console.log(`   - response.data.title: ${response.data?.title}`);
      console.log(`   - response.data.displayTitle: ${response.data?.displayTitle}`);
      console.log(`   - response.data.name: ${response.data?.name}`);
    }
    
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    if (error.response) {
      console.log(`   Status: ${error.response.status}`);
      console.log(`   Response: ${JSON.stringify(error.response.data).substring(0, 500)}`);
    }
  }
}

testCheckResponse().catch(console.error);

