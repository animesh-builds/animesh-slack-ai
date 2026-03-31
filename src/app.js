'use strict';
require('dotenv').config();

const { App } = require('@slack/bolt');
const Groq = require('groq-sdk');
const express = require('express');
const fs = require('fs');
const path = require('path');

const { buildIndex } = require('./embeddings');
const { buildSystemPrompt } = require('./knowledge');
const { ensureLearningsFile, appendLearning, appendToKnowledge } = require('./learnings');
const { addToQueue, getPending, markDone, clearDone } = require('./queue');

// ── Environment ──────────────────────────────────────────────────────────────

const {
  SLACK_BOT_TOKEN,
  SLACK_SIGNING_SECRET,
  SLACK_APP_TOKEN,
  GROQ_API_KEY,
  BOT_NAME = 'AnimeshAI',
  AUTHOR_NAME = 'Animesh',
  AUTHOR_SLACK_USER_ID = '',
  ALLOWED_CHANNEL_IDS = '',
  ALLOWED_SAVER_IDS = '',
  ALLOWED_RESPONDER_IDS = '',
  PORT = '3000',
} = process.env;

const allowedChannels = ALLOWED_CHANNEL_IDS
  ? ALLOWED_CHANNEL_IDS.split(',').map(s => s.trim()).filter(Boolean)
  : [];

const allowedSavers = ALLOWED_SAVER_IDS
  ? ALLOWED_SAVER_IDS.split(',').map(s => s.trim()).filter(Boolean)
  : [];

// Users who can trigger AnimeshAI by tagging @Animesh in a channel
const allowedResponders = ALLOWED_RESPONDER_IDS
  ? ALLOWED_RESPONDER_IDS.split(',').map(s => s.trim()).filter(Boolean)
  : [];

// ── Startup initialization ───────────────────────────────────────────────────

ensureLearningsFile();
console.log(`[app] Allowed savers: ${allowedSavers.length ? allowedSavers.join(', ') : 'NONE — save commands disabled'}`);

const knowledgePath = path.join(__dirname, '..', 'data', 'knowledge.md');
const knowledgeExamplePath = path.join(__dirname, '..', 'data', 'knowledge.example.md');
const activeKnowledgePath = fs.existsSync(knowledgePath) ? knowledgePath : knowledgeExamplePath;
if (!fs.existsSync(knowledgePath)) {
  console.log('[app] knowledge.md not found — using knowledge.example.md. Copy and customize it: cp data/knowledge.example.md data/knowledge.md');
}
const knowledgeText = fs.readFileSync(activeKnowledgePath, 'utf8');

const systemPromptPath = path.join(__dirname, '..', 'data', 'system-prompt.md');
const systemPromptExamplePath = path.join(__dirname, '..', 'data', 'system-prompt.example.md');
const activeSystemPromptPath = fs.existsSync(systemPromptPath) ? systemPromptPath : systemPromptExamplePath;
if (!fs.existsSync(systemPromptPath)) {
  console.log('[app] system-prompt.md not found — using system-prompt.example.md. Copy and customize it: cp data/system-prompt.example.md data/system-prompt.md');
}

const privateKnowledgePath = path.join(__dirname, '..', 'data', 'private-knowledge.md');
const privateKnowledgeText = fs.existsSync(privateKnowledgePath)
  ? fs.readFileSync(privateKnowledgePath, 'utf8')
  : '';

if (privateKnowledgeText) {
  console.log('[app] Private knowledge file found — loading alongside public knowledge');
} else {
  console.log('[app] No private-knowledge.md found — run "npm run index-repos" to generate one');
}

buildIndex(knowledgeText, privateKnowledgeText);

// ── Clients ──────────────────────────────────────────────────────────────────

const slackApp = new App({
  token: SLACK_BOT_TOKEN,
  signingSecret: SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: SLACK_APP_TOKEN,
});

const groq = new Groq({ apiKey: GROQ_API_KEY });

// ── Helpers ──────────────────────────────────────────────────────────────────

const LEARNING_KEYWORDS = [
  'save this:', 'save this -', 'save this ',
  'store this:', 'store this -', 'store this ',
  'remember this:', 'remember this -', 'remember this ',
  'learn this:', 'note this:', 'add this:',
  'save:', 'remember:', 'store:',
];
const KNOWLEDGE_KEYWORDS = ['knowledge:', 'add to knowledge:', 'knowledge base:'];

function isChannelAllowed(channelId) {
  if (channelId.startsWith('D')) return true;        // Direct message
  if (allowedChannels.length === 0) return true;     // No allowlist = all channels
  return allowedChannels.includes(channelId);
}

function isSaver(userId) {
  if (allowedSavers.length === 0) return false;      // Must be explicitly listed
  return allowedSavers.includes(userId);
}

function stripMention(text, botUserId) {
  return text.replace(new RegExp(`<@${botUserId}>`, 'g'), '').trim();
}

function extractContent(text, keywords) {
  const lower = text.toLowerCase();
  for (const kw of keywords) {
    const idx = lower.indexOf(kw);
    if (idx !== -1) {
      const after = text.slice(idx + kw.length).trim();
      if (after.length > 0) return after;
    }
  }
  return text.trim();
}

/**
 * Fetch full thread and format it as a readable conversation string.
 */
async function fetchThreadAsText(client, channel, threadTs, botUserId) {
  try {
    const result = await client.conversations.replies({
      channel,
      ts: threadTs,
      limit: 50,
    });

    const lines = (result.messages || []).map(m => {
      const who = m.bot_id ? BOT_NAME : AUTHOR_NAME;
      const text = (m.text || '').replace(new RegExp(`<@${botUserId}>`, 'g'), `@${BOT_NAME}`).trim();
      return `[${who}]: ${text}`;
    });

    return lines.join('\n');
  } catch {
    return null;
  }
}

/**
 * Handle save commands. Returns true if the message was a save command.
 */
async function handleSaveCommand(text, userId, client, channel, ts, threadTs, botUserId) {
  const lower = text.toLowerCase();
  const isSaveAttempt =
    LEARNING_KEYWORDS.some(kw => lower.includes(kw)) ||
    KNOWLEDGE_KEYWORDS.some(kw => lower.includes(kw));

  // Non-saver trying a save command — silently drop, no response
  if (isSaveAttempt && !isSaver(userId)) return true;

  // Not a save command at all
  if (!isSaveAttempt) return false;
  const isInThread = threadTs && threadTs !== ts;

  if (LEARNING_KEYWORDS.some(kw => lower.includes(kw))) {
    const note = extractContent(text, LEARNING_KEYWORDS);

    let toSave = note;

    // If in a thread, fetch and prepend the full thread context
    if (isInThread) {
      const threadText = await fetchThreadAsText(client, channel, threadTs, botUserId);
      if (threadText) {
        toSave = `[Thread context]\n${threadText}${note ? `\n\n[Note]: ${note}` : ''}`;
      }
    }

    appendLearning(toSave);
    await client.chat.postMessage({
      channel,
      thread_ts: ts,
      text: isInThread
        ? '✅ Saved full thread context to learnings.'
        : '✅ Saved to learnings.',
    });
    return true;
  }

  if (KNOWLEDGE_KEYWORDS.some(kw => lower.includes(kw))) {
    const content = extractContent(text, KNOWLEDGE_KEYWORDS);
    appendToKnowledge(content);
    await client.chat.postMessage({
      channel,
      thread_ts: ts,
      text: '📚 Added to knowledge.md. Restart the bot to re-index this content.',
    });
    return true;
  }

  return false;
}

/**
 * Sanitize LLM output for Slack's mrkdwn format.
 * LLMs often emit standard Markdown which Slack doesn't render correctly.
 */
function sanitizeForSlack(text) {
  return text
    // Strip language identifier from code fences (```python → ```)
    .replace(/^```[a-zA-Z][\w]*[ \t]*$/gm, '```')
    // Convert **bold** → *bold*
    .replace(/\*\*([^*\n]+)\*\*/g, '*$1*')
    // Convert Markdown bullet `* item` → `- item` (with any indent)
    .replace(/^(\s*)\* {1,3}/gm, '$1- ')
    // Convert ## Heading → *Heading* (bold, no hash)
    .replace(/^#{1,6} (.+)$/gm, '*$1*')
    // Remove horizontal rules
    .replace(/^[-*]{3,}$/gm, '')
    // Collapse 3+ blank lines to 2
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Fetch thread history and return Claude-compatible messages array.
 */
async function fetchThreadHistory(client, channel, threadTs, botUserId, currentTs) {
  try {
    const result = await client.conversations.replies({
      channel,
      ts: threadTs,
      limit: 20,
    });

    return (result.messages || [])
      .filter(m => m.ts !== currentTs)
      .slice(-10)
      .map(m => ({
        role: m.bot_id ? 'assistant' : 'user',
        content: (m.text || '').replace(new RegExp(`<@${botUserId}>`, 'g'), '').trim(),
      }))
      .filter(m => m.content.length > 0);
  } catch {
    return [];
  }
}

/**
 * Core AI response handler — shared between mention and DM listeners.
 */
async function handleAIResponse({ text, userId, channel, ts, threadTs, client, botUserId }) {
  const cleanText = stripMention(text, botUserId);

  // Check save commands first
  const wasSave = await handleSaveCommand(cleanText, userId, client, channel, ts, threadTs, botUserId);
  if (wasSave) return;

  // Silently skip if nothing to respond to
  if (!cleanText) return;

  // Fetch thread history for multi-turn context
  const isInThread = threadTs && threadTs !== ts;
  const history = isInThread
    ? await fetchThreadHistory(client, channel, threadTs, botUserId, ts)
    : [];

  // Build system prompt with RAG context
  const isOwner = userId === process.env.AUTHOR_SLACK_USER_ID;
  const systemPrompt = buildSystemPrompt(cleanText, isOwner);

  const messages = [
    ...history,
    { role: 'user', content: cleanText },
  ];

  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 1024,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
    });

    const rawReply = response.choices[0]?.message?.content || '(no response)';
    const replyText = sanitizeForSlack(rawReply);

    await client.chat.postMessage({
      channel,
      thread_ts: ts,
      text: replyText,
    });
  } catch (err) {
    console.error('[app] Claude API error:', err.message);
    await client.chat.postMessage({
      channel,
      thread_ts: ts,
      text: 'Sorry, something went wrong on my end. Try again in a moment.',
    });
  }
}

/**
 * Format the pending queue as a Slack message.
 */
function formatQueue() {
  const pending = getPending();
  if (pending.length === 0) return '✅ Queue is empty — all caught up.';

  const lines = pending.map((item, i) => {
    const link = `https://slack.com/archives/${item.channel}/p${item.ts.replace('.', '')}`;
    const preview = item.text.slice(0, 80).replace(/\n/g, ' ');
    const date = new Date(item.addedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    return `${i + 1}. <${link}|View thread> — _${preview}…_ (${date})`;
  });

  return `*Review Queue — ${pending.length} pending*\n\n${lines.join('\n')}\n\n_Use \`@${BOT_NAME} queue done [n]\` to mark done · \`queue clear\` to remove all done_`;
}

/**
 * Handle queue management commands. Returns true if handled.
 */
async function handleQueueCommand(text, userId, client, channel, ts) {
  if (userId !== AUTHOR_SLACK_USER_ID) return false;

  const lower = text.toLowerCase().trim();
  if (!lower.startsWith('queue')) return false;

  // "queue" or "queue list" — show pending
  if (lower === 'queue' || lower === 'queue list') {
    await client.chat.postMessage({ channel, thread_ts: ts, text: formatQueue() });
    return true;
  }

  // "queue done [n]"
  const doneMatch = lower.match(/^queue done (\d+)$/);
  if (doneMatch) {
    const item = markDone(parseInt(doneMatch[1], 10));
    const msg = item
      ? `✅ Marked item ${doneMatch[1]} as done.`
      : `⚠️ No item at position ${doneMatch[1]}. Use \`queue\` to see the current list.`;
    await client.chat.postMessage({ channel, thread_ts: ts, text: msg });
    return true;
  }

  // "queue clear"
  if (lower === 'queue clear') {
    const removed = clearDone();
    await client.chat.postMessage({ channel, thread_ts: ts, text: `🗑️ Cleared ${removed} completed item(s) from the queue.` });
    return true;
  }

  return false;
}

/**
 * Handle when someone tags Animesh (not the bot) in a channel.
 * ACKs in thread and DMs Animesh with a link.
 */
async function handleOwnerMention({ message, client }) {
  if (!AUTHOR_SLACK_USER_ID) return;
  const { channel, ts, thread_ts, text, user } = message;

  // Skip if sender is the owner themselves or a bot
  if (user === AUTHOR_SLACK_USER_ID) return;
  if (!text || !text.includes(`<@${AUTHOR_SLACK_USER_ID}>`)) return;

  // Feature is disabled unless ALLOWED_RESPONDER_IDS is explicitly set
  if (allowedResponders.length === 0) return;
  if (!allowedResponders.includes(user)) return;

  const threadTs = thread_ts || ts;
  const position = addToQueue({ channel, ts: threadTs, text, fromUser: user });

  // ACK in the thread
  await client.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: `👀 Noted — added to ${AUTHOR_NAME}'s review queue (#${position})`,
  });

  // DM the owner
  try {
    const dm = await client.conversations.open({ users: AUTHOR_SLACK_USER_ID });
    const link = `https://slack.com/archives/${channel}/p${threadTs.replace('.', '')}`;
    const preview = (text || '').slice(0, 200).replace(new RegExp(`<@${AUTHOR_SLACK_USER_ID}>`, 'g'), `@${AUTHOR_NAME}`);
    await client.chat.postMessage({
      channel: dm.channel.id,
      text: `*Review queue #${position}* — <#${channel}>\n<${link}|Open thread>\n> ${preview}`,
    });
  } catch (err) {
    console.error('[queue] Failed to DM owner:', err.message);
  }
}

// ── Event: app_mention ───────────────────────────────────────────────────────

slackApp.event('app_mention', async ({ event, client, context }) => {
  const { channel, ts, thread_ts, text, user } = event;

  if (!isChannelAllowed(channel)) return;

  await handleAIResponse({
    text: text || '',
    userId: user,
    channel,
    ts,
    threadTs: thread_ts || ts,
    client,
    botUserId: context.botUserId,
  });
});

// ── Event: message ───────────────────────────────────────────────────────────

slackApp.message(async ({ message, client, context }) => {
  // Ignore bot messages (including self)
  if (message.subtype === 'bot_message' || message.bot_id) return;

  const { channel, ts, thread_ts, text, user, channel_type } = message;

  // In channels: check if @Animesh (the owner) was mentioned
  if (channel_type !== 'im' && AUTHOR_SLACK_USER_ID && text?.includes(`<@${AUTHOR_SLACK_USER_ID}>`)) {
    await handleOwnerMention({ message, client });
    return;
  }

  // Only handle direct messages to the bot below this point
  if (channel_type !== 'im') return;

  // Queue commands (owner only, via DM)
  const wasQueue = await handleQueueCommand(text || '', user, client, channel, ts);
  if (wasQueue) return;

  await handleAIResponse({
    text: text || '',
    userId: user,
    channel,
    ts,
    threadTs: thread_ts || ts,
    client,
    botUserId: context.botUserId,
  });
});

// ── Express health check ─────────────────────────────────────────────────────

const httpApp = express();
const startTime = Date.now();

httpApp.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
  });
});

// ── Start ────────────────────────────────────────────────────────────────────

(async () => {
  await slackApp.start();
  console.log(`[slack] ${BOT_NAME} bot is running in Socket Mode ⚡`);

  httpApp.listen(parseInt(PORT, 10), () => {
    console.log(`[http] Health check server on port ${PORT}`);
  });
})();
