'use strict';

const fs = require('fs');
const path = require('path');

const QUEUE_PATH = path.join(__dirname, '..', 'data', 'review-queue.json');

function loadQueue() {
  if (!fs.existsSync(QUEUE_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function saveQueue(queue) {
  fs.writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2), 'utf8');
}

/**
 * Add a new item to the queue. Returns the 1-based position.
 */
function addToQueue({ channel, ts, text, fromUser }) {
  const queue = loadQueue();
  queue.push({
    id: Date.now(),
    channel,
    ts,
    text: (text || '').slice(0, 300),
    fromUser,
    done: false,
    addedAt: new Date().toISOString(),
  });
  saveQueue(queue);
  return queue.filter(i => !i.done).length;
}

function getPending() {
  return loadQueue().filter(i => !i.done);
}

/**
 * Mark pending item at 1-based index as done. Returns the item or null.
 */
function markDone(index) {
  const queue = loadQueue();
  const pending = queue.filter(i => !i.done);
  if (index < 1 || index > pending.length) return null;
  const target = pending[index - 1];
  const idx = queue.findIndex(i => i.id === target.id);
  queue[idx].done = true;
  queue[idx].doneAt = new Date().toISOString();
  saveQueue(queue);
  return target;
}

/**
 * Remove all done items. Returns count removed.
 */
function clearDone() {
  const queue = loadQueue();
  const before = queue.length;
  saveQueue(queue.filter(i => !i.done));
  return before - queue.filter(i => !i.done).length;
}

module.exports = { addToQueue, getPending, markDone, clearDone };
