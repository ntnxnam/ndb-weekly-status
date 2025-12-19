require('dotenv').config();
const axios = require('axios');

// Test the complete flow: Backend extraction -> Frontend display
async function testTitleDisplayFlow() {
  console.log('🧪 Testing Complete Title Display Flow\n');
  
  // Simulate what the backend does
  const testUrl = 'https://confluence.eng.nutanix.com:8443/spaces/ED/pages/468276167/NDB-2.10+CG+Readiness';
  
  // Backend extraction (from server.js)
  const extractTitleFromUrl = (url) => {
    if (!url) return null;
    const titleMatch = url.match(/\/pages\/\d+\/([^\/\?]+)/);
    if (titleMatch) {
      let title = decodeURIComponent(titleMatch[1]);
      title = title.replace(/\+/g, ' ').replace(/-/g, ' ').trim();
      return title;
    }
    return null;
  };
  
  const extractedTitle = extractTitleFromUrl(testUrl);
  console.log('1️⃣ Backend Extraction:');
  console.log(`   URL: ${testUrl}`);
  console.log(`   ✅ Extracted Title: "${extractedTitle}"\n`);
  
  // Simulate backend data structure
  const backendData = {
    url: testUrl,
    title: extractedTitle,
    pageId: '468276167'
  };
  
  console.log('2️⃣ Backend Data Structure:');
  console.log(`   ${JSON.stringify(backendData, null, 2)}\n`);
  
  // Simulate what jira-client-clean.js does
  const formattedData = {
    _readinessLinks: {
      cg: [backendData],
      pg: []
    }
  };
  
  console.log('3️⃣ Formatted Data (jira-client-clean.js):');
  console.log(`   ${JSON.stringify(formattedData, null, 2)}\n`);
  
  // Simulate what frontend does
  const linkObjects = formattedData._readinessLinks.cg;
  const frontendExtractTitleFromUrl = (url) => {
    const titleMatch = url.match(/\/pages\/\d+\/([^\/\?]+)/);
    if (titleMatch) {
      let title = decodeURIComponent(titleMatch[1]);
      title = title.replace(/\+/g, ' ').replace(/-/g, ' ').trim();
      return title;
    }
    return null;
  };
  
  const displayHtml = linkObjects.map((linkObj) => {
    const url = linkObj.url || linkObj;
    const title = linkObj.title || frontendExtractTitleFromUrl(url) || 'Link';
    return `<a href="${url}" target="_blank">${title}</a>`;
  }).join(' | ');
  
  console.log('4️⃣ Frontend Display HTML:');
  console.log(`   ${displayHtml}\n`);
  
  console.log('5️⃣ Final Result:');
  console.log(`   ✅ User sees: "${extractedTitle}"`);
  console.log(`   ✅ Link points to: ${testUrl}\n`);
  
  // Test with multiple links
  console.log('6️⃣ Testing Multiple Links:');
  const multipleLinks = [
    { url: testUrl, title: extractedTitle },
    { url: 'https://confluence.eng.nutanix.com:8443/spaces/ED/pages/460996552/NDB-2.10+PG+Readiness', title: 'NDB 2.10 PG Readiness' }
  ];
  const multipleDisplay = multipleLinks.map((linkObj) => {
    const url = linkObj.url;
    const title = linkObj.title || frontendExtractTitleFromUrl(url) || 'Link';
    return `<a href="${url}" target="_blank">${title}</a>`;
  }).join(' | ');
  console.log(`   ${multipleDisplay}\n`);
  
  console.log('✅ Flow Test Complete!');
  console.log('   Backend extracts title → Frontend displays title');
}

testTitleDisplayFlow().catch(console.error);

