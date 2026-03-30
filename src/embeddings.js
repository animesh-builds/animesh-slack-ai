'use strict';
const natural = require('natural');

let tfidf = null;
let sections = [];

/**
 * Parse knowledge.md into sections split by top-level (#) headings.
 */
function parseSections(markdownText) {
  const lines = markdownText.split('\n');
  const result = [];
  let currentHeading = 'Introduction';
  let currentLines = [];

  for (const line of lines) {
    if (line.startsWith('# ')) {
      if (currentLines.length > 0) {
        const body = currentLines.join('\n').trim();
        if (body) {
          result.push({
            heading: currentHeading,
            body,
            full: `## ${currentHeading}\n${body}`,
          });
        }
      }
      currentHeading = line.slice(2).trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  // Push final section
  if (currentLines.length > 0) {
    const body = currentLines.join('\n').trim();
    if (body) {
      result.push({
        heading: currentHeading,
        body,
        full: `## ${currentHeading}\n${body}`,
      });
    }
  }

  return result;
}

/**
 * Build TF-IDF index from knowledge.md text. Called once at startup.
 */
function buildIndex(markdownText) {
  tfidf = new natural.TfIdf();
  sections = parseSections(markdownText);

  for (const section of sections) {
    tfidf.addDocument(section.heading + ' ' + section.body);
  }

  console.log(`[embeddings] Indexed ${sections.length} sections from knowledge.md`);
}

/**
 * Return the top N most relevant section texts for a given query.
 */
function getTopChunks(query, n = 3) {
  if (!tfidf || sections.length === 0) {
    return sections.slice(0, n).map(s => s.full);
  }

  const scores = [];
  tfidf.tfidfs(query, (i, measure) => {
    scores.push({ i, measure });
  });

  scores.sort((a, b) => b.measure - a.measure);

  return scores
    .slice(0, n)
    .filter(s => s.measure > 0)
    .map(s => sections[s.i].full);
}

module.exports = { buildIndex, getTopChunks };
