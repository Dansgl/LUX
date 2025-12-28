/**
 * ISIDORE APPROVAL CLI
 *
 * Review and approve proposals from the research saint.
 *
 * Usage:
 *   node saint/approve.js
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const QUEUE_PATH = path.join(__dirname, 'queue.json');
const VAULT_PATH = path.join(__dirname, '..', 'vault');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise(resolve => rl.question(prompt, resolve));
}

async function review() {
  if (!fs.existsSync(QUEUE_PATH)) {
    console.log('No queue.json found. Run index.js first.');
    process.exit(1);
  }

  const queue = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf-8'));

  if (!queue.proposals || queue.proposals.length === 0) {
    console.log('No proposals in queue.');
    process.exit(0);
  }

  console.log(`\n=== ISIDORE PROPOSALS ===`);
  console.log(`Date: ${queue.date || 'N/A'}`);
  console.log(`Proposals: ${queue.proposals.length}\n`);

  const approved = [];
  const rejected = [];

  for (let i = 0; i < queue.proposals.length; i++) {
    const p = queue.proposals[i];

    console.log(`\n--- Proposal ${i + 1}/${queue.proposals.length} ---`);
    console.log(`Title: ${p.title}`);
    console.log(`Rung: ${p.rung}`);
    console.log(`Rationale: ${p.rationale}`);
    console.log(`Links to: ${p.links_to?.join(', ') || 'N/A'}`);
    console.log(`Type: ${p.content_type || 'text'}`);

    const action = await question('\n[a]pprove / [r]eject / [s]kip / [q]uit? ');

    switch (action.toLowerCase()) {
      case 'a':
        approved.push(p);
        console.log('✓ Approved');
        break;
      case 'r':
        rejected.push(p);
        console.log('✗ Rejected');
        break;
      case 's':
        console.log('→ Skipped (will remain in queue)');
        break;
      case 'q':
        console.log('\nExiting...');
        rl.close();
        process.exit(0);
      default:
        console.log('→ Skipped');
    }
  }

  // Summary
  console.log(`\n=== SUMMARY ===`);
  console.log(`Approved: ${approved.length}`);
  console.log(`Rejected: ${rejected.length}`);

  if (approved.length > 0) {
    console.log('\nApproved proposals need content. Run with Claude to generate pages.');
  }

  // Clear processed proposals from queue
  const remaining = queue.proposals.filter(p =>
    !approved.includes(p) && !rejected.includes(p)
  );

  fs.writeFileSync(QUEUE_PATH, JSON.stringify({
    date: queue.date,
    proposals: remaining,
    approved,
    rejected
  }, null, 2));

  console.log('\nQueue updated.');
  rl.close();
}

review().catch(console.error);
