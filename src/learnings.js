'use strict';
const fs = require('fs');
const path = require('path');

const LEARNINGS_PATH = path.join(__dirname, '..', 'data', 'learnings.md');
const KNOWLEDGE_PATH = path.join(__dirname, '..', 'data', 'knowledge.md');

/**
 * Ensure learnings.md exists. Called once at startup.
 */
function ensureLearningsFile() {
  if (!fs.existsSync(LEARNINGS_PATH)) {
    fs.writeFileSync(LEARNINGS_PATH, '', 'utf8');
    console.log('[learnings] Created empty data/learnings.md');
  }
}

/**
 * Return the last N lines of learnings.md as a single string.
 */
function getRecentLearnings(n = 20) {
  try {
    const content = fs.readFileSync(LEARNINGS_PATH, 'utf8').trim();
    if (!content) return '';
    const lines = content.split('\n');
    return lines.slice(-n).join('\n');
  } catch {
    return '';
  }
}

/**
 * Append a learning entry to learnings.md with an ISO timestamp.
 */
function appendLearning(text) {
  const timestamp = new Date().toISOString();
  const entry = `\n---\n[${timestamp}]\n${text.trim()}\n`;
  fs.appendFileSync(LEARNINGS_PATH, entry, 'utf8');
}

/**
 * Append raw text to knowledge.md.
 * NOTE: Requires bot restart to re-index.
 */
function appendToKnowledge(text) {
  const timestamp = new Date().toISOString();
  const entry = `\n\n<!-- Added ${timestamp} -->\n${text.trim()}\n`;
  fs.appendFileSync(KNOWLEDGE_PATH, entry, 'utf8');
}

module.exports = {
  ensureLearningsFile,
  getRecentLearnings,
  appendLearning,
  appendToKnowledge,
};
