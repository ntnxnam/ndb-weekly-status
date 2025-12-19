require('dotenv').config();
const axios = require('axios');
const ConfluenceClient = require('./confluence-client');

// Test fetching page titles for Confluence links
async function testFetchPageTitles() {
  const confluenceClient = new ConfluenceClient();
  const userToken = process.env.JIRA_API_TOKEN;
  
  if (!userToken) {
    console.error('❌ JIRA_API_TOKEN not found in .env');
    process.exit(1);
  }
  
  // Sample Confluence URLs from your logs
  const testUrls = [
    'https://confluence.eng.nutanix.com:8443/spaces/ED/pages/468276167/NDB-2.10+CG+Readiness',
    'https://confluence.eng.nutanix.com:8443/spaces/ED/pages/460996552/NDB-2.10+PG+Readiness',
    'https://confluence.eng.nutanix.com:8443/spaces/ED/pages/468276167/NDB-2.10+CG+Readiness'
  ];
  
  console.log('🧪 Testing Confluence Page Title Fetching...\n');
  
  for (let i = 0; i < testUrls.length; i++) {
    const url = testUrls[i];
    console.log(`\n📄 Test ${i + 1}: ${url}`);
    console.log('─'.repeat(80));
    
    try {
      // Try to get page title using the Confluence client
      const title = await confluenceClient.getPageTitle(url, userToken);
      
      if (title) {
        console.log(`✅ Page Title: "${title}"`);
      } else {
        console.log(`⚠️ Could not fetch page title (returned null)`);
      }
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
      if (error.response) {
        console.log(`   Status: ${error.response.status}`);
        console.log(`   Response: ${JSON.stringify(error.response.data).substring(0, 200)}`);
      }
    }
    
    // Small delay between requests
    if (i < testUrls.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  console.log('\n\n📊 Summary:');
  console.log('If titles are fetched successfully, we can use them instead of "Link 1", "Link 2", etc.');
  console.log('If authentication fails, we may need to use a different approach.');
}

testFetchPageTitles().catch(console.error);

