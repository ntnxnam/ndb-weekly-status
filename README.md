# NDB Weekly Status Application

A web application for fetching and displaying Jira issue data for weekly status reports. The application connects to Jira and Confluence APIs to fetch issue data, extract CG/PG Readiness links, and display them in a clean, organized table format.

## Features

- ✅ **Single JQL Query Field**: Consolidated query input for JQL, filter IDs, or feature keys
- ✅ **Dynamic Status Tiles**: Automatically generated from actual Jira statuses with accurate counts
- ✅ **FEAT/INITIATIVE Filtering**: Main table shows only Feature or Initiative tickets
- ✅ **CG/PG Readiness Links**: Automatically extracts and displays CG/PG Readiness links from remote links
- ✅ **Custom Field Names**: Displays actual field names (not raw IDs like "Customfield 23073")
- ✅ **Related Ticket Counts**: Shows counts for Outstanding Tasks, Bugs, Tests, and Other Tickets with JQL hyperlinks
- ✅ **No Pagination**: All tickets displayed at once
- ✅ **Confluence Integration**: Fetches page titles and labels for better CG/PG Readiness identification

## Prerequisites

- Node.js (v14 or higher)
- Jira API token (Bearer token)
- Confluence API token (for CG/PG Readiness link identification)
- Access to Jira and Confluence instances

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd ndb-weekly-status
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp env.example .env
```

Edit `.env` and add your tokens:
```
PORT=7842
JIRA_API_TOKEN=your_jira_token_here
CONFLUENCE_API_TOKEN=your_confluence_token_here
```

4. Configure Jira settings in `config.json`:
```json
{
  "jira": {
    "baseUrl": "https://your-jira-instance.atlassian.net"
  },
  "server": {
    "port": 7842
  }
}
```

## Usage

1. Start the server:
```bash
npm start
```

Or for development with auto-reload:
```bash
npm run dev
```

2. Open your browser and navigate to:
```
http://localhost:7842
```

3. Authenticate:
   - Click the "Authenticate" button
   - Enter your Jira API token
   - Click "Save"

4. Fetch data:
   - Enter a JQL query, filter ID, or feature key in the query field
   - Click "Fetch Data"
   - View status tiles and data table

## Testing

Run the test suite:
```bash
npm test
```

The test suite verifies:
- Server health
- Environment variables
- Configuration loading
- Field names API
- Fetch All Data API
- CG/PG Readiness identification

## Project Structure

```
ndb-weekly-status/
├── server.js                 # Express server and API endpoints
├── jira-client-clean.js      # Jira API client and data formatting
├── confluence-client.js      # Confluence API client
├── config.js                 # Configuration management
├── public/
│   └── index.html            # Frontend interface
├── tests/
│   └── test-suite.js         # Test suite
├── backend-default-config.json
├── user-column-config.json
├── config.json
├── .env
└── package.json
```

## API Endpoints

- `GET /api/health` - Server health check
- `GET /api/fetch-all-data?jql=<query>` - Fetch all issues matching JQL
- `GET /api/field-names` - Get Jira field name mappings
- `GET /api/table-config` - Get table configuration
- `GET /api/refresh-columns?jql=<query>` - Refresh columns with data

## Configuration

### Port Configuration
Port can be configured via:
1. Environment variable: `PORT` in `.env`
2. `config.json`: `server.port`
3. Default: `7842`

### Token Configuration
Tokens are loaded from `.env`:
- `JIRA_API_TOKEN`: Jira API Bearer token
- `CONFLUENCE_API_TOKEN`: Confluence API Bearer token

## Features in Detail

### Status Tiles
- Dynamically generated from actual Jira statuses
- Shows accurate counts for each status
- First tile shows "TOTAL TICKETS"
- Compact design (100px min width, 8px gap)
- Responsive (3 columns on mobile)

### CG/PG Readiness Links
- Automatically fetched from Jira remote links
- Confluence page titles fetched for identification
- Labels checked for better matching
- Displayed in "CG Completion" and "PG Completion" columns

### Related Ticket Counts
- Outstanding Tasks: `issuetype IN (Task, Story, Sub-task)`
- Bugs: `issuetype = Bug`
- Tests: `issuetype = Test`
- Other Tickets: `issuetype NOT IN (Task, Story, Sub-task, Bug, Test, Feature, Initiative)`
- Each count is clickable and generates JQL query

## Requirements

See `REQUIREMENTS.md` for complete requirements documentation.

## Test Plan

See `TEST_PLAN.md` for detailed test cases and execution plan.

## Implementation

See `IMPLEMENTATION_PROMPT.md` for implementation details and current state.

## License

MIT

## Author

ntnxnam
