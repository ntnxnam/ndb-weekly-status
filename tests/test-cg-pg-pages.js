/**
 * Test script to verify CG and PG Readiness pages are fetched correctly
 * Run with: node tests/test-cg-pg-pages.js
 */

const axios = require('axios');
require('dotenv').config();

const TEST_CONFIG = {
  baseUrl: 'http://localhost:7842',
  jiraToken: process.env.JIRA_API_TOKEN,
  confluenceToken: process.env.CONFLUENCE_API_TOKEN,
  testIssueKey: 'FEAT-18289' // Known to have CG/PG Readiness links
};

async function testCGPGFetching() {
  console.log('\n' + '='.repeat(80));
  console.log('🧪 Testing CG/PG Readiness Page Fetching');
  console.log('='.repeat(80));
  console.log(`\nTest Issue: ${TEST_CONFIG.testIssueKey}`);
  console.log(`Base URL: ${TEST_CONFIG.baseUrl}\n`);

  try {
    // Step 1: Fetch data for the test issue
    console.log('📥 Step 1: Fetching issue data...');
    const fetchResponse = await axios.get(
      `${TEST_CONFIG.baseUrl}/api/fetch-all-data`,
      {
        params: {
          jql: `key = ${TEST_CONFIG.testIssueKey}`
        },
        headers: {
          'x-jira-token': TEST_CONFIG.jiraToken
        },
        timeout: 60000
      }
    );

    if (!fetchResponse.data || !fetchResponse.data.issues || fetchResponse.data.issues.length === 0) {
      console.error(`❌ Issue ${TEST_CONFIG.testIssueKey} not found`);
      return;
    }

    const issue = fetchResponse.data.issues[0];
    console.log(`✅ Issue found: ${issue.key} - ${issue.summary || 'No summary'}\n`);

    // Step 2: Check for _readinessLinks structure
    console.log('🔍 Step 2: Checking for CG/PG Readiness links...');
    console.log(`   _readinessLinks present: ${issue._readinessLinks ? 'Yes' : 'No'}`);
    
    if (issue._readinessLinks) {
      console.log(`   CG Readiness link: ${issue._readinessLinks.cg || 'Not found'}`);
      console.log(`   PG Readiness link: ${issue._readinessLinks.pg || 'Not found'}\n`);
    } else {
      console.log('   ⚠️  _readinessLinks structure not present\n');
    }

    // Step 3: Check formatted issue fields
    console.log('🔍 Step 3: Checking formatted issue fields...');
    const formattedIssue = fetchResponse.data.issues[0];
    console.log(`   CG field (cg): ${formattedIssue.cg || 'Not found'}`);
    console.log(`   PG field (pg): ${formattedIssue.pg || 'Not found'}\n`);

    // Step 4: Verify Confluence page accessibility
    // Check both _readinessLinks and formatted fields
    const cgLink = issue._readinessLinks?.cg || formattedIssue.cg;
    const pgLink = issue._readinessLinks?.pg || formattedIssue.pg;
    
    if (cgLink) {
      console.log('🌐 Step 4a: Testing CG Readiness page accessibility...');
      try {
        const cgUrl = cgLink;
        const pageIdMatch = cgUrl.match(/pageId=(\d+)/);
        const pageId = pageIdMatch ? pageIdMatch[1] : null;
        
        if (pageId) {
          console.log(`   Page ID: ${pageId}`);
          console.log(`   URL: ${cgUrl}`);
          
          // Try to fetch page title from Confluence
          const confluenceBaseUrl = cgUrl.includes('confluence.eng.nutanix.com') 
            ? 'https://confluence.eng.nutanix.com:8443'
            : 'https://nutanix.atlassian.net/wiki';
          
          const pageResponse = await axios.get(
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
          );
          
          if (pageResponse.data) {
            console.log(`   ✅ Page Title: "${pageResponse.data.title}"`);
            if (pageResponse.data.metadata?.labels?.results) {
              const labels = pageResponse.data.metadata.labels.results.map(l => l.name);
              console.log(`   🏷️  Labels: ${labels.join(', ') || '(none)'}`);
            }
            console.log(`   ✅ CG Readiness page is accessible\n`);
          }
        } else {
          console.log(`   ⚠️  Could not extract page ID from URL\n`);
        }
      } catch (error) {
        console.log(`   ❌ Error accessing CG page: ${error.message}\n`);
      }
    } else {
      console.log('   ⚠️  No CG Readiness link found, skipping page test\n');
    }

    if (pgLink) {
      console.log('🌐 Step 4b: Testing PG Readiness page accessibility...');
      try {
        const pgUrl = pgLink;
        const pageIdMatch = pgUrl.match(/pageId=(\d+)/);
        const pageId = pageIdMatch ? pageIdMatch[1] : null;
        
        if (pageId) {
          console.log(`   Page ID: ${pageId}`);
          console.log(`   URL: ${pgUrl}`);
          
          // Try to fetch page title from Confluence
          const confluenceBaseUrl = pgUrl.includes('confluence.eng.nutanix.com') 
            ? 'https://confluence.eng.nutanix.com:8443'
            : 'https://nutanix.atlassian.net/wiki';
          
          const pageResponse = await axios.get(
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
          );
          
          if (pageResponse.data) {
            console.log(`   ✅ Page Title: "${pageResponse.data.title}"`);
            if (pageResponse.data.metadata?.labels?.results) {
              const labels = pageResponse.data.metadata.labels.results.map(l => l.name);
              console.log(`   🏷️  Labels: ${labels.join(', ') || '(none)'}`);
            }
            console.log(`   ✅ PG Readiness page is accessible\n`);
          }
        } else {
          console.log(`   ⚠️  Could not extract page ID from URL\n`);
        }
      } catch (error) {
        console.log(`   ❌ Error accessing PG page: ${error.message}\n`);
      }
    } else {
      console.log('   ⚠️  No PG Readiness link found, skipping page test\n');
    }

    // Summary
    console.log('='.repeat(80));
    console.log('📊 Summary:');
    console.log('='.repeat(80));
    const hasCG = !!cgLink;
    const hasPG = !!pgLink;
    
    console.log(`✅ CG Readiness: ${hasCG ? '✅ Found' : '❌ Not found'}`);
    if (hasCG) {
      console.log(`   Link: ${cgLink}`);
    }
    
    console.log(`✅ PG Readiness: ${hasPG ? '✅ Found' : '❌ Not found'}`);
    if (hasPG) {
      console.log(`   Link: ${pgLink}`);
    }
    
    if (hasCG && hasPG) {
      console.log('\n🎉 SUCCESS: Both CG and PG Readiness pages are being fetched correctly!');
    } else if (hasCG || hasPG) {
      console.log('\n⚠️  PARTIAL: Some Readiness links found, but not both.');
    } else {
      console.log('\n❌ FAILED: No CG/PG Readiness links found.');
      console.log('   This may be expected if the issue does not have remote links.');
    }
    
    console.log('='.repeat(80) + '\n');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
    process.exit(1);
  }
}

// Run test
if (require.main === module) {
  testCGPGFetching().catch(error => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  });
}

module.exports = { testCGPGFetching };

