/**
 * ISIDORE PAGE WRITER
 *
 * Takes an approved proposal and generates the page content using Claude.
 * Uses prompts/write.md as the system prompt.
 *
 * Usage:
 *   node saint/write-page.js                    # Write first approved proposal
 *   node saint/write-page.js "Page Title"       # Write specific proposal by title
 *   node saint/write-page.js --all              # Write all approved proposals
 *
 * Requires:
 *   ANTHROPIC_API_KEY environment variable
 */

const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

const QUEUE_PATH = path.join(__dirname, 'queue.json');
const VAULT_PATH = path.join(__dirname, '..', 'vault');
const WRITE_PROMPT_PATH = path.join(__dirname, 'prompts', 'write.md');

const MODEL = 'claude-3-5-haiku-20241022';

/**
 * Map rung names to folder paths
 */
const RUNG_TO_FOLDER = {
  'I. THE SELF': 'I-self',
  'I-self': 'I-self',
  'I. SELF': 'I-self',
  'I': 'I-self',
  'II. THE BODY': 'II-body',
  'II-body': 'II-body',
  'II. BODY': 'II-body',
  'II': 'II-body',
  'III. THE REFERENCE': 'III-reference',
  'III-reference': 'III-reference',
  'III. REFERENCE': 'III-reference',
  'III': 'III-reference',
  'IV. THE COMMUNITY': 'IV-community',
  'IV-community': 'IV-community',
  'IV. COMMUNITY': 'IV-community',
  'IV': 'IV-community',
  'V. THE SYSTEM': 'V-system',
  'V-system': 'V-system',
  'V. SYSTEM': 'V-system',
  'V': 'V-system',
  'VI. THE FIELD': 'VI-field',
  'VI-field': 'VI-field',
  'VI. FIELD': 'VI-field',
  'VI': 'VI-field',
  'VII. THE WORLD': 'VII-world',
  'VII-world': 'VII-world',
  'VII. WORLD': 'VII-world',
  'VII': 'VII-world',
  'VIII. THE METHOD': 'VIII-method',
  'VIII-method': 'VIII-method',
  'VIII. METHOD': 'VIII-method',
  'VIII': 'VIII-method'
};

/**
 * Initialize the Anthropic client
 */
function createClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is not set.');
    console.error('Please set it before running this script:');
    console.error('  export ANTHROPIC_API_KEY=your-api-key');
    process.exit(1);
  }

  return new Anthropic({ apiKey });
}

/**
 * Load the queue
 */
function loadQueue() {
  if (!fs.existsSync(QUEUE_PATH)) {
    console.error('Error: queue.json not found.');
    console.error('Please run "node saint/generate.js" first.');
    process.exit(1);
  }

  const content = fs.readFileSync(QUEUE_PATH, 'utf-8');
  return JSON.parse(content);
}

/**
 * Save the queue
 */
function saveQueue(queue) {
  fs.writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2));
}

/**
 * Load the writing prompt
 */
function loadWritePrompt() {
  if (!fs.existsSync(WRITE_PROMPT_PATH)) {
    console.error('Error: prompts/write.md not found.');
    process.exit(1);
  }

  return fs.readFileSync(WRITE_PROMPT_PATH, 'utf-8');
}

/**
 * Convert title to filename
 */
function titleToFilename(title) {
  return title
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    + '.md';
}

/**
 * Get the folder path for a rung
 */
function getRungFolder(rung) {
  // Normalize the rung name
  const normalizedRung = rung.trim().toUpperCase();

  // Try direct match first
  if (RUNG_TO_FOLDER[rung]) {
    return RUNG_TO_FOLDER[rung];
  }

  // Try normalized match
  for (const [key, folder] of Object.entries(RUNG_TO_FOLDER)) {
    if (key.toUpperCase() === normalizedRung) {
      return folder;
    }
  }

  // Try to extract Roman numeral
  const romanMatch = rung.match(/^(I{1,3}|IV|VI{0,3}|I?X)/i);
  if (romanMatch) {
    const roman = romanMatch[1].toUpperCase();
    if (RUNG_TO_FOLDER[roman]) {
      return RUNG_TO_FOLDER[roman];
    }
  }

  // Default to hidden if we can't determine the rung
  console.warn(`Warning: Could not determine folder for rung "${rung}", using "hidden"`);
  return 'hidden';
}

/**
 * Format proposal for Claude
 */
function formatProposalForPrompt(proposal) {
  return `## Page Request

**Title:** ${proposal.title}
**Rung:** ${proposal.rung}
**Content Type:** ${proposal.content_type || 'text'}

### Rationale
${proposal.rationale}

### Verification (if any)
${proposal.verification || 'None provided - please verify facts before writing.'}

### Should Link To
${proposal.links_to ? proposal.links_to.map(l => `- [[${l}]]`).join('\n') : 'Determine appropriate links'}

### Referenced By
${proposal.links_from ? proposal.links_from.map(l => `- [[${l}]]`).join('\n') : 'Unknown'}

---

Please write the complete page content following the structure in your system prompt.
Include proper YAML frontmatter, title, sections, and wikilinks.
Remember: critical but warm, precise but accessible.`;
}

/**
 * Extract markdown content from Claude's response
 */
function extractMarkdown(responseText) {
  // If response is wrapped in code blocks, extract it
  const codeBlockMatch = responseText.match(/```(?:markdown|md)?\n([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // Otherwise return the raw response (it's likely already markdown)
  return responseText.trim();
}

/**
 * Write a single page
 */
async function writePage(client, systemPrompt, proposal) {
  console.log(`\nWriting: "${proposal.title}"`);
  console.log(`  Rung: ${proposal.rung}`);

  const userMessage = formatProposalForPrompt(proposal);

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userMessage
        }
      ]
    });

    // Extract text response
    const responseText = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n');

    const markdown = extractMarkdown(responseText);

    // Determine output path
    const folder = getRungFolder(proposal.rung);
    const filename = titleToFilename(proposal.title);
    const folderPath = path.join(VAULT_PATH, folder);
    const filePath = path.join(folderPath, filename);

    // Ensure folder exists
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    // Check if file already exists
    if (fs.existsSync(filePath)) {
      console.warn(`  Warning: File already exists at ${filePath}`);
      console.warn(`  Saving to ${filePath}.new instead`);
      fs.writeFileSync(filePath + '.new', markdown);
    } else {
      fs.writeFileSync(filePath, markdown);
    }

    console.log(`  Saved to: ${path.relative(VAULT_PATH, filePath)}`);

    return {
      success: true,
      path: filePath,
      proposal
    };

  } catch (error) {
    console.error(`  Error writing page: ${error.message || error}`);
    return {
      success: false,
      error: error.message || error,
      proposal
    };
  }
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);

  console.log('Isidore begins writing...\n');

  // Initialize
  const client = createClient();
  const queue = loadQueue();
  const systemPrompt = loadWritePrompt();

  // Check for approved proposals
  if (!queue.approved || queue.approved.length === 0) {
    console.log('No approved proposals to write.');
    console.log('Run "node saint/generate.js" to generate proposals,');
    console.log('then "node saint/approve.js" to approve them.');
    process.exit(0);
  }

  console.log(`Found ${queue.approved.length} approved proposal(s)`);

  // Determine which proposals to write
  let toWrite = [];

  if (args.includes('--all')) {
    toWrite = [...queue.approved];
  } else if (args.length > 0 && !args[0].startsWith('--')) {
    const title = args.join(' ');
    const match = queue.approved.find(p =>
      p.title.toLowerCase() === title.toLowerCase()
    );
    if (!match) {
      console.error(`Error: No approved proposal found with title "${title}"`);
      console.log('\nApproved proposals:');
      queue.approved.forEach(p => console.log(`  - "${p.title}"`));
      process.exit(1);
    }
    toWrite = [match];
  } else {
    // Default: write first approved
    toWrite = [queue.approved[0]];
  }

  console.log(`Writing ${toWrite.length} page(s)...\n`);

  // Write each page
  const results = [];
  for (const proposal of toWrite) {
    const result = await writePage(client, systemPrompt, proposal);
    results.push(result);

    // Remove from approved if successful
    if (result.success) {
      queue.approved = queue.approved.filter(p => p.title !== proposal.title);

      // Add to a "written" array for tracking
      if (!queue.written) {
        queue.written = [];
      }
      queue.written.push({
        ...proposal,
        written_at: new Date().toISOString(),
        path: result.path
      });
    }
  }

  // Save updated queue
  saveQueue(queue);

  // Summary
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`\n=== SUMMARY ===`);
  console.log(`Written: ${successful}`);
  console.log(`Failed: ${failed}`);
  console.log(`Remaining approved: ${queue.approved.length}`);

  if (failed > 0) {
    console.log('\nFailed pages:');
    results
      .filter(r => !r.success)
      .forEach(r => console.log(`  - "${r.proposal.title}": ${r.error}`));
  }

  console.log('\nIsidore rests.\n');
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
}

module.exports = { writePage, titleToFilename, getRungFolder };
