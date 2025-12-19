const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

class ConfluenceClient {
  constructor() {
    // Load base URL from environment variable, fall back to default
    this.baseUrl = process.env.CONFLUENCE_BASE_URL || 'https://nutanix.atlassian.net/wiki';
    console.log(`🔧 [ConfluenceClient] Base URL: ${this.baseUrl}`);
    this.token = this.loadToken();
  }

  loadToken() {
    // Only use environment variable from .env file
    try {
      if (process.env.CONFLUENCE_API_TOKEN) {
        return process.env.CONFLUENCE_API_TOKEN.trim();
      }
    } catch (error) {
      console.error('Error loading Confluence token:', error);
    }
    return null;
  }

  // Extract Confluence page ID from URL
  extractPageId(confluenceUrl) {
    if (!confluenceUrl) return null;
    
    // Handle string URLs
    let urlString = confluenceUrl;
    if (typeof confluenceUrl === 'object') {
      // If it's an object, try to extract URL from common fields
      urlString = confluenceUrl.url || confluenceUrl.value || confluenceUrl.toString();
    }
    
    if (!urlString) return null;
    
    // Handle different Confluence URL formats
    // https://nutanix.atlassian.net/wiki/spaces/.../pages/123456789/Page+Title
    // https://confluence.eng.nutanix.com:8443/spaces/ED/pages/468276167/...
    // https://nutanix.atlassian.net/wiki/pages/viewpage.action?pageId=123456789
    // https://confluence.eng.nutanix.com:8443/pages/viewpage.action?pageId=123456789
    
    // First try: pageId= parameter format
    const pageIdParamMatch = urlString.match(/pageId=(\d+)/);
    if (pageIdParamMatch) {
      return pageIdParamMatch[1];
    }
    
    // Second try: /pages/123456789/ format (most common)
    const pagesPathMatch = urlString.match(/\/pages\/(\d+)/);
    if (pagesPathMatch) {
      return pagesPathMatch[1];
    }
    
    // Third try: pages/123456789 format (without leading slash)
    const pagesMatch = urlString.match(/pages\/(\d+)/);
    if (pagesMatch) {
      return pagesMatch[1];
    }
    
    return null;
  }
  
  // Extract URL from Jira field value (handles different formats)
  extractUrl(fieldValue) {
    if (!fieldValue) return null;
    
    // If it's already a string URL, return it
    if (typeof fieldValue === 'string' && fieldValue.startsWith('http')) {
      return fieldValue;
    }
    
    // If it's an object, try common fields
    if (typeof fieldValue === 'object') {
      return fieldValue.url || fieldValue.value || fieldValue.href || null;
    }
    
    return null;
  }

  // Extract space key from URL
  extractSpaceKey(confluenceUrl) {
    if (!confluenceUrl) return null;
    
    // Extract from /spaces/SPACEKEY/
    const spaceMatch = confluenceUrl.match(/\/spaces\/([^\/]+)/);
    if (spaceMatch) {
      return spaceMatch[1];
    }
    
    return null;
  }

  // Fetch Confluence page content
  async fetchPageContent(confluenceUrl, userToken = null) {
    try {
      // Extract URL first
      const url = this.extractUrl(confluenceUrl);
      if (!url) {
        throw new Error('Invalid Confluence URL format');
      }
      
      const pageId = this.extractPageId(url);
      if (!pageId) {
        throw new Error('Could not extract page ID from Confluence URL');
      }

      const token = userToken || this.token;
      if (!token) {
        throw new Error('Confluence token not available. Please provide token.');
      }

      // Clean token the same way Jira does - remove whitespace and newlines
      const cleanToken = token.trim().replace(/\r?\n/g, '');
      
      // Use Confluence REST API v2
      const apiUrl = `${this.baseUrl}/rest/api/content/${pageId}?expand=body.storage,version`;
      
      const response = await axios.get(apiUrl, {
        headers: {
          'Authorization': `Bearer ${cleanToken}`,
          'Accept': 'application/json'
        },
        timeout: 10000
      });

      return {
        success: true,
        title: response.data.title,
        body: response.data.body?.storage?.value || '',
        version: response.data.version?.number || 1
      };
    } catch (error) {
      console.error('Error fetching Confluence page:', error.message);
      return {
        success: false,
        error: error.message,
        title: null,
        body: null
      };
    }
  }

  // Get just the page title (faster than fetching full content)
  async getPageTitle(confluenceUrl, userToken = null) {
    // Declare variables outside try block for catch block access
    let url, pageId, token, baseUrl, apiUrl, tokenPreview, tokenSource;
    
    try {
      url = this.extractUrl(confluenceUrl);
      if (!url) {
        return null;
      }
      
      pageId = this.extractPageId(url);
      if (!pageId) {
        return null;
      }

      token = userToken || this.token;
      if (!token) {
        console.log(`⚠️ [getPageTitle] No token available for ${confluenceUrl.substring(0, 100)}`);
        return null;
      }

      // Clean token the same way Jira does - remove whitespace and newlines
      const cleanToken = token.trim().replace(/\r?\n/g, '');

      // Use Confluence REST API v2 - just get title
      // Use the base URL from environment or client config
      baseUrl = this.baseUrl;
      
      // Use standard REST API endpoint
      // For on-premise Confluence, the path is /wiki/rest/api/content/{id}
      // According to Confluence REST API v1: GET /wiki/rest/api/content/{id}
      // expand parameter can include: version, metadata.labels, body.storage, etc.
      apiUrl = `${baseUrl}/wiki/rest/api/content/${pageId}?expand=version,metadata.labels`;
      
      // Log token info for debugging (first 10 chars only for security)
      tokenPreview = cleanToken.substring(0, 10) + '...';
      // userToken parameter can be from .env (CONFLUENCE_API_TOKEN) or from request, check which one
      tokenSource = userToken ? (userToken === process.env.CONFLUENCE_API_TOKEN ? 'CONFLUENCE_API_TOKEN (from .env)' : 'passed parameter') : 'this.token (from Confluence client)';
      console.log(`🔍 [getPageTitle] Using token from ${tokenSource} (${tokenPreview}) for page ${pageId}`);
      console.log(`🔍 [getPageTitle] Token length: ${cleanToken.length}, API URL: ${apiUrl}`);
      
      // Try Basic Auth first (for on-premise Confluence with email:token format)
      // Then fall back to Bearer token
      let response;
      const email = process.env.CONFLUENCE_EMAIL || 'namratha.singh@nutanix.com';
      
      try {
        // Try Basic Auth: email:token base64 encoded
        const basicAuth = Buffer.from(`${email}:${cleanToken}`).toString('base64');
        console.log(`🔍 [getPageTitle] Trying Basic Auth with email: ${email}`);
        console.log(`🔍 [getPageTitle] Making request to: ${apiUrl}`);
        
        response = await axios.get(apiUrl, {
          headers: {
            'Authorization': `Basic ${basicAuth}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          timeout: 10000,
          validateStatus: function (status) {
            return status >= 200 && status < 600;
          }
        });
        
        if (response.status === 200) {
          console.log(`✅ [getPageTitle] Successfully fetched page title for ${pageId} using Basic Auth: ${response.data?.title || 'N/A'}`);
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (basicError) {
        // If Basic Auth fails, try Bearer token
        console.log(`⚠️ [getPageTitle] Basic Auth failed, trying Bearer token...`);
        try {
          const authHeaderPreview = `Bearer ${cleanToken.substring(0, 20)}...`;
          console.log(`🔍 [getPageTitle] Making request to: ${apiUrl}`);
          console.log(`🔍 [getPageTitle] Authorization header: ${authHeaderPreview}`);
          
          response = await axios.get(apiUrl, {
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
          console.log(`✅ [getPageTitle] Successfully fetched page title for ${pageId} using Bearer token: ${response.data?.title || 'N/A'}`);
        } catch (bearerError) {
          // Log detailed error information
          const errorStatus = bearerError.response?.status;
          const errorStatusText = bearerError.response?.statusText;
          const errorData = bearerError.response?.data;
          const errorHeaders = bearerError.response?.headers;
          
          console.log(`❌ [getPageTitle] Bearer token request also failed for ${pageId}`);
          console.log(`   Status: ${errorStatus} ${errorStatusText}`);
          console.log(`   Response data: ${JSON.stringify(errorData).substring(0, 300)}`);
          if (errorHeaders && errorHeaders['www-authenticate']) {
            console.log(`   WWW-Authenticate header: ${errorHeaders['www-authenticate']}`);
          }
          
          console.log(`⚠️ [getPageTitle] Both Basic Auth and Bearer token failed. This on-premise Confluence instance may require a different authentication method.`);
          throw bearerError;
        }
      }

      if (response && response.data) {
        return response.data.title || null;
      }
      
      return null;
    } catch (error) {
      // Log error for debugging
      const errorMsg = error.response ? 
        `${error.response.status} ${error.response.statusText}` : 
        error.message;
      const errorDetails = error.response?.data ? JSON.stringify(error.response.data).substring(0, 200) : 'No details';
      // Re-extract values for error logging (in case they weren't set in try block)
      const errorToken = userToken || this.token;
      const errorCleanToken = errorToken ? errorToken.trim().replace(/\r?\n/g, '') : null;
      const errorTokenPreview = errorCleanToken ? (errorCleanToken.substring(0, 10) + '...') : 'none';
      const errorTokenSource = userToken ? 'userToken (from request)' : 'this.token (from env/client)';
      // Safely extract pageId and URL for error logging
      const errorUrl = url || this.extractUrl(confluenceUrl);
      const errorPageId = pageId || (errorUrl ? this.extractPageId(errorUrl) : null);
      const errorBaseUrl = this.baseUrl;
      const errorApiUrl = errorPageId ? `${errorBaseUrl}/rest/api/content/${errorPageId}?expand=version` : 'unknown';
      
      console.log(`⚠️ [getPageTitle] Error fetching page title: ${errorMsg} for ${confluenceUrl.substring(0, 100)}`);
      console.log(`   📋 Error details: ${errorDetails}`);
      if (error.response && error.response.status === 401) {
        console.log(`   ⚠️ Authentication failed - token source: ${errorTokenSource}, token preview: ${errorTokenPreview}`);
        console.log(`   ⚠️ API URL: ${errorApiUrl}`);
        console.log(`   ⚠️ For Confluence API, you need either:`);
        console.log(`     1. A Personal Access Token (PAT) - works with Bearer auth`);
        console.log(`     2. An API token in format: email:api_token (base64 encoded for Basic Auth)`);
        console.log(`   ⚠️ Get your token from: https://id.atlassian.com/manage-profile/security/api-tokens`);
      }
      return null;
    }
  }

  // Extract summary section from Confluence page
  extractSummary(htmlContent) {
    if (!htmlContent) return null;

    try {
      // Look for common summary section patterns
      // Pattern 1: <h2>Summary</h2> or <h3>Summary</h3>
      const summaryRegex = /<h[23][^>]*>Summary<\/h[23]>(.*?)(?=<h[123]|$)/is;
      let match = htmlContent.match(summaryRegex);
      
      if (match) {
        return this.cleanHtml(match[1]);
      }

      // Pattern 2: <p><strong>Summary:</strong>...</p>
      const summaryStrongRegex = /<p[^>]*><strong[^>]*>Summary:?<\/strong>(.*?)<\/p>/is;
      match = htmlContent.match(summaryStrongRegex);
      
      if (match) {
        return this.cleanHtml(match[1]);
      }

      // Pattern 3: Look for first paragraph after title
      const firstParaRegex = /<p[^>]*>(.*?)<\/p>/is;
      match = htmlContent.match(firstParaRegex);
      
      if (match) {
        return this.cleanHtml(match[1]);
      }

      // If no specific summary found, return first 500 chars of content
      return this.cleanHtml(htmlContent).substring(0, 500);
    } catch (error) {
      console.error('Error extracting summary:', error);
      return null;
    }
  }

  // Clean HTML and extract text
  cleanHtml(html) {
    if (!html) return '';
    
    // Remove HTML tags
    let text = html.replace(/<[^>]+>/g, ' ');
    
    // Decode HTML entities
    text = text
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    
    // Clean up whitespace
    text = text.replace(/\s+/g, ' ').trim();
    
    return text;
  }

  // Fetch and extract summary from Confluence page
  async getSummary(confluenceUrl, userToken = null) {
    try {
      const url = this.extractUrl(confluenceUrl);
      if (!url) {
        return {
          success: false,
          summary: null,
          error: 'Unable to access Confluence page. The page may not be available or you may need to configure your Confluence access token.'
        };
      }

      const pageContent = await this.fetchPageContent(url, userToken);
      
      if (!pageContent.success) {
        return {
          success: false,
          summary: null,
          error: pageContent.error || 'Failed to fetch page'
        };
      }

      const summary = this.extractSummary(pageContent.body);
      
      return {
        success: true,
        summary: summary,
        title: pageContent.title,
        error: null
      };
    } catch (error) {
      return {
        success: false,
        summary: null,
        error: error.message
      };
    }
  }

  // Batch fetch summaries for multiple URLs
  async getSummaries(confluenceUrls, userToken = null) {
    const results = {};
    
    // Process in parallel with rate limiting
    const promises = confluenceUrls.map(async (url, index) => {
      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, index * 100));
      return this.getSummary(url, userToken);
    });

    const summaries = await Promise.all(promises);
    
    confluenceUrls.forEach((url, index) => {
      results[url] = summaries[index];
    });

    return results;
  }
}

module.exports = ConfluenceClient;

