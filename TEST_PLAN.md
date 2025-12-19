# NDB Weekly Status - Test Plan

## Test Environment Setup
- Server running on port 7842 (or configured port)
- Jira API token in `.env` (JIRA_API_TOKEN)
- Confluence API token in `.env` (CONFLUENCE_API_TOKEN)
- Browser with localStorage access

## Test Cases

### TC-001: Initial Page Load
**Objective**: Verify page loads correctly with no auto-loading

**Steps**:
1. Open application in browser
2. Observe initial state

**Expected Results**:
- ✅ JQL query field is visible and preloaded with default value
- ✅ "Fetch Data" button is visible
- ✅ Status tiles section is NOT visible
- ✅ Table container is NOT visible
- ✅ No API calls made automatically

**Status**: ⚠️ Needs Verification

---

### TC-002: Fetch Data - Basic Functionality
**Objective**: Verify data fetching works correctly

**Steps**:
1. Enter JQL query: `filter = 165194` (or valid JQL)
2. Click "Fetch Data" button
3. Wait for data to load

**Expected Results**:
- ✅ Loading indicator appears
- ✅ Status tiles appear with actual Jira statuses
- ✅ Table appears with FEAT/INITIATIVE tickets
- ✅ Total tickets count is correct (not limited to 100)
- ✅ All columns are visible

**Status**: ⚠️ Needs Verification

---

### TC-003: Status Tiles - Dynamic Generation
**Objective**: Verify status tiles show actual Jira statuses

**Steps**:
1. Fetch data with JQL that returns multiple statuses
2. Observe status tiles

**Expected Results**:
- ✅ First tile shows "TOTAL TICKETS" with total count
- ✅ Other tiles show actual status names (e.g., "EC commit", "backlog")
- ✅ Counts are accurate for each status
- ✅ Tiles are sorted by count (descending)
- ✅ Tiles have appropriate colors/icons
- ✅ Tiles are compact (100px min width, 8px gap)

**Status**: ⚠️ Needs Verification

---

### TC-004: Table Display - FEAT/INITIATIVE Filtering
**Objective**: Verify only FEAT/INITIATIVE tickets are shown

**Steps**:
1. Fetch data with JQL that returns mixed issue types
2. Observe table contents

**Expected Results**:
- ✅ Table shows only FEAT or INITIATIVE tickets
- ✅ If no FEAT/INITIATIVE found, shows all tickets (for debugging)
- ✅ All tickets are displayed (no pagination)
- ✅ Table is scrollable if many tickets

**Status**: ⚠️ Needs Verification

---

### TC-005: Table Columns - Standard Fields
**Objective**: Verify all standard columns display correctly

**Steps**:
1. Fetch data
2. Observe table columns

**Expected Results**:
- ✅ Key: Clickable link to Jira issue
- ✅ Summary: Full text with wrapping
- ✅ Status: Badge with status name
- ✅ Priority: Badge with priority
- ✅ Assignee: Name or "Unassigned"
- ✅ Resolution: Shows "Unresolved" when null/empty
- ✅ Issue Type: Badge with type name
- ✅ Created Date: Date formatted
- ✅ Updated Date: Date formatted

**Status**: ⚠️ Needs Verification

---

### TC-006: Table Columns - Custom Fields
**Objective**: Verify custom fields display correctly

**Steps**:
1. Fetch data with issues containing custom fields
2. Observe custom field columns

**Expected Results**:
- ✅ Status Update (customfield_23073): Shows summarized/truncated value
- ✅ Risk Indicator (customfield_23560): Shows actual value (extracted from option)
- ✅ Custom field names displayed (not raw IDs like "Customfield 23073")
- ✅ Field names fetched from `/api/field-names` endpoint

**Status**: ⚠️ Needs Verification

---

### TC-007: CG/PG Completion - Link Extraction
**Objective**: Verify CG/PG Readiness links are extracted and displayed

**Steps**:
1. Fetch data for issue with remote links (e.g., FEAT-18289)
2. Observe CG/PG Completion columns

**Expected Results**:
- ✅ CG Completion column shows link if CG Readiness page exists
- ✅ PG Completion column shows link if PG Readiness page exists
- ✅ Links are clickable and open Confluence page
- ✅ Column headers show "CG Completion" and "PG Completion" (not "CG Page" or "PG Checklist")
- ✅ Remote links are fetched via `/api/jira/remote-links/:issueKey`
- ✅ Confluence page titles are fetched for identification

**Status**: ⚠️ Needs Verification

---

### TC-008: Related Ticket Counts
**Objective**: Verify related ticket counts and JQL links work

**Steps**:
1. Fetch data for a FEAT/INITIATIVE issue
2. Observe related ticket count columns
3. Click on a count

**Expected Results**:
- ✅ Outstanding Tasks: Shows count with clickable JQL link
- ✅ Bugs: Shows count with clickable JQL link
- ✅ Tests: Shows count with clickable JQL link
- ✅ Other Tickets: Shows count with clickable JQL link
- ✅ Clicking count copies JQL to query field
- ✅ JQL format: `project = 'ERA' AND "Feature/Initiative Link" = "{key}" AND issuetype = "{type}"`
- ✅ Shows "0" if no related tickets

**Status**: ⚠️ Needs Verification

---

### TC-009: Authentication Flow
**Objective**: Verify authentication works correctly

**Steps**:
1. Open application
2. Click "Authenticate" button
3. Enter Jira API token
4. Save token
5. Fetch data

**Expected Results**:
- ✅ Token is stored in localStorage
- ✅ Token is sent in Authorization header: `Bearer {token}`
- ✅ Data fetching works with token
- ✅ Error message shown if token is invalid

**Status**: ⚠️ Needs Verification

---

### TC-010: Error Handling
**Objective**: Verify error handling works correctly

**Test Cases**:
1. Invalid JQL query
2. Invalid API token
3. Network error
4. No issues found
5. No FEAT/INITIATIVE tickets found

**Expected Results**:
- ✅ Clear error messages displayed
- ✅ User-friendly error handling
- ✅ Application doesn't crash
- ✅ Error messages are actionable

**Status**: ⚠️ Needs Verification

---

### TC-011: Remote Links API
**Objective**: Verify remote links are fetched correctly

**Steps**:
1. Test with issue FEAT-18289 (known to have remote links)
2. Check server logs for remote link fetching
3. Verify CG/PG Readiness links are identified

**Expected Results**:
- ✅ Remote links fetched via `/api/jira/remote-links/:issueKey`
- ✅ CG Readiness link identified (page title contains "CG Readiness")
- ✅ PG Readiness link identified (page title contains "PG Readiness")
- ✅ Confluence page titles fetched successfully
- ✅ Labels fetched for better identification

**Status**: ✅ Tested (test-feat-18289.js)

---

### TC-012: Confluence Page Title Fetching
**Objective**: Verify Confluence page titles are fetched correctly

**Steps**:
1. Test with known Confluence page URLs
2. Verify page titles are returned
3. Verify labels are fetched

**Expected Results**:
- ✅ Page titles fetched via Confluence API
- ✅ Labels fetched for identification
- ✅ Base URL correctly set for eng.nutanix.com instance
- ✅ Token authentication works

**Status**: ✅ Tested (test-fetch-page-names.js)

---

### TC-013: Field Name Mapping
**Objective**: Verify custom field names are displayed correctly

**Steps**:
1. Fetch data
2. Observe table headers
3. Verify field names (not IDs)

**Expected Results**:
- ✅ Field names fetched from `/api/field-names`
- ✅ Headers show actual names (e.g., "Status Update" not "Customfield 23073")
- ✅ Field name map is populated correctly
- ✅ Fallback to column label if field name not found

**Status**: ⚠️ Needs Verification

---

### TC-014: Performance - Large Dataset
**Objective**: Verify performance with large datasets

**Steps**:
1. Fetch data with JQL returning 500+ issues
2. Observe loading time
3. Verify all data is displayed

**Expected Results**:
- ✅ Data loads within reasonable time (< 30 seconds)
- ✅ All issues are displayed
- ✅ Table is scrollable
- ✅ No browser freezing

**Status**: ⚠️ Needs Verification

---

### TC-015: Mobile Responsiveness
**Objective**: Verify application works on mobile devices

**Steps**:
1. Open application on mobile device or resize browser
2. Test all functionality

**Expected Results**:
- ✅ Layout is responsive
- ✅ Status tiles show 3 columns on mobile
- ✅ Table is scrollable horizontally
- ✅ All buttons are clickable

**Status**: ⚠️ Needs Verification

---

## Test Execution

### Manual Testing
1. Run each test case manually
2. Document results
3. Report bugs/issues

### Automated Testing
- Create test scripts for API endpoints
- Create test scripts for data processing
- Create integration tests

## Test Data

### Test Issues
- FEAT-18289: Known to have CG/PG Readiness links
- ERA-47452: Known to have remote links
- Use filter = 165194 for standard test data

### Test JQL Queries
- `filter = 165194` - Standard filter
- `project = 'ERA' AND issuetype = 'Feature'` - Feature issues
- `project = 'ERA' AND issuetype = 'Initiative'` - Initiative issues
- `project = 'ERA' AND status != Done` - Active issues

## Bug Tracking
- Document all bugs found during testing
- Prioritize bugs (Critical, High, Medium, Low)
- Track bug fixes

## Test Results Summary
- Total Test Cases: 15
- Passed: 2 (TC-011, TC-012)
- Needs Verification: 13
- Failed: 0

## Next Steps
1. Execute all test cases
2. Fix any bugs found
3. Re-test after fixes
4. Document test results
5. Create regression test suite
