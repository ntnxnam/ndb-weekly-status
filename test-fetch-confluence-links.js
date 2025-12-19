require('dotenv').config();
const axios = require('axios');

const JIRA_BASE_URL = process.env.JIRA_BASE_URL || 'https://jira.nutanix.com';
const CONFLUENCE_BASE_URL = process.env.CONFLUENCE_BASE_URL || 'https://confluence.eng.nutanix.com:8443';
const JQL = 'filter = 165194 and fixVersion=NDB-2.10';

// Get tokens from environment or prompt
const jiraToken = process.env.JIRA_API_TOKEN;
const confluenceToken = process.env.CONFLUENCE_API_TOKEN;

if (!jiraToken) {
  console.error('❌ JIRA_API_TOKEN not found in .env file');
  process.exit(1);
}

console.log('🔍 Test: Fetch Jira Issues and Confluence Links');
console.log(`📋 JQL: ${JQL}`);
console.log(`📋 Jira Base URL: ${JIRA_BASE_URL}`);
console.log(`📋 Confluence Base URL: ${CONFLUENCE_BASE_URL}`);
console.log(`📋 Jira Token: ${jiraToken ? jiraToken.substring(0, 20) + '...' : 'NOT SET'}`);
console.log(`📋 Confluence Token: ${confluenceToken ? confluenceToken.substring(0, 20) + '...' : 'NOT SET (will use Jira token)'}`);
console.log('');

// Step 1: Fetch Jira issues
async function fetchJiraIssues() {
  console.log('📥 Step 1: Fetching Jira issues...');
  
  const cleanToken = jiraToken.trim().replace(/\r?\n/g, '');
  
  try {
    const response = await axios.post(
      `${JIRA_BASE_URL}/rest/api/2/search`,
      {
        jql: JQL,
        maxResults: 1000,
        fields: ['key', 'summary', 'status', 'fixVersions']
      },
      {
        headers: {
          'Authorization': `Bearer ${cleanToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        timeout: 30000,
        validateStatus: function (status) {
          return status >= 200 && status < 600;
        }
      }
    );

    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(response.data)}`);
    }

    const issues = response.data.issues || [];
    console.log(`✅ Found ${issues.length} issues`);
    console.log(`📊 Total available: ${response.data.total || 0} issues`);
    console.log('');

    return issues;
  } catch (error) {
    console.error('❌ Error fetching Jira issues:', error.message);
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Response: ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

// Step 2: Fetch remote links for each issue
async function fetchRemoteLinks(issueKey, token) {
  const cleanToken = token.trim().replace(/\r?\n/g, '');
  
  try {
    const response = await axios.get(
      `${JIRA_BASE_URL}/rest/api/2/issue/${issueKey}/remotelink`,
      {
        headers: {
          'Authorization': `Bearer ${cleanToken}`,
          'Accept': 'application/json'
        },
        timeout: 10000,
        validateStatus: function (status) {
          return status >= 200 && status < 600;
        }
      }
    );

    if (response.status !== 200) {
      return [];
    }

    return response.data || [];
  } catch (error) {
    console.error(`   ⚠️ Error fetching remote links for ${issueKey}: ${error.message}`);
    return [];
  }
}

// Step 3: Filter Confluence links
function filterConfluenceLinks(remoteLinks) {
  const confluenceLinks = [];
  
  for (const link of remoteLinks) {
    const object = link.object || {};
    const url = object.url || '';
    
    // Check if it's a Confluence URL
    if (url.includes('confluence.eng.nutanix.com') || url.includes('confluence') || url.includes('/wiki/')) {
      confluenceLinks.push({
        url: url,
        title: object.title || 'No title',
        relationship: link.relationship || 'unknown',
        globalId: link.globalId || null
      });
    }
  }
  
  return confluenceLinks;
}

// Step 4: Fetch Confluence page title
async function fetchConfluencePageTitle(confluenceUrl, token) {
  const cleanToken = token.trim().replace(/\r?\n/g, '');
  
  // Extract page ID from URL
  let pageId = null;
  
  // Try pageId= parameter
  const pageIdMatch = confluenceUrl.match(/pageId=(\d+)/);
  if (pageIdMatch) {
    pageId = pageIdMatch[1];
  } else {
    // Try /pages/123456789/ format
    const pagesMatch = confluenceUrl.match(/\/pages\/(\d+)/);
    if (pagesMatch) {
      pageId = pagesMatch[1];
    }
  }
  
  if (!pageId) {
    return null;
  }
  
  try {
    // According to Confluence REST API v1: GET /rest/api/content/{id}
    // expand parameter can include: version, metadata.labels, body.storage, etc.
    const response = await axios.get(
      `${CONFLUENCE_BASE_URL}/rest/api/content/${pageId}`,
      {
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
      }
    );

    if (response.status === 200) {
      return response.data.title || null;
    }
    
    return null;
  } catch (error) {
    if (error.response && error.response.status === 401) {
      console.error(`   ⚠️ Authentication failed for page ${pageId}: ${error.response.status}`);
    }
    return null;
  }
}

// Main test function
async function runTest() {
  try {
    // Step 1: Fetch Jira issues
    const issues = await fetchJiraIssues();
    
    if (issues.length === 0) {
      console.log('ℹ️ No issues found');
      return;
    }
    
    console.log('📋 Issue Keys:');
    issues.forEach((issue, idx) => {
      console.log(`   ${idx + 1}. ${issue.key} - ${issue.fields.summary}`);
    });
    console.log('');
    
    // Step 2: Fetch remote links for each issue
    console.log('🔗 Step 2: Fetching remote links for each issue...');
    console.log('');
    
    const tokenToUse = confluenceToken || jiraToken;
    
    for (let i = 0; i < Math.min(issues.length, 10); i++) { // Limit to first 10 for testing
      const issue = issues[i];
      const issueKey = issue.key;
      
      console.log(`📋 Processing ${issueKey}...`);
      
      // Fetch remote links
      const remoteLinks = await fetchRemoteLinks(issueKey, jiraToken);
      console.log(`   Found ${remoteLinks.length} remote link(s)`);
      
      // Filter Confluence links
      const confluenceLinks = filterConfluenceLinks(remoteLinks);
      console.log(`   Found ${confluenceLinks.length} Confluence link(s)`);
      
      if (confluenceLinks.length > 0) {
        console.log(`   Confluence Links:`);
        for (const link of confluenceLinks) {
          console.log(`      - ${link.title}: ${link.url}`);
          console.log(`        Relationship: ${link.relationship}`);
          
          // Try to fetch page title
          const pageTitle = await fetchConfluencePageTitle(link.url, tokenToUse);
          if (pageTitle) {
            console.log(`        ✅ Page Title: "${pageTitle}"`);
          } else {
            console.log(`        ⚠️ Could not fetch page title (may need authentication)`);
          }
        }
      } else {
        console.log(`   ℹ️ No Confluence links found`);
      }
      
      console.log('');
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log('✅ Test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
runTest();

