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
    ? `## Response Mode — Owner
The person asking is the bot owner (Animesh). Treat this as high priority.
- Go deep — full technical detail, internal implementations, code snippets, architecture tradeoffs
- Don't simplify or hold back — the owner knows the domain and codebase inside out
- Explore edge cases, suggest improvements, flag risks proactively
- Longer responses are fine when the question warrants it
- You may share code snippets, exact method implementations, and internal technical details`
    : `## Response Mode — Team Member
The person asking is a team member (not the bot owner). They want quick, actionable answers.
- Lead with a *TLDR* (1-2 sentences) — answer first, context second
- Keep it scannable: short bullets, plain language, no jargon overload
- Max ~150 words unless they explicitly ask for more detail
- Do NOT share code snippets, file contents, or internal implementation details — describe behaviour and concepts only
- If they need deeper technical detail or code, say: "For implementation details, ask Animesh directly."`;

  parts.push(ownerContext);

  if (chunks.length > 0) {
    parts.push('## Relevant Knowledge\n\n' + chunks.join('\n\n---\n\n'));
  }

  if (learnings) {
    parts.push('## Recent Learnings\n\n' + learnings);
  }

  return parts.join('\n\n');
}

module.exports = { buildSystemPrompt };
