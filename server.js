const express = require('express');
const cors = require('cors');
const JiraClient = require('./jira-client-clean');
const ConfluenceClient = require('./confluence-client');
const TextProcessor = require('./text-processor');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();

// Load port from config or environment variable
function getPort() {
  // Try environment variable first
  if (process.env.PORT) {
    return parseInt(process.env.PORT);
  }
  
  // Try to load from config.json
  try {
    const configPath = path.join(__dirname, 'config.json');
    const configData = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configData);
    return config.server?.port || 7842;
  } catch (error) {
    // Default to 3001 if config not found
    return 3001;
  }
}

const port = getPort();

// Helper function to extract page title from URL (module-level for reuse)
const extractTitleFromUrl = (url) => {
  if (!url) return null;
  
  // Pattern: /pages/123456789/Page+Title or /pages/123456789/Page-Title
  const titleMatch = url.match(/\/pages\/\d+\/([^\/\?]+)/);
  if (titleMatch) {
    let title = decodeURIComponent(titleMatch[1]);
    // Replace + and - with spaces, clean up
    title = title.replace(/\+/g, ' ').replace(/-/g, ' ').trim();
    return title;
  }
  
  // Pattern: ?title=Page+Title
  const titleParamMatch = url.match(/[?&]title=([^&]+)/);
  if (titleParamMatch) {
    let title = decodeURIComponent(titleParamMatch[1]);
    title = title.replace(/\+/g, ' ').trim();
    return title;
  }
  
  return null;
};

// Helper function to fetch remote links for issues
async function fetchRemoteLinksForIssues(issues, userToken) {
  const axios = require('axios');
  const fs = require('fs');
  const path = require('path');
  
  const configPath = path.join(__dirname, 'config.json');
  const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const baseUrl = configData.jira.baseUrl.replace(/\/$/, '');
  
  // Get token from userToken, environment variable, or config
  let tokenToUse = userToken;
  if (!tokenToUse) {
    // Try environment variable first
    if (process.env.JIRA_API_TOKEN) {
      tokenToUse = process.env.JIRA_API_TOKEN.trim();
    } else {
      // Fallback to config.json (for backward compatibility)
      try {
        const configPath = path.join(__dirname, 'config.json');
        const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (configData.jira && configData.jira.apiToken) {
          tokenToUse = configData.jira.apiToken;
        }
      } catch (err) {
        console.log('⚠️ Could not load token for remote links');
        return {
          mentionedIn: {},
          allConfluence: {}
        };
      }
    }
  }
  
  if (!tokenToUse) {
    console.log('⚠️ [fetchRemoteLinksForIssues] No token available for fetching remote links');
    return {
      mentionedIn: {},
      allConfluence: {}
    };
  }
  
  const remoteLinksMap = {};
  const allConfluenceLinksMap = {}; // Store all Confluence links with details
  
  console.log(`🔗 [fetchRemoteLinksForIssues] Fetching remote links for ${issues.length} issues...`);
  
  // Fetch remote links in batches
  const batchSize = 10;
  let fetchedCount = 0;
  let errorCount = 0;
  
  // Helper function to extract page ID from URL
  const extractPageId = (url) => {
    if (!url) return null;
    const pageIdParamMatch = url.match(/pageId=(\d+)/);
    if (pageIdParamMatch) return pageIdParamMatch[1];
    const pagesPathMatch = url.match(/\/pages\/(\d+)/);
    if (pagesPathMatch) return pagesPathMatch[1];
    const pagesMatch = url.match(/pages\/(\d+)/);
    if (pagesMatch) return pagesMatch[1];
    return null;
  };
  
  for (let i = 0; i < issues.length; i += batchSize) {
    const batch = issues.slice(i, i + batchSize);
    const promises = batch.map(async (issue) => {
      try {
        const remoteLinksResponse = await axios.get(`${baseUrl}/rest/api/2/issue/${issue.key}/remotelink`, {
          headers: {
            'Authorization': `Bearer ${tokenToUse}`,
            'Accept': 'application/json'
          },
          timeout: 10000
        });
        
        if (remoteLinksResponse.data && Array.isArray(remoteLinksResponse.data)) {
          // Filter for "mentioned in" links (for CG/PG Readiness)
          const mentionedInLinks = remoteLinksResponse.data.filter(link => {
            const relationship = (link.relationship || '').toLowerCase();
            return relationship.includes('mention');
          });
          
          if (mentionedInLinks.length > 0) {
            remoteLinksMap[issue.key] = mentionedInLinks;
            fetchedCount++;
            console.log(`  ✅ ${issue.key}: Found ${mentionedInLinks.length} "mentioned in" links`);
          }
          
          // Extract ALL Confluence links (not just "mentioned in")
          const confluenceLinks = remoteLinksResponse.data
            .map(link => {
              const object = link.object || {};
              const url = object.url || '';
              
              // Check if it's a Confluence URL
              if (url && (
                url.includes('confluence') || 
                url.includes('atlassian.net/wiki') ||
                url.includes('confluence.eng.nutanix.com')
              )) {
                const pageId = extractPageId(url);
                // Extract title from URL (works even without API authentication)
                const titleFromUrl = extractTitleFromUrl(url);
                return {
                  url: url,
                  pageId: pageId,
                  title: object.title || titleFromUrl || '',
                  relationship: link.relationship || ''
                };
              }
              return null;
            })
            .filter(link => link !== null);
          
          if (confluenceLinks.length > 0) {
            allConfluenceLinksMap[issue.key] = confluenceLinks;
            console.log(`  📄 ${issue.key}: Found ${confluenceLinks.length} Confluence link(s)`);
          }
        }
      } catch (err) {
        errorCount++;
        // Log errors for debugging (but don't fail completely)
        if (err.response) {
          if (err.response.status !== 404) { // 404 is expected for issues without remote links
            console.log(`  ⚠️ ${issue.key}: Error ${err.response.status} - ${err.response.statusText}`);
          }
        } else {
          console.log(`  ⚠️ ${issue.key}: ${err.message}`);
        }
      }
    });
    
    await Promise.all(promises);
    // Small delay between batches to avoid rate limiting
    if (i + batchSize < issues.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  console.log(`✅ [fetchRemoteLinksForIssues] Fetched remote links for ${fetchedCount} issues (${errorCount} errors)`);
  console.log(`✅ [fetchRemoteLinksForIssues] Found Confluence links for ${Object.keys(allConfluenceLinksMap).length} issues`);
  
  
  // Return both maps
  return {
    mentionedIn: remoteLinksMap,
    allConfluence: allConfluenceLinksMap
  };
}

// Helper function to extract version for label matching
// Converts "NDB-2.10" -> "210" for matching "ndb-210-cg-checklist"
function extractVersionForLabel(fixVersions) {
  if (!fixVersions || !Array.isArray(fixVersions) || fixVersions.length === 0) {
    return null;
  }
  
  // Get first fixVersion
  const version = fixVersions[0];
  const versionName = typeof version === 'string' ? version : (version.name || version.toString());
  
  // Extract version number: "NDB-2.10" -> "210", "2.10" -> "210"
  const match = versionName.match(/(?:NDB-)?(\d+)\.(\d+)/i);
  if (match) {
    return match[1] + match[2]; // "2.10" -> "210"
  }
  
  return null;
}

// Helper function to find CG/PG Readiness link from remote links
// Enhanced to fetch page titles from Confluence API for better identification
// Now validates status and fixVersion before returning links
async function findReadinessLink(remoteLinks, type, confluenceClient, confluenceToken, issue = null) {
  if (!Array.isArray(remoteLinks) || remoteLinks.length === 0) {
    if (issue) {
      console.log(`⏭️ [findReadinessLink] ${issue.key}: No remote links found for ${type}`);
    }
    return 'No link';
  }
  
  console.log(`🔍 [findReadinessLink] ${issue ? issue.key : 'Unknown'}: Checking ${remoteLinks.length} remote links for ${type}`);
  
  // Simplified: Just check page titles for "CG Readiness" or "PG Readiness"
  // No status or fixVersion validation needed
  const searchTerm = type === 'CG Readiness' ? 'cg readiness' : 'pg readiness';
  
  console.log(`🔍 [findReadinessLink] Looking for ${type} in ${remoteLinks.length} remote links`);
  
  // Fetch page titles from Confluence API for all links
  // Skip quick check - always fetch page titles to get accurate names
  if (confluenceClient && (confluenceToken || confluenceClient.token)) {
    console.log(`🔍 [findReadinessLink] Fetching page titles from Confluence for all links...`);
    
    for (let idx = 0; idx < remoteLinks.length; idx++) {
      const link = remoteLinks[idx];
      const object = link.object || {};
      const url = object.url || '';
      const genericTitle = (object.title || '').toLowerCase();
      
      // Process all links (not just generic titles) to ensure we check all Confluence pages
      // This handles cases where the remote link title might be different from the actual page title
      try {
        // Fetch actual page title from Confluence
        // Use Confluence token, not Jira token (userToken)
        const pageTitle = await confluenceClient.getPageTitle(url, confluenceToken);
        
        if (pageTitle) {
          const titleLower = pageTitle.toLowerCase();
          
          // Also try to fetch labels
          let labels = [];
          try {
            const pageId = confluenceClient.extractPageId(url);
            if (pageId) {
              const axios = require('axios');
              // Use the base URL from Confluence client (which reads from .env)
              let baseUrl = confluenceClient.baseUrl;
              
              console.log(`🔍 [findReadinessLink] Fetching page ${pageId} from ${baseUrl} for ${type}`);
              
              // Clean token the same way Jira does - remove whitespace and newlines
              const tokenToUse = confluenceToken || confluenceClient.token;
              const cleanToken = tokenToUse ? tokenToUse.trim().replace(/\r?\n/g, '') : null;
              
              // According to Confluence REST API v1: GET /rest/api/content/{id}
              // expand parameter can include: version, metadata.labels, body.storage, etc.
              // Try Basic Auth first (email:token), then Bearer token
              const email = process.env.CONFLUENCE_EMAIL || 'namratha.singh@nutanix.com';
              let response;
              
              try {
                // Try Basic Auth first
                const basicAuth = Buffer.from(`${email}:${cleanToken}`).toString('base64');
                response = await axios.get(`${baseUrl}/rest/api/content/${pageId}`, {
                  headers: {
                    'Authorization': `Basic ${basicAuth}`,
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
                
                if (response.status !== 200) {
                  throw new Error(`HTTP ${response.status}`);
                }
              } catch (basicError) {
                // Fall back to Bearer token
                response = await axios.get(`${baseUrl}/rest/api/content/${pageId}`, {
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
              }
              
              if (response.data && response.data.metadata && response.data.metadata.labels) {
                labels = response.data.metadata.labels.results || [];
                console.log(`✅ [findReadinessLink] Page "${pageTitle}" has labels: ${labels.map(l => l.name).join(', ')}`);
              }
            } else {
              console.log(`⚠️ [findReadinessLink] Could not extract pageId from URL: ${url.substring(0, 100)}`);
            }
          } catch (labelError) {
            console.log(`⚠️ [findReadinessLink] Error fetching labels for ${url.substring(0, 100)}: ${labelError.message}`);
            // Labels fetch failed, continue with just title
          }
          
          // Simple check: Does the page title contain "CG Readiness" or "PG Readiness"?
          const titleMatches = titleLower.includes(searchTerm);
          
          console.log(`🔍 [findReadinessLink] Checking "${pageTitle}" for ${type}: titleMatches=${titleMatches}`);
          
          if (titleMatches) {
            console.log(`✅ [findReadinessLink] Found ${type} link by page title: "${pageTitle}" - ${url}`);
            if (labels.length > 0) {
              console.log(`   Labels: ${labels.map(l => l.name).join(', ')}`);
            }
            return url;
          } else {
            console.log(`⏭️ [findReadinessLink] Page "${pageTitle}" doesn't match ${type} (looking for "${searchTerm}")`);
          }
        } else {
          console.log(`⚠️ [findReadinessLink] Could not fetch page title for ${url.substring(0, 100)}`);
        }
      } catch (err) {
        // Log error but continue to next link
        console.log(`   ⚠️ Error fetching page for ${url.substring(0, 100)}: ${err.message}`);
        if (err.response) {
          console.log(`   Status: ${err.response.status}, Data: ${JSON.stringify(err.response.data).substring(0, 200)}`);
        }
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  console.log(`❌ [findReadinessLink] No ${type} link found`);
  return 'No link';
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize Jira client
let jiraClient;
try {
  console.log('🔧 [Server] Initializing Jira client...');
  jiraClient = new JiraClient();
  console.log('✅ [Server] Jira client initialized successfully');
} catch (error) {
  console.error('❌ [Server] Failed to initialize Jira client:', {
    message: error.message,
    stack: error.stack
  });
  console.error('❌ [Server] Please check your configuration files (config.json, .env)');
  process.exit(1);
}

// Initialize Confluence client
let confluenceClient;
try {
  console.log('🔧 [Server] Initializing Confluence client...');
  confluenceClient = new ConfluenceClient();
  console.log('✅ [Server] Confluence client initialized successfully');
} catch (error) {
  console.warn('⚠️ [Server] Confluence client initialization failed (will use token from request):', error.message);
  confluenceClient = new ConfluenceClient(); // Create anyway, will use token from request
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Fetch all data (expensive operation)
app.get('/api/fetch-all-data', async (req, res) => {
  const startTime = Date.now();
  try {
    const jql = req.query.jql; // Optional custom JQL query
    const userToken = req.headers['x-jira-token']; // Token from frontend
    
    if (!userToken) {
      return res.status(401).json({
        success: false,
        error: 'No authentication token provided. Please authenticate first using the Authenticate button.'
      });
    }
    
    console.log(`📥 [API] /api/fetch-all-data - JQL: ${jql || 'default'}`);
    console.log(`📥 [API] /api/fetch-all-data - Using user-provided token`);
    
    const data = await jiraClient.fetchAllData(jql, userToken);
    
    // Fetch remote links for CG/PG Readiness and ALL Confluence links
    console.log(`🔗 [API] Fetching remote links for ${data.issues.length} issues...`);
    const remoteLinksResult = await fetchRemoteLinksForIssues(data.issues, userToken);
    const remoteLinksMap = remoteLinksResult.mentionedIn || {};
    const allConfluenceLinksMap = remoteLinksResult.allConfluence || {};
    
    // Enrich issues with CG/PG Readiness links from remote links
    // Use async map to fetch page titles from Confluence for better identification
    console.log(`🔍 [API] Identifying CG/PG Readiness links by fetching page titles...`);
    
    // Get Confluence token - prioritize Jira token (userToken) since same PAT works for both
    // Get Confluence token from request header, or use Jira PAT token, or fall back to .env
    const confluenceTokenFromHeader = req.headers['x-confluence-token'];
    const confluenceToken = confluenceTokenFromHeader || userToken || process.env.CONFLUENCE_API_TOKEN || confluenceClient.token;
    console.log(`🔑 [API] Using Confluence token: ${confluenceToken ? (confluenceToken === confluenceTokenFromHeader ? 'Yes (from X-Confluence-Token header)' : (confluenceToken === userToken ? 'Yes (using Jira PAT token - same token works for both)' : (confluenceToken === process.env.CONFLUENCE_API_TOKEN ? 'Yes (from CONFLUENCE_API_TOKEN in .env)' : 'Yes (from Confluence client)'))) : 'No'}`);
    
    const enrichedIssues = await Promise.all(data.issues.map(async (issue) => {
      const remoteLinks = remoteLinksMap[issue.key] || [];
      const allConfluenceLinks = allConfluenceLinksMap[issue.key] || [];
      
      // Filter CG and PG Readiness links based on extracted titles from URLs
      // Titles were already extracted in fetchRemoteLinksForIssues using extractTitleFromUrl
      // Also check the URL itself in case title extraction didn't work
      // If URLs are in format /pages/viewpage.action?pageId=..., we can't extract title from URL
      // So we'll show all Confluence links and let the frontend extract titles or show as "Link 1", "Link 2"
      const cgLinks = allConfluenceLinks
        .filter(link => {
          const title = (link.title || '').toLowerCase();
          const url = (link.url || '').toLowerCase();
          // Check if title or URL contains CG-related keywords
          return title.includes('cg readiness') || title.includes('cg checklist') || 
                 url.includes('cg+readiness') || url.includes('cg-readiness') ||
                 url.includes('cg+checklist') || url.includes('cg-checklist');
        })
        .map(link => {
          // Try to extract title from URL, or use existing title, or generate a fallback
          const extractedTitle = extractTitleFromUrl(link.url);
          return { 
            url: link.url, 
            title: link.title && link.title !== 'Page' ? link.title : (extractedTitle || 'CG Readiness')
          };
        });
      
      const pgLinks = allConfluenceLinks
        .filter(link => {
          const title = (link.title || '').toLowerCase();
          const url = (link.url || '').toLowerCase();
          // Check if title or URL contains PG-related keywords
          return title.includes('pg readiness') || title.includes('pg checklist') ||
                 url.includes('pg+readiness') || url.includes('pg-readiness') ||
                 url.includes('pg+checklist') || url.includes('pg-checklist');
        })
        .map(link => {
          // Try to extract title from URL, or use existing title, or generate a fallback
          const extractedTitle = extractTitleFromUrl(link.url);
          return { 
            url: link.url, 
            title: link.title && link.title !== 'Page' ? link.title : (extractedTitle || 'PG Readiness')
          };
        });
      
      // If no CG/PG links found, show all Confluence links as fallback
      // This ensures users see the links even if filtering doesn't match
      if (cgLinks.length === 0 && pgLinks.length === 0 && allConfluenceLinks.length > 0) {
        // Show all links in both columns as fallback
        console.log(`📋 [API] ${issue.key}: No CG/PG links matched, showing all ${allConfluenceLinks.length} Confluence links as fallback`);
        issue._readinessLinks = {
          cg: allConfluenceLinks.map((link, idx) => {
            const extractedTitle = extractTitleFromUrl(link.url);
            return { 
              url: link.url, 
              title: link.title && link.title !== 'Page' ? link.title : (extractedTitle || `Link ${idx + 1}`)
            };
          }),
          pg: allConfluenceLinks.map((link, idx) => {
            const extractedTitle = extractTitleFromUrl(link.url);
            return { 
              url: link.url, 
              title: link.title && link.title !== 'Page' ? link.title : (extractedTitle || `Link ${idx + 1}`)
            };
          })
        };
        console.log(`✅ [API] ${issue.key}: Set ${issue._readinessLinks.cg.length} links in CG column, ${issue._readinessLinks.pg.length} links in PG column`);
      } else {
        // Store filtered links
        console.log(`📋 [API] ${issue.key}: Using filtered links - CG: ${cgLinks.length}, PG: ${pgLinks.length}`);
        issue._readinessLinks = {
          cg: cgLinks.length > 0 ? cgLinks : null,
          pg: pgLinks.length > 0 ? pgLinks : null
        };
      }
      
      // Extract readiness links for logging
      const cgReadinessLink = issue._readinessLinks.cg || null;
      const pgReadinessLink = issue._readinessLinks.pg || null;
      
      // Also store individual links for potential future use
      issue._allConfluenceLinks = allConfluenceLinks;
      
      
      // Store ALL Confluence links (with URL, pageId, title, relationship)
      issue._allConfluenceLinks = allConfluenceLinks;
      
      // Log for debugging
      if (allConfluenceLinks.length > 0) {
        console.log(`✅ [API] ${issue.key}: Found ${allConfluenceLinks.length} Confluence link(s)`);
      }
      if (cgReadinessLink && cgReadinessLink !== 'No link') {
        console.log(`✅ [API] ${issue.key}: CG=Yes`);
      }
      if (pgReadinessLink && pgReadinessLink !== 'No link') {
        console.log(`✅ [API] ${issue.key}: PG=Yes`);
      }
      
      return issue;
    }));
    
    // Calculate story points for each feature/initiative (only for FEAT/INITIATIVE types)
    console.log(`📊 [API] Calculating story points for features/initiatives...`);
    
    const featuresWithStoryPoints = enrichedIssues.map(issue => {
      // Only calculate for FEAT/INITIATIVE types
      const issueType = (issue.fields?.issuetype?.name || issue.fields?.issuetype || '').toLowerCase();
      const isFeatureOrInitiative = issueType.includes('feature') || issueType.includes('initiative') || issueType.includes('x-feat');
      
      if (!isFeatureOrInitiative) {
        // Not a feature/initiative, skip story points calculation
        return issue;
      }
      
      try {
        // Use already-fetched issues instead of making another API call
        const storyPointsData = calculateStoryPointsFromFetchedIssues(issue.key, data.issues);
        issue._storyPoints = storyPointsData;
        console.log(`📊 [API] ${issue.key}: Story Points - Done: ${storyPointsData.done}, Pending: ${storyPointsData.pending}, Won't Fix: ${storyPointsData.wontFix}, Total: ${storyPointsData.total}`);
      } catch (error) {
        console.error(`❌ [API] Failed to calculate story points for ${issue.key}: ${error.message}`);
        // Set default values on error
        issue._storyPoints = {
          done: 0,
          pending: 0,
          wontFix: 0,
          total: 0,
          error: error.message
        };
      }
      
      return issue;
    });
    
    // Format issues with calculated story points
    const formattedIssues = jiraClient.formatIssues(featuresWithStoryPoints, true);
    
    const duration = Date.now() - startTime;
    console.log(`✅ [API] /api/fetch-all-data - Success in ${duration}ms - ${formattedIssues.length} issues`);
    
    res.json({
      success: true,
      total: data.total,
      issues: formattedIssues,
      message: 'All data fetched successfully'
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ [API] /api/fetch-all-data - Failed after ${duration}ms:`, {
      message: error.message,
      stack: error.stack,
      query: req.query
    });
    
    const statusCode = error.response?.status || 500;
    res.status(statusCode).json({
      success: false,
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Refresh columns (uses configured columns only)
app.get('/api/refresh-columns', async (req, res) => {
  const startTime = Date.now();
  try {
    const jql = req.query.jql; // Optional custom JQL query
    const userToken = req.headers['x-jira-token']; // Token from frontend
    
    if (!userToken) {
      return res.status(401).json({
        success: false,
        error: 'No authentication token provided. Please authenticate first using the Authenticate button.'
      });
    }
    
    console.log(`📥 [API] /api/refresh-columns - JQL: ${jql || 'default'}`);
    console.log(`📥 [API] /api/refresh-columns - Using user-provided token`);
    
    const data = await jiraClient.refreshColumns(jql, userToken);
    
    // Fetch remote links for CG/PG Readiness and ALL Confluence links (same as /api/fetch-all-data)
    console.log(`🔗 [API] /api/refresh-columns - Fetching remote links for ${data.issues.length} issues...`);
    const remoteLinksResult = await fetchRemoteLinksForIssues(data.issues, userToken);
    const remoteLinksMap = remoteLinksResult.mentionedIn || {};
    const allConfluenceLinksMap = remoteLinksResult.allConfluence || {};
    
    // Enrich issues with CG/PG Readiness links from remote links
    console.log(`🔍 [API] /api/refresh-columns - Identifying CG/PG Readiness links...`);
    
    // Get Confluence token from request header, or use Jira PAT token, or fall back to .env
    const confluenceTokenFromHeader = req.headers['x-confluence-token'];
    const confluenceToken = confluenceTokenFromHeader || userToken || process.env.CONFLUENCE_API_TOKEN || confluenceClient.token;
    
    const enrichedIssues = await Promise.all(data.issues.map(async (issue) => {
      const remoteLinks = remoteLinksMap[issue.key] || [];
      const allConfluenceLinks = allConfluenceLinksMap[issue.key] || [];
      
      // Filter CG and PG Readiness links based on extracted titles from URLs
      const cgLinks = allConfluenceLinks
        .filter(link => {
          const title = (link.title || '').toLowerCase();
          const url = (link.url || '').toLowerCase();
          return title.includes('cg readiness') || title.includes('cg checklist') || 
                 url.includes('cg+readiness') || url.includes('cg-readiness') ||
                 url.includes('cg+checklist') || url.includes('cg-checklist');
        })
        .map(link => {
          const extractedTitle = extractTitleFromUrl(link.url);
          return { 
            url: link.url, 
            title: link.title && link.title !== 'Page' ? link.title : (extractedTitle || 'CG Readiness')
          };
        });
      
      const pgLinks = allConfluenceLinks
        .filter(link => {
          const title = (link.title || '').toLowerCase();
          const url = (link.url || '').toLowerCase();
          return title.includes('pg readiness') || title.includes('pg checklist') ||
                 url.includes('pg+readiness') || url.includes('pg-readiness') ||
                 url.includes('pg+checklist') || url.includes('pg-checklist');
        })
        .map(link => {
          const extractedTitle = extractTitleFromUrl(link.url);
          return { 
            url: link.url, 
            title: link.title && link.title !== 'Page' ? link.title : (extractedTitle || 'PG Readiness')
          };
        });
      
      // If no CG/PG links found, show all Confluence links as fallback
      if (cgLinks.length === 0 && pgLinks.length === 0 && allConfluenceLinks.length > 0) {
        issue._readinessLinks = {
          cg: allConfluenceLinks.map((link, idx) => {
            const extractedTitle = extractTitleFromUrl(link.url);
            return { 
              url: link.url, 
              title: link.title && link.title !== 'Page' ? link.title : (extractedTitle || `Link ${idx + 1}`)
            };
          }),
          pg: allConfluenceLinks.map((link, idx) => {
            const extractedTitle = extractTitleFromUrl(link.url);
            return { 
              url: link.url, 
              title: link.title && link.title !== 'Page' ? link.title : (extractedTitle || `Link ${idx + 1}`)
            };
          })
        };
      } else {
        issue._readinessLinks = {
          cg: cgLinks.length > 0 ? cgLinks : null,
          pg: pgLinks.length > 0 ? pgLinks : null
        };
      }
      
      issue._allConfluenceLinks = allConfluenceLinks;
      return issue;
    }));
    
    const formattedIssues = jiraClient.formatIssues(enrichedIssues, true);
    
    const duration = Date.now() - startTime;
    console.log(`✅ [API] /api/refresh-columns - Success in ${duration}ms - ${formattedIssues.length} issues`);
    
    res.json({
      success: true,
      total: data.total,
      issues: formattedIssues,
      message: 'Columns refreshed successfully'
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ [API] /api/refresh-columns - Failed after ${duration}ms:`, {
      message: error.message,
      stack: error.stack,
      query: req.query
    });
    
    const statusCode = error.response?.status || 500;
    res.status(statusCode).json({
      success: false,
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Legacy endpoint for backward compatibility
app.get('/api/issues', async (req, res) => {
  try {
    const jql = req.query.jql; // Optional custom JQL query
    const data = await jiraClient.refreshColumns(jql);
    const formattedIssues = jiraClient.formatIssues(data.issues, false);
    
    res.json({
      success: true,
      total: data.total,
      issues: formattedIssues
    });
  } catch (error) {
    console.error('Error fetching issues:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/issue/:key', async (req, res) => {
  try {
    const issueKey = req.params.key;
    const issue = await jiraClient.getIssueDetails(issueKey);
    
    res.json({
      success: true,
      issue: issue
    });
  } catch (error) {
    console.error('Error fetching issue details:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/table-config', (req, res) => {
  try {
    const tableConfig = jiraClient.getTableConfig();
    res.json({
      success: true,
      config: tableConfig
    });
  } catch (error) {
    console.error('Error fetching table config:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/backend-config', (req, res) => {
  try {
    const backendConfig = jiraClient.getBackendConfig();
    res.json({
      success: true,
      config: backendConfig
    });
  } catch (error) {
    console.error('Error fetching backend config:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Fetch all field names from Jira
app.get('/api/field-names', async (req, res) => {
  try {
    const userToken = req.headers['x-jira-token'];
    
    if (!userToken) {
      return res.status(401).json({
        success: false,
        error: 'No authentication token provided. Please authenticate first.'
      });
    }
    
    const jiraConfig = jiraClient.configManager.getJiraConfig();
    const baseUrl = jiraConfig.baseUrl.replace(/\/$/, '');
    const cleanToken = userToken.trim().replace(/\r?\n/g, '');
    
    const axios = require('axios');
    const fieldsUrl = `${baseUrl}/rest/api/2/field`;
    
    console.log(`📋 [API] /api/field-names - Fetching from: ${fieldsUrl}`);
    
    const fieldsResponse = await axios.get(fieldsUrl, {
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
    
    if (fieldsResponse.status !== 200) {
      console.error(`❌ [API] /api/field-names - Non-200 status: ${fieldsResponse.status}`);
      console.error(`❌ [API] Response data:`, fieldsResponse.data);
      throw new Error(`Failed to fetch field names: HTTP ${fieldsResponse.status}`);
    }
    
    const fieldMap = {};
    if (fieldsResponse.data && Array.isArray(fieldsResponse.data)) {
      fieldsResponse.data.forEach(field => {
        if (field.id && field.name) {
        fieldMap[field.id] = field.name;
        // Also map by key if different from id
        if (field.key && field.key !== field.id) {
          fieldMap[field.key] = field.name;
          }
        }
      });
    }
    
    console.log(`📋 [API] /api/field-names - Loaded ${Object.keys(fieldMap).length} field names`);
    
    // Log specific custom fields
    if (fieldMap['customfield_23073']) {
      console.log(`📋 [API] customfield_23073: "${fieldMap['customfield_23073']}"`);
    } else {
      console.warn(`⚠️ [API] customfield_23073 not found in response`);
    }
    if (fieldMap['customfield_23560']) {
      console.log(`📋 [API] customfield_23560: "${fieldMap['customfield_23560']}"`);
    } else {
      console.warn(`⚠️ [API] customfield_23560 not found in response`);
    }
    
    res.json({
      success: true,
      fieldMap: fieldMap,
      count: Object.keys(fieldMap).length
    });
  } catch (error) {
    console.error('❌ [API] /api/field-names - Error:', error.message);
    if (error.response) {
      console.error('❌ [API] Status:', error.response.status);
      console.error('❌ [API] Response data:', error.response.data);
    }
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.message || 'Failed to fetch field names'
    });
  }
});

app.post('/api/save-column-config', express.json(), (req, res) => {
  try {
    const { userColumns } = req.body;
    
    if (!Array.isArray(userColumns)) {
      return res.status(400).json({
        success: false,
        error: 'userColumns must be an array'
      });
    }
    
    const success = jiraClient.saveUserConfig(userColumns);
    
    if (success) {
      res.json({
        success: true,
        message: 'Column configuration saved successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to save column configuration'
      });
    }
  } catch (error) {
    console.error('Error saving column config:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/test-token', express.json(), async (req, res) => {
  const startTime = Date.now();
  try {
    const { token, email } = req.body;
    
    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Token is required'
      });
    }
    
    console.log(`🔐 [API] /api/test-token - Testing token authentication...`);
    
    // Test the token with PAT endpoint
    const axios = require('axios');
    const ConfigManager = require('./config');
    const configManager = new ConfigManager();
    const jiraConfig = configManager.getJiraConfig();
    const baseUrl = jiraConfig.baseUrl || 'https://jira.nutanix.com';
    const cleanBaseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    
    try {
      const testResponse = await axios.get(
        `${cleanBaseUrl}/rest/pat/latest/tokens`,
        {
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${token.trim()}`
          },
          timeout: 10000
        }
      );
      
      if (testResponse.status === 200 && Array.isArray(testResponse.data)) {
        console.log(`✅ [API] /api/test-token - Token is valid, found ${testResponse.data.length} tokens`);
        res.json({
          success: true,
          message: 'Token is valid',
          tokenCount: testResponse.data.length
        });
      } else {
        throw new Error('Invalid response from token endpoint');
      }
    } catch (error) {
      console.error('❌ [API] /api/test-token - Token test failed:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      
      if (error.response?.status === 401 || error.response?.status === 403) {
        return res.status(401).json({
          success: false,
          error: 'Invalid token. Please check your Bearer token (PAT).'
        });
      }
      
      throw error;
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ [API] /api/test-token - Failed after ${duration}ms:`, error.message);
    
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to test token'
    });
  }
});

// Fetch Confluence summary for a single page
app.get('/api/confluence/summary', async (req, res) => {
  const startTime = Date.now();
  try {
    const { url } = req.query;
    const userToken = req.headers['x-confluence-token'] || req.headers['x-jira-token'];
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'Confluence URL is required'
      });
    }
    
    // Validate URL format
    if (!url.includes('confluence') || (!url.includes('pageId=') && !url.includes('/pages/'))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Confluence URL format. Please provide a valid Confluence page URL.'
      });
    }
    
    console.log(`📄 [API] /api/confluence/summary - Fetching summary for: ${url}`);
    
    const result = await confluenceClient.getSummary(url, userToken);
    const duration = Date.now() - startTime;
    
    if (result.success) {
      console.log(`✅ [API] /api/confluence/summary - Success in ${duration}ms`);
    } else {
      console.log(`⚠️ [API] /api/confluence/summary - Failed in ${duration}ms: ${result.error}`);
      
      // Provide user-friendly error messages
      if (result.error && result.error.includes('token') || result.error.includes('Authentication')) {
        result.error = 'Authentication failed. Please check your Confluence API token configuration in the .env file.';
      } else if (result.error && result.error.includes('404')) {
        result.error = 'Confluence page not found. The page may have been moved or deleted.';
      } else if (result.error && result.error.includes('403')) {
        result.error = 'Access denied. You may not have permission to view this Confluence page.';
      } else if (result.error && result.error.includes('Unable to access')) {
        // Keep the user-friendly message from confluence-client.js
      } else {
        result.error = result.error || 'Unable to fetch Confluence summary. Please try again later.';
      }
    }
    
    res.json(result);
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ [API] /api/confluence/summary - Failed after ${duration}ms:`, error.message);
    
    // Provide user-friendly error messages
    let errorMessage = 'Unable to fetch Confluence summary';
    
    if (error.response) {
      if (error.response.status === 401 || error.response.status === 403) {
        errorMessage = 'Authentication failed. Please check your Confluence API token in the .env file.';
      } else if (error.response.status === 404) {
        errorMessage = 'Confluence page not found.';
      } else {
        errorMessage = `Unable to access Confluence (${error.response.status}). Please try again later.`;
      }
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    res.status(500).json({
      success: false,
      error: errorMessage
    });
  }
});

// Batch fetch Confluence summaries
app.post('/api/confluence/summaries', express.json(), async (req, res) => {
  const startTime = Date.now();
  try {
    const { urls } = req.body;
    const userToken = req.headers['x-confluence-token'] || req.headers['x-jira-token'];
    
    if (!urls || !Array.isArray(urls)) {
      return res.status(400).json({
        success: false,
        error: 'URLs array is required'
      });
    }
    
    console.log(`📄 [API] /api/confluence/summaries - Fetching ${urls.length} summaries`);
    
    const results = await confluenceClient.getSummaries(urls, userToken);
    const duration = Date.now() - startTime;
    
    console.log(`✅ [API] /api/confluence/summaries - Completed in ${duration}ms`);
    
    res.json({
      success: true,
      summaries: results
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ [API] /api/confluence/summaries - Failed after ${duration}ms:`, error.message);
    
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch Confluence summaries'
    });
  }
});

// Summarize text (for customfield_23073 and similar fields)
app.post('/api/summarize-text', express.json(), async (req, res) => {
  const startTime = Date.now();
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'Text is required'
      });
    }
    
    console.log(`📝 [API] /api/summarize-text - Summarizing text (${text.length} chars)`);
    
    const textProcessor = new TextProcessor();
    const result = textProcessor.summarize(text);
    
    const duration = Date.now() - startTime;
    console.log(`✅ [API] /api/summarize-text - Success in ${duration}ms`);
    
    res.json({
      success: true,
      summary: result.summary,
      date: result.date,
      display: result.display
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ [API] /api/summarize-text - Failed after ${duration}ms:`, error.message);
    
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to summarize text'
    });
  }
});

// Batch summarize texts
app.post('/api/summarize-texts', express.json(), async (req, res) => {
  const startTime = Date.now();
  try {
    const { texts } = req.body;
    
    if (!Array.isArray(texts)) {
      return res.status(400).json({
        success: false,
        error: 'Texts array is required'
      });
    }
    
    console.log(`📝 [API] /api/summarize-texts - Summarizing ${texts.length} texts`);
    
    const textProcessor = new TextProcessor();
    const results = textProcessor.batchSummarize(texts);
    
    const duration = Date.now() - startTime;
    console.log(`✅ [API] /api/summarize-texts - Success in ${duration}ms`);
    
    res.json({
      success: true,
      summaries: results
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ [API] /api/summarize-texts - Failed after ${duration}ms:`, error.message);
    
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to summarize texts'
    });
  }
});

// Auto-discover fields from Jira tickets
app.get('/api/discover-fields', async (req, res) => {
  const startTime = Date.now();
  try {
    const jql = req.query.jql || 'filter = 165194'; // Use provided JQL or default
    const userToken = req.headers['x-jira-token'];
    
    if (!userToken) {
      return res.status(401).json({
        success: false,
        error: 'No authentication token provided. Please authenticate first.'
      });
    }
    
    console.log(`🔍 [API] /api/discover-fields - Discovering fields from JQL: ${jql}`);
    
    // First, fetch field metadata from Jira's field API to get names
    const jiraConfig = jiraClient.configManager.getJiraConfig();
    const baseUrl = jiraConfig.baseUrl.replace(/\/$/, '');
    
    let fieldMetadata = {};
    try {
      const axios = require('axios');
      const fieldsResponse = await axios.get(`${baseUrl}/rest/api/2/field`, {
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'Accept': 'application/json'
        }
      });
      
      // Create a map of field ID to field name
      if (fieldsResponse.data && Array.isArray(fieldsResponse.data)) {
        fieldsResponse.data.forEach(field => {
          fieldMetadata[field.id] = field.name;
          // Also map by key if different from id
          if (field.key && field.key !== field.id) {
            fieldMetadata[field.key] = field.name;
          }
        });
      }
      console.log(`📋 [API] /api/discover-fields - Loaded ${Object.keys(fieldMetadata).length} field names from Jira`);
      console.log(`📋 [API] Sample field mappings:`, Object.keys(fieldMetadata).slice(0, 5).map(k => `${k} -> ${fieldMetadata[k]}`));
    } catch (fieldError) {
      console.warn(`⚠️ [API] /api/discover-fields - Could not fetch field metadata: ${fieldError.message}`);
      console.warn(`⚠️ [API] Field error details:`, fieldError.response?.data || fieldError.message);
      // Continue without field names - we'll just use IDs
    }
    
    // Fetch just 1 ticket to discover all available fields
    const data = await jiraClient.fetchAllData(jql, userToken);
    
    if (!data.issues || data.issues.length === 0) {
      return res.json({
        success: false,
        error: 'No tickets found. Please check your JQL query.'
      });
    }
    
    // Extract all field names from the first ticket
    const sampleIssue = data.issues[0];
    const discoveredFields = [];
    const fieldMap = {}; // Map field ID to { id, name }
    
    // Add standard fields with their names
    const standardFieldNames = {
      'key': 'Key',
      'summary': 'Summary',
      'status': 'Status',
      'assignee': 'Assignee',
      'priority': 'Priority',
      'issuetype': 'Issue Type',
      'project': 'Project',
      'created': 'Created',
      'updated': 'Updated',
      'resolution': 'Resolution',
      'labels': 'Labels',
      'components': 'Components',
      'fixVersions': 'Fix Versions'
    };
    
    Object.keys(standardFieldNames).forEach(fieldId => {
      discoveredFields.push(fieldId);
      fieldMap[fieldId] = {
        id: fieldId,
        name: standardFieldNames[fieldId]
      };
    });
    
    if (sampleIssue.fields) {
      // Get all field names from the fields object
      Object.keys(sampleIssue.fields).forEach(fieldName => {
        if (!discoveredFields.includes(fieldName)) {
          discoveredFields.push(fieldName);
          // Get the field name from metadata, or use a formatted version of the ID
          const fieldNameFromMetadata = fieldMetadata[fieldName] || null;
          fieldMap[fieldName] = {
            id: fieldName,
            name: fieldNameFromMetadata || fieldName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
          };
        }
      });
    }
    
    // Sort fields (standard fields first, then custom fields)
    discoveredFields.sort((a, b) => {
      const aIsCustom = a.startsWith('customfield_');
      const bIsCustom = b.startsWith('customfield_');
      if (aIsCustom && !bIsCustom) return 1;
      if (!aIsCustom && bIsCustom) return -1;
      return a.localeCompare(b);
    });
    
    const duration = Date.now() - startTime;
    console.log(`✅ [API] /api/discover-fields - Discovered ${discoveredFields.length} fields in ${duration}ms`);
    
    res.json({
      success: true,
      fields: discoveredFields,
      fieldMap: fieldMap, // Include field name mapping
      count: discoveredFields.length,
      message: `Discovered ${discoveredFields.length} fields from your tickets`
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ [API] /api/discover-fields - Failed after ${duration}ms:`, error.message);
    
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to discover fields'
    });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// Test Jira token endpoint
app.post('/api/test-jira-token', express.json(), async (req, res) => {
  const startTime = Date.now();
  try {
    const { token } = req.body;
    const userToken = token || req.headers['x-jira-token'];
    
    if (!userToken) {
      return res.status(400).json({
        success: false,
        error: 'Token is required. Provide token in request body or X-Jira-Token header.'
      });
    }
    
    console.log(`🔐 [API] /api/test-jira-token - Testing Jira token authentication...`);
    
    const axios = require('axios');
    const ConfigManager = require('./config');
    const configManager = new ConfigManager();
    const jiraConfig = configManager.getJiraConfig();
    const baseUrl = jiraConfig.baseUrl || 'https://jira.nutanix.com';
    const cleanBaseUrl = baseUrl.replace(/\/$/, '');
    const cleanToken = userToken.trim().replace(/\r?\n/g, '');
    
    try {
      const testResponse = await axios.get(
        `${cleanBaseUrl}/rest/pat/latest/tokens`,
        {
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${cleanToken}`
          },
          timeout: 10000
        }
      );
      
      if (testResponse.status === 200 && Array.isArray(testResponse.data)) {
        console.log(`✅ [API] /api/test-jira-token - Token is valid, found ${testResponse.data.length} tokens`);
        res.json({
          success: true,
          message: 'Jira token is valid',
          tokenCount: testResponse.data.length,
          tokens: testResponse.data.map(t => ({
            id: t.id,
            name: t.name,
            createdAt: t.createdAt
          }))
        });
      } else {
        throw new Error('Invalid response from token endpoint');
      }
    } catch (error) {
      console.error('❌ [API] /api/test-jira-token - Token test failed:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      
      if (error.response?.status === 401 || error.response?.status === 403) {
        return res.status(401).json({
          success: false,
          error: 'Invalid Jira token. Please check your Bearer token (PAT).',
          details: error.response?.data
        });
      }
      
      throw error;
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ [API] /api/test-jira-token - Failed after ${duration}ms:`, error.message);
    
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to test Jira token'
    });
  }
});

// Test Confluence token endpoint
app.post('/api/test-confluence-token', express.json(), async (req, res) => {
  const startTime = Date.now();
  try {
    const { token } = req.body;
    const userToken = token || req.headers['x-confluence-token'] || process.env.CONFLUENCE_API_TOKEN;
    
    if (!userToken) {
      return res.status(400).json({
        success: false,
        error: 'Token is required. Provide token in request body, X-Confluence-Token header, or set CONFLUENCE_API_TOKEN in .env.'
      });
    }
    
    console.log(`🔐 [API] /api/test-confluence-token - Testing Confluence token authentication...`);
    
    const axios = require('axios');
    const baseUrl = process.env.CONFLUENCE_BASE_URL || 'https://confluence.eng.nutanix.com:8443';
    const cleanBaseUrl = baseUrl.replace(/\/$/, '');
    const cleanToken = userToken.trim().replace(/\r?\n/g, '');
    const testPageId = '460996552'; // Test page ID
    
    // Try Basic Auth first (email:token)
    const email = process.env.CONFLUENCE_EMAIL || 'namratha.singh@nutanix.com';
    let testResponse;
    let authMethod = 'Unknown';
    
    try {
      // Test 1: Basic Auth
      const basicAuth = Buffer.from(`${email}:${cleanToken}`).toString('base64');
      testResponse = await axios.get(
        `${cleanBaseUrl}/rest/api/content/${testPageId}`,
        {
          headers: {
            'Authorization': `Basic ${basicAuth}`,
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
      
      if (testResponse.status === 200) {
        authMethod = 'Basic Auth (email:token)';
      } else {
        throw new Error(`HTTP ${testResponse.status}`);
      }
    } catch (basicError) {
      // Test 2: Bearer token
      try {
        testResponse = await axios.get(
          `${cleanBaseUrl}/rest/api/content/${testPageId}`,
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
        
        if (testResponse.status === 200) {
          authMethod = 'Bearer Token';
        } else {
          throw new Error(`HTTP ${testResponse.status}`);
        }
      } catch (bearerError) {
        const errorStatus = bearerError.response?.status || basicError.response?.status;
        const errorData = bearerError.response?.data || basicError.response?.data;
        
        console.error('❌ [API] /api/test-confluence-token - Both auth methods failed:', {
          basicError: basicError.response?.status,
          bearerError: bearerError.response?.status,
          data: errorData
        });
        
        if (errorStatus === 401 || errorStatus === 403) {
          return res.status(401).json({
            success: false,
            error: 'Invalid Confluence token or authentication method not supported.',
            details: errorData,
            triedMethods: ['Basic Auth (email:token)', 'Bearer Token']
          });
        }
        
        throw bearerError;
      }
    }
    
    if (testResponse.status === 200) {
      console.log(`✅ [API] /api/test-confluence-token - Token is valid using ${authMethod}`);
      res.json({
        success: true,
        message: `Confluence token is valid (using ${authMethod})`,
        authMethod: authMethod,
        pageTitle: testResponse.data.title,
        pageId: testResponse.data.id,
        labels: testResponse.data.metadata?.labels?.results?.map(l => l.name) || []
      });
    } else {
      throw new Error(`HTTP ${testResponse.status}: ${testResponse.statusText}`);
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ [API] /api/test-confluence-token - Failed after ${duration}ms:`, error.message);
    
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to test Confluence token',
      details: error.response?.data
    });
  }
});

// Feature Metrics Endpoint
app.get('/api/feature-metrics/:key', async (req, res) => {
  const startTime = Date.now();
  try {
    const featureKey = req.params.key;
    const userToken = req.headers['x-jira-token'];
    
    if (!userToken) {
      return res.status(401).json({
        success: false,
        error: 'No authentication token provided'
      });
    }
    
    console.log(`📊 [API] /api/feature-metrics/${featureKey} - Fetching metrics...`);
    
    // Generate base JQL to find all related tickets
    // Use simpler JQL that works with standard Jira (avoiding issueFunction which requires plugins)
    const baseJQL = `(
      key = ${featureKey} OR
      "Parent Link" = ${featureKey} OR
      "FEAT ID" ~ ${featureKey} OR
      "FEAT Number" = ${featureKey} OR
      parent = ${featureKey} OR
      "Epic Link" = ${featureKey}
    )`;
    
    // Fetch all related issues - ensure we request story points field
    // Override fields to include customfield_10002 for story points
    const ConfigManager = require('./config');
    const configManager = new ConfigManager();
    const backendConfig = configManager.getBackendConfig();
    let fields = backendConfig.allPossibleFields || ['key', 'summary', 'status', 'issuetype', 'created', 'resolutiondate', 'duedate', 'assignee'];
    
    // Ensure story points field is included
    if (!fields.includes('customfield_10002')) {
      fields.push('customfield_10002');
    }
    
    // Make direct API call to get raw issues with all needed fields
    const axios = require('axios');
    const jiraConfig = configManager.getJiraConfig();
    const baseUrl = jiraConfig.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    const cleanToken = userToken.trim().replace(/\r?\n/g, '');
    
    const searchUrl = `${baseUrl}/rest/api/2/search`;
    console.log(`🔍 [API] Making request to: ${searchUrl}`);
    console.log(`🔍 [API] JQL: ${baseJQL}`);
    console.log(`🔍 [API] Fields count: ${fields.length}`);
    console.log(`🔍 [API] Fields include customfield_10002: ${fields.includes('customfield_10002')}`);
    console.log(`🔍 [API] Fields: ${fields.slice(0, 10).join(', ')}...`);
    
    let response;
    try {
      response = await axios.post(
        searchUrl,
        {
          jql: baseJQL,
          fields: fields,
          maxResults: 1000
        },
        {
          headers: {
            'Authorization': `Bearer ${cleanToken}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );
    } catch (error) {
      console.error(`❌ [API] Jira API request failed:`, {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        url: searchUrl
      });
      throw new Error(`Failed to fetch issues from Jira: ${error.response?.data?.message || error.message}`);
    }
    
    const issues = response.data.issues || [];
    console.log(`📊 [API] Found ${issues.length} related issues for ${featureKey}`);
    
    // Debug: Check if customfield_10002 is present in first issue
    if (issues.length > 0) {
      const firstIssue = issues[0];
      console.log(`🔍 [API] Sample issue fields:`, {
        key: firstIssue.key,
        hasFields: !!firstIssue.fields,
        hasCustomfield_10002: !!(firstIssue.fields?.customfield_10002),
        customfield_10002_value: firstIssue.fields?.customfield_10002,
        availableFields: firstIssue.fields ? Object.keys(firstIssue.fields).filter(k => k.includes('10002') || k.includes('story')).slice(0, 5) : []
      });
    }
    
    // Find kick off epic and fetch its tasks
    const kickOffEpicTasks = await findKickOffEpicTasks(featureKey, issues, userToken);
    
    // Calculate metrics
    const metrics = calculateFeatureMetrics(issues, featureKey);
    metrics.kickOffEpicDueDates = kickOffEpicTasks;
    
    const duration = Date.now() - startTime;
    console.log(`✅ [API] /api/feature-metrics/${featureKey} - Success in ${duration}ms`);
    
    res.json({
      success: true,
      metrics: metrics
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ [API] /api/feature-metrics/${req.params.key} - Failed after ${duration}ms:`, error);
    
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch feature metrics'
    });
  }
});

// Helper function to calculate feature metrics
function calculateFeatureMetrics(issues, featureKey) {
  const now = new Date();
  const metrics = {
    totalStoryPoints: 0,
    completedStoryPoints: 0,
    remainingStoryPoints: 0,
    progressPercent: 0,
    statusBreakdown: {},
    tasks: {
      totalCreated: 0,
      totalResolved: 0,
      open: 0,
      velocity: 0,
      timeline: []
    },
    bugs: {
      totalCreated: 0,
      totalResolved: 0,
      open: 0,
      velocity: 0,
      timeline: []
    },
    tests: {
      totalCreated: 0,
      totalResolved: 0,
      open: 0,
      velocity: 0,
      timeline: []
    },
    timeline: [],
    totalPendingStoryPoints: 0,
    itemsDue: 0,
    overdue: 0
  };
  
  // Group issues by date for timeline - separate for each type
  const tasksDateGroups = {};
  const bugsDateGroups = {};
  const testsDateGroups = {};
  
  issues.forEach(issue => {
    // Story points - stored in customfield_10002 (standard Jira field)
    let storyPoints = 0;
    if (issue.fields?.customfield_10002) {
      storyPoints = parseFloat(issue.fields.customfield_10002);
    }
    
    if (isNaN(storyPoints)) storyPoints = 0;
    
    // Debug logging for first few issues
    if (issues.indexOf(issue) < 3) {
      console.log(`🔍 [calculateFeatureMetrics] Issue ${issue.key}: storyPoints=${storyPoints}, customfield_10002=${issue.fields?.customfield_10002}`);
    }
    metrics.totalStoryPoints += storyPoints;
    
    // Status - try multiple paths
    let status = 'Unknown';
    if (issue.status) {
      status = typeof issue.status === 'string' ? issue.status : (issue.status.name || issue.status.value || 'Unknown');
    } else if (issue.fields?.status) {
      status = typeof issue.fields.status === 'string' ? issue.fields.status : (issue.fields.status.name || issue.fields.status.value || 'Unknown');
    }
    
    metrics.statusBreakdown[status] = (metrics.statusBreakdown[status] || 0) + 1;
    
    // Check if resolved
    const statusLower = status.toLowerCase();
    const isResolved = statusLower.includes('done') || 
                      statusLower.includes('closed') || 
                      statusLower.includes('resolved');
    
    if (isResolved) {
      metrics.completedStoryPoints += storyPoints;
    } else {
      metrics.remainingStoryPoints += storyPoints;
    }
    
    // Issue type - try multiple paths
    let issueType = '';
    if (issue.issuetype) {
      issueType = typeof issue.issuetype === 'string' ? issue.issuetype : (issue.issuetype.name || issue.issuetype.value || '');
    } else if (issue.fields?.issuetype) {
      issueType = typeof issue.fields.issuetype === 'string' ? issue.fields.issuetype : (issue.fields.issuetype.name || issue.fields.issuetype.value || '');
    }
    issueType = issueType.toLowerCase();
    
    // Dates - standard Jira fields are in issue.fields
    const createdDate = issue.fields?.created ? new Date(issue.fields.created) : null;
    const resolvedDate = issue.fields?.resolutiondate ? new Date(issue.fields.resolutiondate) : null;
    
    // Process by type
    if (issueType.includes('task') || issueType.includes('story')) {
      metrics.tasks.totalCreated++;
      if (isResolved) {
        metrics.tasks.totalResolved++;
      } else {
        metrics.tasks.open++;
      }
      
      if (createdDate) {
        const dateKey = createdDate.toISOString().split('T')[0];
        if (!tasksDateGroups[dateKey]) {
          tasksDateGroups[dateKey] = { created: 0, resolved: 0 };
        }
        tasksDateGroups[dateKey].created++;
      }
      
      if (resolvedDate) {
        const dateKey = resolvedDate.toISOString().split('T')[0];
        if (!tasksDateGroups[dateKey]) {
          tasksDateGroups[dateKey] = { created: 0, resolved: 0 };
        }
        tasksDateGroups[dateKey].resolved++;
      }
    } else if (issueType.includes('bug')) {
      metrics.bugs.totalCreated++;
      if (isResolved) {
        metrics.bugs.totalResolved++;
      } else {
        metrics.bugs.open++;
      }
      
      if (createdDate) {
        const dateKey = createdDate.toISOString().split('T')[0];
        if (!bugsDateGroups[dateKey]) {
          bugsDateGroups[dateKey] = { created: 0, resolved: 0 };
        }
        bugsDateGroups[dateKey].created++;
      }
      
      if (resolvedDate) {
        const dateKey = resolvedDate.toISOString().split('T')[0];
        if (!bugsDateGroups[dateKey]) {
          bugsDateGroups[dateKey] = { created: 0, resolved: 0 };
        }
        bugsDateGroups[dateKey].resolved++;
      }
    } else if (issueType.includes('test')) {
      metrics.tests.totalCreated++;
      if (isResolved) {
        metrics.tests.totalResolved++;
      } else {
        metrics.tests.open++;
      }
      
      if (createdDate) {
        const dateKey = createdDate.toISOString().split('T')[0];
        if (!testsDateGroups[dateKey]) {
          testsDateGroups[dateKey] = { created: 0, resolved: 0 };
        }
        testsDateGroups[dateKey].created++;
      }
      
      if (resolvedDate) {
        const dateKey = resolvedDate.toISOString().split('T')[0];
        if (!testsDateGroups[dateKey]) {
          testsDateGroups[dateKey] = { created: 0, resolved: 0 };
        }
        testsDateGroups[dateKey].resolved++;
      }
    }
    
    // Timeline data (for due date analysis) - standard Jira fields
    const dueDate = issue.fields?.duedate ? new Date(issue.fields.duedate) : null;
    if (dueDate || !isResolved) {
      // Extract components and priority
      const components = issue.fields?.components || [];
      const componentsList = components.length > 0 
        ? components.map(c => c.name || c.id || 'Unknown').join(', ')
        : 'None';
      
      const priority = issue.fields?.priority?.name || issue.fields?.priority || 'N/A';
      
      metrics.timeline.push({
        key: issue.key, // 'key' is at top level in Jira API
        summary: issue.fields?.summary || 'N/A',
        status: status,
        dueDate: dueDate ? dueDate.toISOString() : null,
        storyPoints: storyPoints,
        assignee: issue.fields?.assignee?.displayName || issue.fields?.assignee || 'Unassigned',
        components: componentsList,
        priority: priority
      });
      
      if (!isResolved) {
        metrics.totalPendingStoryPoints += storyPoints;
        if (dueDate) {
          metrics.itemsDue++;
          if (dueDate < now) {
            metrics.overdue++;
          }
        }
      }
    }
  });
  
  // Calculate progress
  if (metrics.totalStoryPoints > 0) {
    metrics.progressPercent = Math.round((metrics.completedStoryPoints / metrics.totalStoryPoints) * 100);
  }
  
  // Build timeline for charts (group by week) - separate for each type
  function buildTimeline(dateGroups) {
    const weekGroups = {};
    Object.keys(dateGroups).sort().forEach(dateKey => {
      const date = new Date(dateKey);
      const weekKey = getWeekKey(date);
      if (!weekGroups[weekKey]) {
        weekGroups[weekKey] = { created: 0, resolved: 0, date: dateKey };
      }
      weekGroups[weekKey].created += dateGroups[dateKey].created;
      weekGroups[weekKey].resolved += dateGroups[dateKey].resolved;
    });
    
    return Object.values(weekGroups).sort((a, b) => 
      new Date(a.date) - new Date(b.date)
    );
  }
  
  metrics.tasks.timeline = buildTimeline(tasksDateGroups);
  metrics.bugs.timeline = buildTimeline(bugsDateGroups);
  metrics.tests.timeline = buildTimeline(testsDateGroups);
  
  // Calculate velocity (resolved per week, average over last 4 weeks) - separate for each type
  const tasksRecentWeeks = metrics.tasks.timeline.slice(-4);
  if (tasksRecentWeeks.length > 0) {
    const totalResolved = tasksRecentWeeks.reduce((sum, week) => sum + week.resolved, 0);
    metrics.tasks.velocity = Math.round(totalResolved / tasksRecentWeeks.length);
  }
  
  const bugsRecentWeeks = metrics.bugs.timeline.slice(-4);
  if (bugsRecentWeeks.length > 0) {
    const totalResolved = bugsRecentWeeks.reduce((sum, week) => sum + week.resolved, 0);
    metrics.bugs.velocity = Math.round(totalResolved / bugsRecentWeeks.length);
  }
  
  const testsRecentWeeks = metrics.tests.timeline.slice(-4);
  if (testsRecentWeeks.length > 0) {
    const totalResolved = testsRecentWeeks.reduce((sum, week) => sum + week.resolved, 0);
    metrics.tests.velocity = Math.round(totalResolved / testsRecentWeeks.length);
  }
  
  return metrics;
}

// Helper to get week key (YYYY-WW format)
function getWeekKey(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getFullYear()}-W${week}`;
}

// Calculate story points from already-fetched issues (synchronous, no API calls)
function calculateStoryPointsFromFetchedIssues(featureKey, allIssues) {
  // Issues to ignore (epic-level and above)
  const ignoreTypes = ['epic', 'initiative', 'feature', 'x-feat', 'capability'];
  
  // Positive resolutions (completed work)
  const positiveResolutions = ['done', 'fixed', 'resolved', 'closed', 'completed'];
  
  // Negative resolutions (won't fix, duplicate, etc.)
  const negativeResolutions = ["won't fix", 'wont fix', 'duplicate', 'cannot reproduce', 'not a bug', 'invalid'];
  
  let completedStoryPoints = 0;
  let outstandingStoryPoints = 0;
  let wontFixStoryPoints = 0;
  let totalStoryPoints = 0;
  
  // Filter issues related to this feature
  // The feature key might be like "FEAT-12345" - we need to find all issues that reference it
  const relatedIssues = allIssues.filter(issue => {
    if (!issue || !issue.key) return false;
    
    // Skip the feature itself (we only want child items)
    if (issue.key === featureKey) {
      return false;
    }
    
    const issueKey = issue.key || '';
    
    // Try multiple ways to get parent/epic links - check both direct fields and nested objects
    let parentLink = '';
    if (issue.fields) {
      // Try different field names for parent link
      parentLink = issue.fields['Parent Link'] || 
                   issue.fields.parent?.key || 
                   issue.fields.parent || 
                   issue.fields['parent']?.key ||
                   '';
    }
    if (!parentLink && issue.parent) {
      parentLink = issue.parent.key || issue.parent || '';
    }
    
    let featId = '';
    if (issue.fields) {
      featId = issue.fields['FEAT ID'] || issue.fields.featId || '';
    }
    if (!featId && issue.featId) {
      featId = issue.featId;
    }
    
    let featNumber = '';
    if (issue.fields) {
      featNumber = issue.fields['FEAT Number'] || issue.fields.featNumber || '';
    }
    if (!featNumber && issue.featNumber) {
      featNumber = issue.featNumber;
    }
    
    let epicLink = '';
    if (issue.fields) {
      epicLink = issue.fields['Epic Link'] || 
                issue.fields.epic?.key || 
                issue.fields.epic || '';
    }
    if (!epicLink && issue.epic) {
      epicLink = issue.epic.key || issue.epic || '';
    }
    
    // Also check if issue key starts with the feature prefix (e.g., FEAT-12345-1, FEAT-12345-2)
    const featurePrefix = featureKey.split('-').slice(0, -1).join('-'); // e.g., "FEAT" from "FEAT-12345"
    const issuePrefix = issueKey.split('-').slice(0, -1).join('-');
    const isSubtask = issuePrefix === featurePrefix && issueKey !== featureKey;
    
    // Check if issue is related to the feature
    const isMatch = parentLink === featureKey ||
           (featId && String(featId).includes(featureKey)) ||
           featNumber === featureKey ||
           epicLink === featureKey ||
           isSubtask;
    
    return isMatch;
  });
  
  relatedIssues.forEach((issue, index) => {
    // Get issue type
    const issueType = (issue.fields?.issuetype?.name || 
                      issue.fields?.issuetype || 
                      issue.issuetype?.name || 
                      issue.issuetype || 
                      '').toLowerCase();
    
    // Skip if it's an epic-level type
    if (ignoreTypes.some(ignoreType => issueType.includes(ignoreType))) {
      return;
    }
    
    // Get story points
    const storyPoints = parseFloat(issue.fields?.customfield_10002 || 0);
    if (isNaN(storyPoints) || storyPoints === 0) {
      return; // Skip issues with no story points
    }
    
    totalStoryPoints += storyPoints;
    
    // Get resolution
    const resolution = (issue.fields?.resolution?.name || 
                       issue.fields?.resolution || 
                       issue.resolution?.name || 
                       issue.resolution || 
                       '').toLowerCase();
    const hasResolutionDate = !!issue.fields?.resolutiondate;
    
    // Check if unresolved
    if (!resolution || resolution === 'unresolved' || !hasResolutionDate) {
      outstandingStoryPoints += storyPoints;
    } 
    // Check if positive resolution
    else if (positiveResolutions.some(pos => resolution.includes(pos))) {
      completedStoryPoints += storyPoints;
    }
    // Check if negative resolution (won't fix, duplicate, etc.)
    else if (negativeResolutions.some(neg => resolution.includes(neg))) {
      wontFixStoryPoints += storyPoints;
    }
    // Default: if resolved but unknown resolution type, treat as completed
    else {
      completedStoryPoints += storyPoints;
    }
  });
  
  console.log(`📊 [calculateStoryPoints] ${featureKey}: Done=${completedStoryPoints}, Pending=${outstandingStoryPoints}, Won't Fix=${wontFixStoryPoints}, Total=${totalStoryPoints}`);
  
  return {
    done: completedStoryPoints,
    pending: outstandingStoryPoints,
    wontFix: wontFixStoryPoints,
    total: totalStoryPoints,
    childItemsCount: relatedIssues.filter(issue => {
      const issueType = (issue.fields?.issuetype?.name || issue.fields?.issuetype || '').toLowerCase();
      return !ignoreTypes.some(ignoreType => issueType.includes(ignoreType));
    }).length
  };
}

// Find kick off epic and fetch all tasks with due dates
async function findKickOffEpicTasks(featureKey, issues, userToken) {
  try {
    // Find epics related to this feature - standard Jira fields
    const epics = issues.filter(issue => {
      const issueType = (issue.fields?.issuetype?.name || issue.fields?.issuetype || '').toLowerCase();
      return issueType.includes('epic');
    });
    
    console.log(`🔍 [findKickOffEpicTasks] Found ${epics.length} epics for ${featureKey}`);
    
    // Find kick off epic - look for epic with "kick off" or "kickoff" in name/summary
    let kickOffEpic = epics.find(epic => {
      const summary = (epic.fields?.summary || '').toLowerCase();
      const key = (epic.key || '').toLowerCase(); // 'key' is at top level
      return summary.includes('kick off') || summary.includes('kickoff') || 
             summary.includes('kick-off') || key.includes('kickoff');
    });
    
    // If no explicit kick off epic found, use the first epic
    if (!kickOffEpic && epics.length > 0) {
      kickOffEpic = epics[0];
      console.log(`⚠️ [findKickOffEpicTasks] No explicit kick off epic found, using first epic: ${kickOffEpic.key}`);
    }
    
    if (!kickOffEpic) {
      console.log(`⚠️ [findKickOffEpicTasks] No epic found for ${featureKey}`);
      return {
        epicKey: null,
        epicSummary: 'Not found',
        tasks: []
      };
    }
    
    console.log(`✅ [findKickOffEpicTasks] Found kick off epic: ${kickOffEpic.key} - ${kickOffEpic.fields?.summary || 'N/A'}`);
    
    // Fetch all tasks linked to this epic
    const axios = require('axios');
    const ConfigManager = require('./config');
    const configManager = new ConfigManager();
    const jiraConfig = configManager.getJiraConfig();
    const baseUrl = jiraConfig.baseUrl;
    const cleanToken = userToken.trim().replace(/\r?\n/g, '');
    
    // JQL to find all tasks in this epic
    const epicJQL = `"Epic Link" = ${kickOffEpic.key} AND issuetype IN (Task, Story, Sub-task)`;
    
    const response = await axios.get(`${baseUrl}/rest/api/2/search`, {
      headers: {
        'Authorization': `Bearer ${cleanToken}`,
        'Accept': 'application/json'
      },
      params: {
        jql: epicJQL,
        fields: 'key,summary,duedate,status,assignee,issuetype',
        maxResults: 1000
      },
      timeout: 30000
    });
    
    const epicTasks = response.data.issues || [];
    console.log(`📋 [findKickOffEpicTasks] Found ${epicTasks.length} tasks in kick off epic ${kickOffEpic.key}`);
    
    // Extract due dates and format
    const tasksWithDueDates = epicTasks
      .filter(task => task.fields?.duedate)
      .map(task => ({
        key: task.key,
        summary: task.fields.summary || 'N/A',
        dueDate: task.fields.duedate,
        status: task.fields.status?.name || 'Unknown',
        assignee: task.fields.assignee?.displayName || 'Unassigned',
        issueType: task.fields.issuetype?.name || 'Task'
      }))
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    
    console.log(`📅 [findKickOffEpicTasks] Found ${tasksWithDueDates.length} tasks with due dates`);
    
    return {
      epicKey: kickOffEpic.key,
      epicSummary: kickOffEpic.fields?.summary || 'N/A',
      tasks: tasksWithDueDates
    };
  } catch (error) {
    console.error(`❌ [findKickOffEpicTasks] Error:`, error.message);
    return {
      epicKey: null,
      epicSummary: 'Not found',
      tasks: []
    };
  }
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

app.listen(port, () => {
  console.log(`🚀 Story Point Calculator app running at http://localhost:${port}`);
  console.log(`📊 Jira integration ready`);
});
