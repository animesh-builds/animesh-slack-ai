'use strict';
require('dotenv').config();

const { App } = require('@slack/bolt');
const Anthropic = require('@anthropic-ai/sdk');
const express = require('express');
const fs = require('fs');
const path = require('path');

const { buildIndex } = require('./embeddings');
const { buildSystemPrompt } = require('./knowledge');
const { ensureLearningsFile, appendLearning, appendToKnowledge } = require('./learnings');

// ── Environment ──────────────────────────────────────────────────────────────

const {
  SLACK_BOT_TOKEN,
  SLACK_SIGNING_SECRET,
  SLACK_APP_TOKEN,
  ANTHROPIC_API_KEY,
  ALLOWED_CHANNEL_IDS = '',
  ALLOWED_SAVER_IDS = '',
  PORT = '3000',
} = process.env;

const allowedChannels = ALLOWED_CHANNEL_IDS
  ? ALLOWED_CHANNEL_IDS.split(',').map(s => s.trim()).filter(Boolean)
  : [];

const allowedSavers = ALLOWED_SAVER_IDS
  ? ALLOWED_SAVER_IDS.split(',').map(s => s.trim()).filter(Boolean)
  : [];

// ── Startup initialization ───────────────────────────────────────────────────

ensureLearningsFile();

const knowledgePath = path.join(__dirname, '..', 'data', 'knowledge.md');
const knowledgeText = fs.readFileSync(knowledgePath, 'utf8');
buildIndex(knowledgeText);

// ── Clients ──────────────────────────────────────────────────────────────────

const slackApp = new App({
  token: SLACK_BOT_TOKEN,
  signingSecret: SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: SLACK_APP_TOKEN,
});

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// ── Helpers ──────────────────────────────────────────────────────────────────

const LEARNING_KEYWORDS = ['save this', 'store this', 'remember this', 'learn this', 'note this', 'add this'];
const KNOWLEDGE_KEYWORDS = ['knowledge:', 'add to knowledge', 'knowledge base:'];

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
 * Handle save commands. Returns true if the message was a save command.
 */
async function handleSaveCommand(text, userId, client, channel, ts) {
  if (!isSaver(userId)) return false;

  const lower = text.toLowerCase();

  if (LEARNING_KEYWORDS.some(kw => lower.includes(kw))) {
    const content = extractContent(text, LEARNING_KEYWORDS);
    appendLearning(content);
    await client.chat.postMessage({
      channel,
      thread_ts: ts,
      text: '✅ Saved to learnings. I\'ll use this immediately in future queries.',
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
  const wasSave = await handleSaveCommand(cleanText, userId, client, channel, ts);
  if (wasSave) return;

  // Silently skip if nothing to respond to
  if (!cleanText) return;

  // Fetch thread history for multi-turn context
  const isInThread = threadTs && threadTs !== ts;
  const history = isInThread
    ? await fetchThreadHistory(client, channel, threadTs, botUserId, ts)
    : [];

  // Build system prompt with RAG context
  const systemPrompt = buildSystemPrompt(cleanText);

  const messages = [
    ...history,
    { role: 'user', content: cleanText },
  ];

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });

    const replyText = response.content[0]?.text || '(no response)';

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

// ── Event: message (DMs only) ────────────────────────────────────────────────

slackApp.message(async ({ message, client, context }) => {
  // Only handle direct messages
  if (message.channel_type !== 'im') return;
  // Ignore bot messages (including self)
  if (message.subtype === 'bot_message' || message.bot_id) return;

  const { channel, ts, thread_ts, text, user } = message;

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
  console.log('[slack] AnimeshAI bot is running in Socket Mode ⚡');

  httpApp.listen(parseInt(PORT, 10), () => {
    console.log(`[http] Health check server on port ${PORT}`);
  });
})();
