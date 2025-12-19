// Test extracting page title from Confluence URL
function extractTitleFromUrl(url) {
  if (!url) return null;
  
  // Pattern 1: /pages/123456789/Page+Title or /pages/123456789/Page-Title
  const titleMatch = url.match(/\/pages\/\d+\/([^\/\?]+)/);
  if (titleMatch) {
    let title = decodeURIComponent(titleMatch[1]);
    // Replace + and - with spaces, clean up
    title = title.replace(/\+/g, ' ').replace(/-/g, ' ').trim();
    return title;
  }
  
  // Pattern 2: ?title=Page+Title
  const titleParamMatch = url.match(/[?&]title=([^&]+)/);
  if (titleParamMatch) {
    let title = decodeURIComponent(titleParamMatch[1]);
    title = title.replace(/\+/g, ' ').trim();
    return title;
  }
  
  return null;
}

// Test URLs
const testUrls = [
  'https://confluence.eng.nutanix.com:8443/spaces/ED/pages/468276167/NDB-2.10+CG+Readiness',
  'https://confluence.eng.nutanix.com:8443/spaces/ED/pages/460996552/NDB-2.10+PG+Readiness',
  'https://confluence.eng.nutanix.com:8443/spaces/ED/pages/468276167/NDB-2.10+CG+Readiness?param=value',
  'https://confluence.eng.nutanix.com:8443/spaces/ED/pages/123456789/Some+Page+Title',
  'https://confluence.eng.nutanix.com:8443/spaces/ED/pages/123456789/Some-Page-Title',
];

console.log('🧪 Testing Title Extraction from URLs...\n');

testUrls.forEach((url, idx) => {
  console.log(`Test ${idx + 1}:`);
  console.log(`  URL: ${url}`);
  const title = extractTitleFromUrl(url);
  if (title) {
    console.log(`  ✅ Extracted Title: "${title}"`);
  } else {
    console.log(`  ❌ Could not extract title`);
  }
  console.log('');
});

console.log('\n📊 Summary:');
console.log('If titles can be extracted from URLs, we can use them instead of "Link 1", "Link 2", etc.');
console.log('This would work even without API authentication!');

