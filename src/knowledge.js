'use strict';
const fs = require('fs');
const path = require('path');
const { getTopChunks } = require('./embeddings');
const { getRecentLearnings } = require('./learnings');

const SYSTEM_PROMPT_PATH = path.join(__dirname, '..', 'data', 'system-prompt.md');
const SYSTEM_PROMPT_EXAMPLE_PATH = path.join(__dirname, '..', 'data', 'system-prompt.example.md');
const ACTIVE_SYSTEM_PROMPT_PATH = fs.existsSync(SYSTEM_PROMPT_PATH)
  ? SYSTEM_PROMPT_PATH
  : SYSTEM_PROMPT_EXAMPLE_PATH;

let cachedSystemPromptBase = null;

function getSystemPromptBase() {
  if (!cachedSystemPromptBase) {
    cachedSystemPromptBase = fs.readFileSync(ACTIVE_SYSTEM_PROMPT_PATH, 'utf8').trim();
  }
  return cachedSystemPromptBase;
}

/**
 * Build the full system prompt for a given user query.
 *
 * Structure:
 *   [persona / base instructions]
 *
 *   ## Relevant Knowledge
 *   [top 3 TF-IDF chunks from knowledge.md]
 *
 *   ## Recent Learnings
 *   [last 20 lines from learnings.md]
 */
function buildSystemPrompt(userQuery) {
  const base = getSystemPromptBase();
  const chunks = getTopChunks(userQuery, 3);
  const learnings = getRecentLearnings(20);

  const parts = [base];

  if (chunks.length > 0) {
    parts.push('## Relevant Knowledge\n\n' + chunks.join('\n\n---\n\n'));
  }

  if (learnings) {
    parts.push('## Recent Learnings\n\n' + learnings);
  }

  return parts.join('\n\n');
}

module.exports = { buildSystemPrompt };
