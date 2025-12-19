/**
 * Detailed test to check remote links fetching and CG/PG identification
 */

const axios = require('axios');
require('dotenv').config();

const TEST_CONFIG = {
  jiraBaseUrl: process.env.JIRA_BASE_URL || 'https://nutanix.atlassian.net',
  jiraToken: process.env.JIRA_API_TOKEN,
  confluenceToken: process.env.CONFLUENCE_API_TOKEN,
  testIssueKey: 'FEAT-18289'
};

async function testRemoteLinksDetailed() {
  console.log('\n' + '='.repeat(80));
  console.log('🔍 Detailed Remote Links Test');
  console.log('='.repeat(80));
  console.log(`Issue: ${TEST_CONFIG.testIssueKey}\n`);

  try {
    // Step 1: Fetch remote links directly from Jira API
    console.log('📥 Step 1: Fetching remote links directly from Jira...');
    const baseUrl = TEST_CONFIG.jiraBaseUrl.replace(/\/$/, '');
    const remoteLinksResponse = await axios.get(
      `${baseUrl}/rest/api/2/issue/${TEST_CONFIG.testIssueKey}/remotelink`,
      {
        headers: {
          'Authorization': `Bearer ${TEST_CONFIG.jiraToken}`,
          'Accept': 'application/json'
        },
        timeout: 10000
      }
    );

    console.log(`✅ Remote links fetched: ${remoteLinksResponse.data?.length || 0} links\n`);

    if (!remoteLinksResponse.data || remoteLinksResponse.data.length === 0) {
      console.log('⚠️  No remote links found for this issue');
      return;
    }

    // Step 2: Display all remote links
    console.log('📋 Step 2: All Remote Links:');
    console.log('-'.repeat(80));
    remoteLinksResponse.data.forEach((link, index) => {
      const object = link.object || {};
      const url = object.url || '';
      const title = (object.title || '').toLowerCase();
      const relationship = link.relationship || '';
      
      console.log(`\n${index + 1}. Relationship: ${relationship}`);
      console.log(`   Title: ${object.title || '(none)'}`);
      console.log(`   URL: ${url.substring(0, 100)}${url.length > 100 ? '...' : ''}`);
      console.log(`   Is Confluence: ${url.includes('confluence') ? 'Yes' : 'No'}`);
    });

    // Step 3: Filter "mentioned in" links
    console.log('\n📋 Step 3: "Mentioned In" Links:');
    console.log('-'.repeat(80));
    const mentionedInLinks = remoteLinksResponse.data.filter(link => {
      const relationship = (link.relationship || '').toLowerCase();
      return relationship.includes('mention');
    });

    console.log(`Found ${mentionedInLinks.length} "mentioned in" links\n`);

    mentionedInLinks.forEach((link, index) => {
      const object = link.object || {};
      const url = object.url || '';
      const title = (object.title || '').toLowerCase();
      
      console.log(`${index + 1}. Title: ${object.title || '(none)'}`);
      console.log(`   URL: ${url}`);
      
      // Check if it's a Confluence link
      if (url.includes('confluence')) {
        const pageIdMatch = url.match(/pageId=(\d+)/);
        const pageId = pageIdMatch ? pageIdMatch[1] : null;
        
        if (pageId) {
          console.log(`   Page ID: ${pageId}`);
          
          // Try to fetch page title
          const confluenceBaseUrl = url.includes('confluence.eng.nutanix.com') 
            ? 'https://confluence.eng.nutanix.com:8443'
            : 'https://nutanix.atlassian.net/wiki';
          
          axios.get(
            `${confluenceBaseUrl}/rest/api/content/${pageId}`,
            {
              headers: {
                'Authorization': `Bearer ${TEST_CONFIG.confluenceToken}`,
                'Accept': 'application/json'
              },
              params: {
                expand: 'title,metadata.labels'
              },
              timeout: 10000
            }
          ).then(pageResponse => {
            if (pageResponse.data) {
              console.log(`   ✅ Page Title: "${pageResponse.data.title}"`);
              if (pageResponse.data.metadata?.labels?.results) {
                const labels = pageResponse.data.metadata.labels.results.map(l => l.name);
                console.log(`   🏷️  Labels: ${labels.join(', ') || '(none)'}`);
                
                // Check if it's CG or PG Readiness
                const titleLower = pageResponse.data.title.toLowerCase();
                const labelText = labels.map(l => l.toLowerCase()).join(' ');
                const combined = (titleLower + ' ' + labelText).toLowerCase();
                
                const isCG = combined.includes('cg') && (combined.includes('readiness') || combined.includes('checklist') || combined.includes('completion'));
                const isPG = combined.includes('pg') && (combined.includes('readiness') || combined.includes('checklist') || combined.includes('completion'));
                
                if (isCG) {
                  console.log(`   🎯 → THIS IS A CG READINESS PAGE!`);
                } else if (isPG) {
                  console.log(`   🎯 → THIS IS A PG READINESS PAGE!`);
                }
              }
            }
          }).catch(err => {
            console.log(`   ❌ Error fetching page: ${err.message}`);
          });
        }
      }
    });

    // Wait a bit for async page fetches
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('\n' + '='.repeat(80));
    console.log('✅ Test completed');
    console.log('='.repeat(80) + '\n');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

if (require.main === module) {
  testRemoteLinksDetailed().catch(error => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  });
}

module.exports = { testRemoteLinksDetailed };

