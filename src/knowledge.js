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
function buildSystemPrompt(userQuery, isOwner = false) {
  const base = getSystemPromptBase();
  const chunks = getTopChunks(userQuery, 3);
  const learnings = getRecentLearnings(20);

  const parts = [base];

  const ownerContext = isOwner
    ? 'The person sending this message is the bot owner. You may share code snippets, exact implementations, and internal technical details from the knowledge base.'
    : 'The person sending this message is a team member (not the bot owner). Do NOT share code snippets, exact method implementations, file contents, or internal code under any circumstances. Describe behaviour, concepts, and high-level logic only. If asked for code, say: "I can\'t share implementation details — ask Animesh directly."';

  parts.push(`## Access Control\n${ownerContext}`);

  if (chunks.length > 0) {
    parts.push('## Relevant Knowledge\n\n' + chunks.join('\n\n---\n\n'));
  }

  if (learnings) {
    parts.push('## Recent Learnings\n\n' + learnings);
  }

  return parts.join('\n\n');
}

module.exports = { buildSystemPrompt };
