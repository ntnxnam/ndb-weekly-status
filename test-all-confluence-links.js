const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Load config for base URL
const configPath = path.join(__dirname, 'config.json');
const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const TEST_CONFIG = {
  jiraBaseUrl: configData.jira.baseUrl || 'https://jira.nutanix.com',
  jiraToken: process.env.JIRA_API_TOKEN,
  // Test with a few issue keys - you can modify these
  testIssueKeys: [
    'FEAT-18289',  // Known to have Confluence links
    // Add more issue keys here to test
  ]
};

function extractPageId(confluenceUrl) {
  if (!confluenceUrl) return null;
  
  let urlString = typeof confluenceUrl === 'string' ? confluenceUrl : (confluenceUrl.url || confluenceUrl.value || '');
  if (!urlString) return null;
  
  // Try pageId= parameter format
  const pageIdParamMatch = urlString.match(/pageId=(\d+)/);
  if (pageIdParamMatch) return pageIdParamMatch[1];
  
  // Try /pages/123456789/ format
  const pagesPathMatch = urlString.match(/\/pages\/(\d+)/);
  if (pagesPathMatch) return pagesPathMatch[1];
  
  // Try pages/123456789 format (without leading slash)
  const pagesMatch = urlString.match(/pages\/(\d+)/);
  if (pagesMatch) return pagesMatch[1];
  
  return null;
}

async function testAllConfluenceLinks() {
  console.log('\n' + '='.repeat(80));
  console.log('🧪 DRY RUN: Testing All Confluence Links Extraction');
  console.log('='.repeat(80));
  console.log(`\nTesting ${TEST_CONFIG.testIssueKeys.length} issue(s)\n`);

  if (!TEST_CONFIG.jiraToken) {
    console.error('❌ JIRA_API_TOKEN not found in environment variables');
    console.log('   Please set JIRA_API_TOKEN in your .env file');
    return;
  }

  const results = [];

  for (const issueKey of TEST_CONFIG.testIssueKeys) {
    console.log(`\n📋 Testing Issue: ${issueKey}`);
    console.log('-'.repeat(80));

    try {
      // Fetch remote links
      const baseUrl = TEST_CONFIG.jiraBaseUrl.replace(/\/$/, '');
      const remoteLinksResponse = await axios.get(
        `${baseUrl}/rest/api/2/issue/${issueKey}/remotelink`,
        {
          headers: {
            'Authorization': `Bearer ${TEST_CONFIG.jiraToken}`,
            'Accept': 'application/json'
          },
          timeout: 10000
        }
      );

      if (!remoteLinksResponse.data || !Array.isArray(remoteLinksResponse.data)) {
        console.log(`  ⚠️  No remote links data for ${issueKey}`);
        results.push({
          issueKey,
          totalRemoteLinks: 0,
          confluenceLinks: []
        });
        continue;
      }

      const allRemoteLinks = remoteLinksResponse.data;
      console.log(`  📊 Total remote links: ${allRemoteLinks.length}`);

      // Extract ALL Confluence links (not just "mentioned in")
      const allConfluenceLinks = [];

      allRemoteLinks.forEach((link, index) => {
        const object = link.object || {};
        const url = object.url || '';
        const title = object.title || '';
        const relationship = link.relationship || '';

        // Check if it's a Confluence URL
        const isConfluence = url && (
          url.includes('confluence') || 
          url.includes('atlassian.net/wiki') ||
          url.includes('confluence.eng.nutanix.com')
        );

        if (isConfluence) {
          const pageId = extractPageId(url);
          const confluenceLink = {
            index: index + 1,
            relationship: relationship,
            title: title || '(no title)',
            url: url,
            pageId: pageId || '(could not extract)'
          };
          
          allConfluenceLinks.push(confluenceLink);
          
          console.log(`\n  ✅ Confluence Link #${index + 1}:`);
          console.log(`     Relationship: ${relationship}`);
          console.log(`     Title: ${title || '(no title)'}`);
          console.log(`     URL: ${url.substring(0, 100)}${url.length > 100 ? '...' : ''}`);
          console.log(`     Page ID: ${pageId || '(could not extract)'}`);
        }
      });

      console.log(`\n  📄 Summary: Found ${allConfluenceLinks.length} Confluence link(s) out of ${allRemoteLinks.length} total remote link(s)`);

      results.push({
        issueKey,
        totalRemoteLinks: allRemoteLinks.length,
        confluenceLinks: allConfluenceLinks
      });

    } catch (error) {
      console.error(`  ❌ Error fetching remote links for ${issueKey}:`, error.message);
      if (error.response) {
        console.error(`     Status: ${error.response.status} - ${error.response.statusText}`);
      }
      results.push({
        issueKey,
        error: error.message,
        totalRemoteLinks: 0,
        confluenceLinks: []
      });
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 SUMMARY');
  console.log('='.repeat(80));

  results.forEach(result => {
    console.log(`\n${result.issueKey}:`);
    if (result.error) {
      console.log(`  ❌ Error: ${result.error}`);
    } else {
      console.log(`  Total Remote Links: ${result.totalRemoteLinks}`);
      console.log(`  Confluence Links: ${result.confluenceLinks.length}`);
      
      if (result.confluenceLinks.length > 0) {
        console.log(`  Confluence Links List:`);
        result.confluenceLinks.forEach((link, idx) => {
          console.log(`    ${idx + 1}. [${link.relationship}] ${link.title}`);
          console.log(`       URL: ${link.url.substring(0, 80)}...`);
          console.log(`       Page ID: ${link.pageId}`);
        });
      }
    }
  });

  // Return results as JSON for programmatic use
  console.log('\n' + '='.repeat(80));
  console.log('📋 JSON Results (for verification):');
  console.log('='.repeat(80));
  console.log(JSON.stringify(results, null, 2));

  return results;
}

// Run the test
testAllConfluenceLinks()
  .then(results => {
    console.log('\n✅ Dry run completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Dry run failed:', error);
    process.exit(1);
  });

