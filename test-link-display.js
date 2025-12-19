// Test to verify link display logic
const testData = {
  // Simulate what backend sends
  _readinessLinks: {
    cg: [
      { url: 'https://confluence.eng.nutanix.com:8443/spaces/ED/pages/468276167/NDB-2.10+CG+Readiness', title: 'NDB 2.10 CG Readiness' }
    ],
    pg: null
  }
};

// Simulate jira-client-clean.js formatting
const formattedIssue = {};
const readinessLinks = testData._readinessLinks?.cg;

if (Array.isArray(readinessLinks) && readinessLinks.length > 0) {
  if (readinessLinks[0] && typeof readinessLinks[0] === 'object' && readinessLinks[0].url) {
    formattedIssue.cg = readinessLinks.map(link => link.url).join(', ');
    formattedIssue.cg_links = readinessLinks;
  }
} else {
  formattedIssue.cg = 'No link';
}

console.log('Formatted issue:', JSON.stringify(formattedIssue, null, 2));

// Simulate frontend rendering
const issue = formattedIssue;
const column = { key: 'cg', type: 'confluence' };
const value = issue[column.key];

console.log('\nFrontend rendering:');
console.log('value:', value);
console.log('cg_links:', issue.cg_links);

const linksKey = column.key + '_links';
const linkObjects = issue[linksKey] || [];

console.log('linkObjects:', linkObjects);

if (linkObjects.length > 0) {
  const html = linkObjects.map((linkObj, idx) => {
    const url = linkObj.url || linkObj;
    const title = linkObj.title || `Link ${idx + 1}`;
    return `<a href="${url}">${title}</a>`;
  }).join(' | ');
  console.log('\n✅ Rendered HTML:', html);
} else {
  console.log('\n❌ No link objects found');
}

