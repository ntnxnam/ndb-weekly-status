# Story Point Calculator - Complete Requirements

## Core Functionality

### 1. Server Configuration
- Use an uncommon/random port (currently 7842)
- Port should be configurable via `config.json`, `.env`, or environment variables
- Priority: `process.env.PORT` > `config.json` > default (7842)

### 2. User Interface - Initial State
- **NO auto-loading of data on page load**
- Only the JQL query field should be preloaded with default value (e.g., "filter = 165194")
- No status tiles visible initially
- No table visible initially
- User must click "Fetch Data" button to load data

### 3. JQL Query Field
- **Single consolidated JQL query field** (removed separate "Feature/Initiative Tracker" field)
- Field should accept:
  - JQL queries (e.g., `project = 'PROJ' AND status != Done`)
  - Filter IDs (e.g., `filter = 165194`)
  - Feature keys (e.g., `ERA-12345`)
- Placeholder text should clarify input types

### 4. Data Fetching and Storage
- When "Fetch Data" is clicked:
  - Fetch ALL tickets matching the JQL query (up to 1000 results)
  - Store all fetched tickets in background (`allIssues`)
  - Filter to show only "FEAT" or "INITIATIVE" tickets in the main table
  - If no FEAT/INITIATIVE tickets found, show all issues for debugging
  - Display correct total count (not limited to 100)

### 5. Status Tiles
- **Dynamic generation** based on actual Jira statuses in fetched data
- Display when "Fetch Data" button is pressed
- Show actual status names (e.g., "EC commit", "backlog", "CONCEPT COMMIT", "EXECUTE COMMIT")
- Show accurate counts for each status
- **Smaller, minimal design**:
  - Grid: `repeat(auto-fit, minmax(100px, 1fr))`
  - Gap: `8px`
  - Padding: `6px 10px`
  - Font sizes: Number `16px`, Label `9px`
  - Mobile: 3 columns
- Sort by count (descending)
- Assign colors/icons based on status keywords
- First tile should show "TOTAL TICKETS" with total count

### 6. Main Data Table
- **Must be displayed after data is fetched**
- Display only "FEAT" or "INITIATIVE" tickets (filtered from allIssues)
- **No pagination** - display all tickets at once
- Table should be visible and scrollable
- Show table controls (search, info) when data is present

### 7. Table Columns - Standard Fields
- **Key**: Clickable link to Jira issue
- **Summary**: Full text with wrapping
- **Status**: Badge with status name
- **Priority**: Badge with priority
- **Assignee**: Name or "Unassigned"
- **Resolution**: Show "Unresolved" when issue is not resolved (null/empty)
- **Issue Type**: Badge with type name
- **Created Date**: Date formatted
- **Updated Date**: Date formatted

### 8. Table Columns - Custom Fields
- **Status Update** (customfield_23073):
  - Display summarized/truncated value
  - Show full value on hover or click
- **Risk Indicator** (customfield_23560):
  - Display the actual value (extracted from option object)
  - Show "-" if empty
- **Custom field names**: Must display actual field names (e.g., "Status Update") not raw IDs (e.g., "Customfield 23073")
  - Fetch field names from Jira API `/api/field-names` endpoint
  - Use field name mapping to display correct names in headers

### 9. Table Columns - CG/PG Completion
- **CG Completion** (customfield_10000):
  - Extract "CG Readiness" link from "mentioned in" field (remote links)
  - Display as clickable "CG" button/link
  - Column header should show "CG Completion" (not "CG Page")
  - If Confluence page title can be extracted, use it; otherwise use "CG Completion"
- **PG Completion** (customfield_10001):
  - Extract "PG Readiness" link from "mentioned in" field (remote links)
  - Display as clickable "PG" button/link
  - Column header should show "PG Completion" (not "PG Checklist" or "PG Page")
  - If Confluence page title can be extracted, use it; otherwise use "PG Completion"

### 10. Table Columns - Related Ticket Counts
- **Outstanding Tasks**: Count with JQL hyperlink
- **Bugs**: Count with JQL hyperlink
- **Tests**: Count with JQL hyperlink
- **Other Tickets**: Count with JQL hyperlink
- Each count should:
  - Generate JQL query based on feature/initiative key
  - Be clickable to copy JQL to clipboard and set in query field
  - Show "0" if no related tickets found

### 11. JQL Generation for Related Tickets
- Base JQL format: `project = 'ERA' AND "Feature/Initiative Link" = "{featureKey}" AND issuetype = "{type}"`
- Types:
  - Outstanding Tasks: `issuetype IN (Task, Story, Sub-task)`
  - Bugs: `issuetype = Bug`
  - Tests: `issuetype = Test`
  - Other Tickets: `issuetype NOT IN (Task, Story, Sub-task, Bug, Test, Feature, Initiative)`

### 12. Remote Links / "Mentioned In" Extraction
- Fetch remote links for each issue via Jira API `/api/jira/remote-links/:issueKey`
- Search for links containing "CG Readiness" or "PG Readiness" in URL or title
- Store in `issue._readinessLinks.cg` and `issue._readinessLinks.pg`
- Fallback to searching issue fields if remote links not found

### 13. Data Display Requirements
- All data must be visible after "Fetch Data" is clicked
- Table must be displayed (not hidden)
- Status tiles must be displayed
- No data should be hidden or require scrolling to find (except for long tables)
- Table container should always be visible when data is present

### 14. Error Handling
- Show clear error messages for authentication failures
- Show helpful messages for JQL syntax errors
- Display "No issues found" when appropriate
- Handle cases where no FEAT/INITIATIVE tickets exist

### 15. Authentication
- Bearer token authentication
- Token stored in localStorage
- "Authenticate" button to set token
- Token passed in Authorization header: `Bearer {token}`

## Technical Requirements

### Backend
- Express.js server
- Jira API v2/v3 integration
- Confluence API integration for page titles
- Remote links API integration
- Field names API endpoint
- Error handling and logging

### Frontend
- Vanilla JavaScript (no frameworks)
- Responsive design
- Dynamic table rendering
- Dynamic status tile generation
- Field name mapping
- JQL query generation
- Related ticket counting

### Data Flow
1. User enters JQL query
2. User clicks "Fetch Data"
3. Backend fetches all issues (up to 1000)
4. Backend fetches remote links for each issue
5. Backend extracts CG/PG Readiness links
6. Backend formats issues with all fields
7. Frontend receives formatted issues
8. Frontend filters to FEAT/INITIATIVE
9. Frontend generates status tiles dynamically
10. Frontend renders table with all columns
11. Frontend displays table and tiles

## Files Structure
- `server.js`: Express server, API endpoints
- `jira-client-clean.js`: Jira API client, data formatting
- `confluence-client.js`: Confluence API client
- `config.js`: Configuration management
- `public/index.html`: Frontend interface
- `backend-default-config.json`: Default column configuration
- `user-column-config.json`: User-defined column configuration

## Testing Requirements
- Test with various JQL queries
- Test with filter IDs
- Test with feature keys
- Test with no FEAT/INITIATIVE tickets
- Test with empty results
- Test CG/PG Readiness link extraction
- Test custom field name display
- Test related ticket counts
- Test status tile generation
- Test table visibility
- Test authentication flow

