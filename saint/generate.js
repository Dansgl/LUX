/**
 * ISIDORE AI GENERATION
 *
 * Uses Claude via OpenRouter to analyze the vault report and propose new pages.
 * Reads report.json, calls Claude Haiku with evaluate.md prompt,
 * and saves proposals to queue.json.
 *
 * Usage:
 *   node saint/generate.js
 *
 * Requires:
 *   OPENROUTER_API_KEY environment variable
 */

const fs = require('fs');
const path = require('path');

// Load .env file if it exists
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, ...val] = line.split('=');
    if (key && val.length) process.env[key.trim()] = val.join('=').trim();
  });
}

const REPORT_PATH = path.join(__dirname, 'report.json');
const QUEUE_PATH = path.join(__dirname, 'queue.json');
const EVALUATE_PROMPT_PATH = path.join(__dirname, 'prompts', 'evaluate.md');

const MODEL = 'anthropic/claude-3-5-haiku';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_PROPOSALS = 5;

/**
 * Get API key from environment
 */
function getApiKey() {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    console.error('Error: OPENROUTER_API_KEY environment variable is not set.');
    console.error('Please set it before running this script:');
    console.error('  export OPENROUTER_API_KEY=your-api-key');
    process.exit(1);
  }

  return apiKey;
}

/**
 * Load the vault report
 */
function loadReport() {
  if (!fs.existsSync(REPORT_PATH)) {
    console.error('Error: report.json not found.');
    console.error('Please run "node saint/index.js" first to generate the report.');
    process.exit(1);
  }

  const content = fs.readFileSync(REPORT_PATH, 'utf-8');
  return JSON.parse(content);
}

/**
 * Load the evaluation prompt
 */
function loadEvaluatePrompt() {
  if (!fs.existsSync(EVALUATE_PROMPT_PATH)) {
    console.error('Error: prompts/evaluate.md not found.');
    process.exit(1);
  }

  return fs.readFileSync(EVALUATE_PROMPT_PATH, 'utf-8');
}

/**
 * Format the report for Claude
 */
function formatReportForPrompt(report) {
  return `## Vault Analysis Report

**Generated:** ${report.timestamp}

### Statistics
- Total pages: ${report.stats.totalPages}
- Total unique links: ${report.stats.totalLinks}
- Orphaned references: ${report.stats.orphanedReferences}
- Dead ends: ${report.stats.deadEnds}

### Coverage by Rung
${Object.entries(report.coverage)
  .map(([rung, count]) => `- ${rung}: ${count} pages`)
  .join('\n')}

### Orphaned References (pages referenced but not created)
${report.orphans
  .map(o => `- **${o.title}** — referenced by: ${o.referencedBy.join(', ')}`)
  .join('\n')}

### Dead Ends (pages with no outbound links)
${report.deadEnds.map(d => `- ${d}`).join('\n') || 'None'}

---

Please analyze this vault and propose up to ${MAX_PROPOSALS} new pages to create. Focus on:
1. High-priority orphaned references (most referenced first)
2. Cross-rung connections
3. Filling thin rungs (IV-community, V-system, VI-field, VII-world)

Return your proposals as a JSON array.`;
}

/**
 * Call OpenRouter API
 */
async function callOpenRouter(apiKey, systemPrompt, userMessage) {
  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/Dansgl/LUX',
      'X-Title': 'Isidore Research Daemon'
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
    throw new Error(`OpenRouter API error (${response.status}): ${error}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

/**
 * Extract JSON proposals from Claude's response
 */
function parseProposals(responseText) {
  // Try to find JSON array in the response
  const jsonMatch = responseText.match(/\[[\s\S]*\]/);

  if (!jsonMatch) {
    // Try to find individual JSON objects
    const objectMatches = responseText.match(/\{[\s\S]*?"title"[\s\S]*?\}/g);
    if (objectMatches) {
      try {
        return objectMatches.map(obj => JSON.parse(obj));
      } catch (e) {
        console.error('Warning: Could not parse individual JSON objects.');
      }
    }

    console.error('Warning: No valid JSON found in response.');
    console.error('Raw response:', responseText);
    return [];
  }

  try {
    const proposals = JSON.parse(jsonMatch[0]);
    return Array.isArray(proposals) ? proposals : [proposals];
  } catch (e) {
    console.error('Warning: Could not parse JSON array:', e.message);
    return [];
  }
}

/**
 * Validate a proposal has required fields
 */
function validateProposal(proposal) {
  const required = ['title', 'rung', 'rationale'];
  const missing = required.filter(field => !proposal[field]);

  if (missing.length > 0) {
    console.warn(`  Warning: Proposal "${proposal.title || 'unknown'}" missing fields: ${missing.join(', ')}`);
    return false;
  }

  return true;
}

/**
 * Main generation function
 */
async function generate() {
  console.log('Isidore awakens for AI evaluation...\n');

  // Initialize
  const apiKey = getApiKey();
  const report = loadReport();
  const systemPrompt = loadEvaluatePrompt();
  const userMessage = formatReportForPrompt(report);

  console.log(`Loaded report from ${report.timestamp}`);
  console.log(`Found ${report.stats.orphanedReferences} orphaned references`);
  console.log(`Calling Claude via OpenRouter (${MODEL})...\n`);

  try {
    const responseText = await callOpenRouter(apiKey, systemPrompt, userMessage);

    console.log('Response received. Parsing proposals...\n');

    // Parse proposals
    const proposals = parseProposals(responseText);

    if (proposals.length === 0) {
      console.log('No proposals could be parsed from the response.');
      console.log('\nRaw response:');
      console.log(responseText);
      return;
    }

    // Validate and filter proposals
    const validProposals = proposals
      .filter(validateProposal)
      .slice(0, MAX_PROPOSALS);

    console.log(`Parsed ${validProposals.length} valid proposals:\n`);

    for (const p of validProposals) {
      console.log(`  - "${p.title}" (${p.rung})`);
      console.log(`    ${p.rationale.substring(0, 80)}...`);
    }

    // Load existing queue
    let queue = { date: null, proposals: [], approved: [], rejected: [] };
    if (fs.existsSync(QUEUE_PATH)) {
      try {
        queue = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf-8'));
      } catch (e) {
        console.warn('Warning: Could not parse existing queue.json, starting fresh.');
      }
    }

    // Update queue with new proposals
    queue.date = new Date().toISOString();
    queue.proposals = validProposals;

    // Save queue
    fs.writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2));

    console.log(`\nProposals saved to queue.json`);
    console.log('Run "node saint/approve.js" to review and approve proposals.');
    console.log('\nIsidore rests.\n');

  } catch (error) {
    console.error('Error calling OpenRouter:', error.message || error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  generate().catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
}

module.exports = { generate, parseProposals, validateProposal };
