/**
 * Mock JIRA Service for testing when real JIRA authentication is not available
 */

class MockJiraService {
  constructor() {
    this.mockIssues = [
      {
        key: 'ERA-1234',
        fields: {
          summary: 'Implement new feature for data processing',
          status: { name: 'In Progress' },
          assignee: { displayName: 'John Doe', name: 'john.doe' },
          priority: { name: 'High' },
          issuetype: { name: 'Story' },
          project: { name: 'ERA' },
          created: '2025-10-01T10:00:00.000Z',
          updated: '2025-10-15T14:30:00.000Z',
          customfield_35863: 'This is a custom field value',
          customfield_10020: 'Additional custom field data',
          labels: ['enhancement', 'backend'],
          components: [{ name: 'API' }, { name: 'Database' }]
        }
      },
      {
        key: 'ERA-1235',
        fields: {
          summary: 'Fix bug in authentication module',
          status: { name: 'Done' },
          assignee: { displayName: 'Jane Smith', name: 'jane.smith' },
          priority: { name: 'Medium' },
          issuetype: { name: 'Bug' },
          project: { name: 'ERA' },
          created: '2025-10-05T09:15:00.000Z',
          updated: '2025-10-14T16:45:00.000Z',
          customfield_35863: 'Bug fix completed',
          customfield_10020: 'Testing completed',
          labels: ['bug', 'frontend'],
          components: [{ name: 'Authentication' }]
        }
      },
      {
        key: 'ERA-1236',
        fields: {
          summary: 'Add unit tests for new components',
          status: { name: 'To Do' },
          assignee: { displayName: 'Mike Johnson', name: 'mike.johnson' },
          priority: { name: 'Low' },
          issuetype: { name: 'Task' },
          project: { name: 'ERA' },
          created: '2025-10-10T11:20:00.000Z',
          updated: '2025-10-10T11:20:00.000Z',
          customfield_35863: 'Test coverage improvement',
          customfield_10020: 'Quality assurance',
          labels: ['testing', 'quality'],
          components: [{ name: 'Testing' }]
        }
      },
      {
        key: 'ERA-1237',
        fields: {
          summary: 'Update documentation for API changes',
          status: { name: 'In Progress' },
          assignee: { displayName: 'Sarah Wilson', name: 'sarah.wilson' },
          priority: { name: 'Medium' },
          issuetype: { name: 'Task' },
          project: { name: 'ERA' },
          created: '2025-10-12T08:30:00.000Z',
          updated: '2025-10-15T12:15:00.000Z',
          customfield_35863: 'Documentation update',
          customfield_10020: 'API documentation',
          labels: ['documentation', 'api'],
          components: [{ name: 'Documentation' }]
        }
      },
      {
        key: 'ERA-1238',
        fields: {
          summary: 'Performance optimization for database queries',
          status: { name: 'Done' },
          assignee: { displayName: 'Alex Brown', name: 'alex.brown' },
          priority: { name: 'High' },
          issuetype: { name: 'Story' },
          project: { name: 'ERA' },
          created: '2025-10-08T14:00:00.000Z',
          updated: '2025-10-16T10:30:00.000Z',
          customfield_35863: 'Performance improvement',
          customfield_10020: 'Database optimization',
          labels: ['performance', 'database'],
          components: [{ name: 'Database' }, { name: 'Performance' }]
        }
      }
    ];
  }

  async searchIssues(jql, fields) {
    console.log('🔧 Mock JIRA: Searching with JQL:', jql);
    console.log('🔧 Mock JIRA: Requested fields:', fields);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return {
      data: {
        total: this.mockIssues.length,
        issues: this.mockIssues
      }
    };
  }

  async getIssueDetails(issueKey) {
    console.log('🔧 Mock JIRA: Getting issue details for:', issueKey);
    
    const issue = this.mockIssues.find(i => i.key === issueKey);
    if (!issue) {
      throw new Error(`Issue ${issueKey} not found`);
    }
    
    return issue;
  }
}

module.exports = MockJiraService;
