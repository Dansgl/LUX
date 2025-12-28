/**
 * ISIDORE — The Research Saint
 *
 * A daemon that reads the vault, identifies gaps, and proposes new content.
 * Named for Isidore of Seville, patron saint of the internet.
 *
 * Usage:
 *   node saint/index.js           # Run evaluation, output proposals
 *   node saint/approve.js         # Review and approve proposals
 */

const fs = require('fs');
const path = require('path');

const VAULT_PATH = path.join(__dirname, '..', 'vault');
const QUEUE_PATH = path.join(__dirname, 'queue.json');

/**
 * Recursively find all markdown files in the vault
 */
function findMarkdownFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      files.push(...findMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Extract all [[wikilinks]] from a markdown file
 */
function extractWikilinks(content) {
  const regex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  const links = [];
  let match;

  while ((match = regex.exec(content)) !== null) {
    links.push(match[1].trim());
  }

  return links;
}

/**
 * Build a map of all pages and their links
 */
function buildGraph() {
  const files = findMarkdownFiles(VAULT_PATH);
  const pages = new Map();
  const allLinks = new Set();

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const relativePath = path.relative(VAULT_PATH, file);
    const name = path.basename(file, '.md');
    const links = extractWikilinks(content);

    pages.set(name, {
      path: relativePath,
      content,
      outbound: links,
      inbound: []
    });

    links.forEach(link => allLinks.add(link));
  }

  // Build inbound links
  for (const [name, page] of pages) {
    for (const link of page.outbound) {
      if (pages.has(link)) {
        pages.get(link).inbound.push(name);
      }
    }
  }

  return { pages, allLinks };
}

/**
 * Find orphaned references (links to pages that don't exist)
 */
function findOrphanedReferences(pages, allLinks) {
  const orphans = [];

  for (const link of allLinks) {
    if (!pages.has(link)) {
      // Find which pages reference this orphan
      const referencedBy = [];
      for (const [name, page] of pages) {
        if (page.outbound.includes(link)) {
          referencedBy.push(name);
        }
      }
      orphans.push({ title: link, referencedBy });
    }
  }

  return orphans;
}

/**
 * Find dead ends (pages with no outbound links)
 */
function findDeadEnds(pages) {
  const deadEnds = [];

  for (const [name, page] of pages) {
    if (page.outbound.length === 0) {
      deadEnds.push(name);
    }
  }

  return deadEnds;
}

/**
 * Count pages per rung
 */
function countByRung(pages) {
  const rungs = {
    'I-self': 0,
    'II-body': 0,
    'III-reference': 0,
    'IV-community': 0,
    'V-system': 0,
    'VI-field': 0,
    'VII-world': 0,
    'VIII-method': 0,
    'hidden': 0,
    'root': 0
  };

  for (const [name, page] of pages) {
    const rung = page.path.split(path.sep)[0];
    if (rungs.hasOwnProperty(rung)) {
      rungs[rung]++;
    } else {
      rungs['root']++;
    }
  }

  return rungs;
}

/**
 * Main evaluation function
 */
function evaluate() {
  console.log('Isidore awakens...\n');

  const { pages, allLinks } = buildGraph();

  console.log(`Found ${pages.size} pages with ${allLinks.size} unique links\n`);

  // Orphaned references
  const orphans = findOrphanedReferences(pages, allLinks);
  console.log(`Orphaned references: ${orphans.length}`);
  orphans.slice(0, 10).forEach(o => {
    console.log(`  - "${o.title}" (referenced by: ${o.referencedBy.join(', ')})`);
  });

  // Dead ends
  const deadEnds = findDeadEnds(pages);
  console.log(`\nDead ends: ${deadEnds.length}`);
  deadEnds.forEach(d => console.log(`  - ${d}`));

  // Coverage by rung
  const coverage = countByRung(pages);
  console.log('\nCoverage by rung:');
  Object.entries(coverage).forEach(([rung, count]) => {
    console.log(`  ${rung}: ${count} pages`);
  });

  // Save report (for future AI evaluation)
  const report = {
    timestamp: new Date().toISOString(),
    stats: {
      totalPages: pages.size,
      totalLinks: allLinks.size,
      orphanedReferences: orphans.length,
      deadEnds: deadEnds.length
    },
    orphans: orphans.slice(0, 20),
    deadEnds,
    coverage
  };

  fs.writeFileSync(
    path.join(__dirname, 'report.json'),
    JSON.stringify(report, null, 2)
  );

  console.log('\nReport saved to saint/report.json');
  console.log('Isidore rests.\n');
}

// Run if called directly
if (require.main === module) {
  evaluate();
}

module.exports = { evaluate, buildGraph, findOrphanedReferences };
