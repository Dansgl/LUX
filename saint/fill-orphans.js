/**
 * ISIDORE BATCH FILL
 *
 * Automatically fills all orphaned references by running multiple cycles
 * of generate → auto-approve → write until no orphans remain.
 */

const fs = require('fs');
const path = require('path');
const { evaluate, buildGraph, findOrphanedReferences } = require('./index.js');

// Load .env
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, ...val] = line.split('=');
    if (key && val.length) process.env[key.trim()] = val.join('=').trim();
  });
}

const QUEUE_PATH = path.join(__dirname, 'queue.json');
const MODEL = 'anthropic/claude-3-5-haiku';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const VAULT_PATH = path.join(__dirname, '..', 'vault');
const MAX_CYCLES = 15;
const BATCH_SIZE = 5;

async function callOpenRouter(systemPrompt, userMessage) {
  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/Dansgl/LUX',
      'X-Title': 'Isidore Batch Fill'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error (${response.status}): ${error}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

function getOrphanCount() {
  const { pages, allLinks } = buildGraph();
  const orphans = findOrphanedReferences(pages, allLinks);
  return { orphans, count: orphans.length, pages: pages.size };
}

async function generateProposals(orphans) {
  const evalPrompt = fs.readFileSync(path.join(__dirname, 'prompts', 'evaluate.md'), 'utf-8');

  const topOrphans = orphans.slice(0, 10);
  const userMessage = `Orphaned references to fill (create pages for these):\n${topOrphans.map(o => `- "${o.title}" (referenced by: ${o.referencedBy.join(', ')})`).join('\n')}\n\nReturn exactly ${BATCH_SIZE} proposals as a JSON array.`;

  const response = await callOpenRouter(evalPrompt, userMessage);

  const jsonMatch = response.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  try {
    return JSON.parse(jsonMatch[0]).slice(0, BATCH_SIZE);
  } catch {
    return [];
  }
}

async function writePage(proposal) {
  const writePrompt = fs.readFileSync(path.join(__dirname, 'prompts', 'write.md'), 'utf-8');
  const userMessage = `Write a page for: "${proposal.title}" (Rung: ${proposal.rung})\nRationale: ${proposal.rationale}`;

  const content = await callOpenRouter(writePrompt, userMessage);

  // Extract markdown
  const markdown = content.replace(/```(?:markdown|md)?\n([\s\S]*?)```/, '$1').trim();

  // Determine folder
  const rungMap = {
    'I': 'I-self', 'II': 'II-body', 'III': 'III-reference', 'IV': 'IV-community',
    'V': 'V-system', 'VI': 'VI-field', 'VII': 'VII-world', 'VIII': 'VIII-method'
  };
  const romanMatch = (proposal.rung || '').match(/^(I{1,3}|IV|VI{0,3})/i);
  const folder = romanMatch ? (rungMap[romanMatch[1].toUpperCase()] || 'hidden') : 'hidden';

  const folderPath = path.join(VAULT_PATH, folder);
  if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

  const filePath = path.join(folderPath, `${proposal.title}.md`);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, markdown);
    return true;
  }
  return false;
}

async function main() {
  console.log('=== ISIDORE BATCH FILL ===\n');

  if (!process.env.OPENROUTER_API_KEY) {
    console.error('Error: No API key. Create saint/.env with OPENROUTER_API_KEY=...');
    process.exit(1);
  }

  let totalWritten = 0;

  for (let cycle = 1; cycle <= MAX_CYCLES; cycle++) {
    const { orphans, count, pages } = getOrphanCount();

    console.log(`\n--- Cycle ${cycle}/${MAX_CYCLES} ---`);
    console.log(`Pages: ${pages} | Orphans: ${count}`);

    if (count === 0) {
      console.log('\nAll orphans filled!');
      break;
    }

    console.log('Generating proposals...');
    const proposals = await generateProposals(orphans);

    if (proposals.length === 0) {
      console.log('No proposals generated, retrying...');
      continue;
    }

    console.log(`Writing ${proposals.length} pages...`);

    for (const proposal of proposals) {
      try {
        const written = await writePage(proposal);
        if (written) {
          console.log(`  ✓ ${proposal.title}`);
          totalWritten++;
        } else {
          console.log(`  - ${proposal.title} (exists)`);
        }
      } catch (err) {
        console.log(`  ✗ ${proposal.title}: ${err.message}`);
      }
    }
  }

  console.log(`\n=== COMPLETE ===`);
  console.log(`Total pages written: ${totalWritten}`);

  const final = getOrphanCount();
  console.log(`Remaining orphans: ${final.count}`);
}

main().catch(console.error);
