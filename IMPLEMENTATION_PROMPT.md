# Implementation Prompt for Story Point Calculator Application

## Context
You are building a Jira weekly status reporting web application. The application connects to Jira and Confluence APIs to fetch and display issue data in a clean, organized table format.

## Current State (As of Latest Implementation)
- ✅ Server running on port 7842 (configurable via `.env` or `config.json`)
- ✅ Single consolidated JQL query field (no separate Feature/Initiative Tracker)
- ✅ Dynamic status tiles working correctly (showing actual Jira statuses with counts)
- ✅ CG/PG Readiness link extraction from remote links with Confluence page title fetching
- ✅ Custom field names displayed correctly (not raw IDs)
- ✅ Related ticket counts with JQL hyperlinks
- ✅ No pagination - all tickets displayed at once
- ✅ Field name mapping from Jira API
- ✅ Remote links API integration for CG/PG Readiness identification
- ✅ Confluence API integration for page title and label fetching
- ✅ Authentication via Bearer token (stored in localStorage)
- ⚠️ Table visibility issues may still exist - needs verification
- ⚠️ Some debug logging may need cleanup

## Your Task
Ensure the application meets all requirements from `REQUIREMENTS.md` and:
1. **Table data is properly displayed** after "Fetch Data" is clicked
2. **All requirements are met** (see REQUIREMENTS.md)
3. **Code is clean, well-organized, and production-ready**
4. **No regressions** - all existing functionality must continue working
5. **Proper test cases** are created and documented

## Key Features to Verify

### 1. Initial State
- ✅ NO auto-loading on page load
- ✅ Only JQL field preloaded with default value
- ✅ No status tiles visible initially
- ✅ No table visible initially
- ✅ User must click "Fetch Data" to load data

### 2. Data Fetching
- ✅ Fetch ALL tickets matching JQL (up to 1000 results)
- ✅ Store all tickets in `allIssues` array
- ✅ Filter to show only FEAT/INITIATIVE in main table
- ✅ Display correct total count (not limited to 100)
- ✅ Show all tickets if no FEAT/INITIATIVE found (for debugging)

### 3. Status Tiles
- ✅ Dynamic generation from actual Jira statuses
- ✅ Display when "Fetch Data" is clicked
- ✅ Show actual status names (e.g., "EC commit", "backlog")
- ✅ Show accurate counts
- ✅ Smaller, minimal design (100px min width, 8px gap, compact padding)
- ✅ Sort by count (descending)
- ✅ First tile shows "TOTAL TICKETS"

### 4. Main Data Table
- ✅ Must be displayed after data is fetched
- ✅ Display only FEAT/INITIATIVE tickets
- ✅ No pagination - show all tickets
- ✅ Table visible and scrollable
- ✅ All columns rendered correctly

### 5. Table Columns
- ✅ Standard fields: Key, Summary, Status, Priority, Assignee, Resolution, Issue Type, Created, Updated
- ✅ Resolution shows "Unresolved" when null/empty
- ✅ Custom fields: Status Update (customfield_23073), Risk Indicator (customfield_23560)
- ✅ Custom field names displayed (not IDs)
- ✅ CG Completion: Extract CG Readiness from remote links, fetch Confluence page title
- ✅ PG Completion: Extract PG Readiness from remote links, fetch Confluence page title
- ✅ Related ticket counts: Outstanding Tasks, Bugs, Tests, Other Tickets (with JQL links)

### 6. CG/PG Readiness Extraction
- ✅ Fetch remote links via `/api/jira/remote-links/:issueKey`
- ✅ Quick match on URL/title for CG/PG Readiness
- ✅ Fetch Confluence page titles for generic links
- ✅ Fetch Confluence labels for better identification
- ✅ Match based on title and labels containing "cg/pg" + "readiness/checklist/completion"
- ✅ Store in `issue._readinessLinks.cg` and `issue._readinessLinks.pg`

### 7. Configuration
- ✅ Port configurable via `.env` (PORT) or `config.json` (server.port)
- ✅ Jira token from `.env` (JIRA_API_TOKEN)
- ✅ Confluence token from `.env` (CONFLUENCE_API_TOKEN)
- ✅ No `.txt` file dependencies (all via `.env`)

## Files Structure
- `server.js`: Express server, API endpoints, remote links fetching, CG/PG identification
- `jira-client-clean.js`: Jira API client, data formatting, issue processing
- `confluence-client.js`: Confluence API client, page title/label fetching
- `config.js`: Configuration management (env > config.json > defaults)
- `public/index.html`: Frontend interface, table rendering, status tiles, field name mapping
- `backend-default-config.json`: Default column configuration
- `user-column-config.json`: User-defined column configuration

## Critical Implementation Details

### Remote Links & CG/PG Readiness
1. Fetch remote links for each issue via Jira API
2. Quick check: Match URL/title for "cg-readiness" or "pg-readiness"
3. If no quick match, fetch Confluence page titles for generic links
4. Fetch Confluence labels for additional identification
5. Match based on title + labels containing "cg/pg" + "readiness/checklist/completion"
6. Store links in `issue._readinessLinks` for frontend display

### Field Name Mapping
1. Fetch field names from `/api/field-names` endpoint
2. Store in `fieldNameMap` object
3. Use in `createTableHeader()` to display correct names
4. Fallback to column label if field name not found

### Table Visibility
1. Ensure table container is visible before rendering
2. Set `display: block`, `visibility: visible`, `opacity: 1`
3. Create table header before rendering body
4. Verify table body has rows after rendering
5. Scroll to table after data load

### Status Tiles
1. Extract unique statuses from fetched issues
2. Count occurrences of each status
3. Sort by count (descending)
4. Assign colors/icons based on status keywords
5. First tile: "TOTAL TICKETS" with total count
6. Responsive grid: `repeat(auto-fit, minmax(100px, 1fr))`

## Testing Checklist
After implementation, verify:
- [ ] Page loads with only JQL field visible (no auto-load)
- [ ] Clicking "Fetch Data" shows status tiles with actual statuses
- [ ] Clicking "Fetch Data" shows data table with FEAT/INITIATIVE tickets
- [ ] Table is visible and scrollable
- [ ] All columns are visible and populated
- [ ] CG/PG Completion columns show links (when available)
- [ ] Related ticket counts are clickable and generate correct JQL
- [ ] Custom field names display correctly (not IDs)
- [ ] Status tiles show actual Jira statuses with accurate counts
- [ ] Total tickets count is correct (not limited to 100)
- [ ] Resolution shows "Unresolved" when null
- [ ] Risk Indicator and Status Update values display correctly
- [ ] Remote links are fetched and CG/PG Readiness identified correctly
- [ ] Confluence page titles are fetched for generic links
- [ ] Authentication flow works (token in localStorage)

## Code Quality Requirements
- ✅ Clear console logging for debugging (can be reduced for production)
- ✅ Error handling for all API calls
- ✅ Proper null/undefined checks
- ✅ Clean, readable code structure
- ✅ Comments for complex logic
- ✅ Remove temporary test files
- ✅ Create proper test suite

## Known Issues to Address
1. **Table Visibility**: May need explicit display settings after data load
2. **Debug Logging**: Excessive console.log statements may need cleanup
3. **Test Files**: Temporary test files should be removed or organized
4. **Error Handling**: Some edge cases may need better error messages

## Next Steps
1. Verify table displays correctly after "Fetch Data"
2. Clean up debug logging (keep essential logs)
3. Remove or organize temporary test files
4. Create comprehensive test suite
5. Document API endpoints and data flow
6. Optimize performance (parallel fetching, caching)
