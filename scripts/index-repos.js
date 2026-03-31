'use strict';

/**
 * index-repos.js
 *
 * Scans private local repos and writes extracted content to
 * data/private-knowledge.md for use by AnimeshAI.
 *
 * Usage:
 *   npm run index-repos
 *
 * Config:
 *   Copy scripts/repos.config.example.json → scripts/repos.config.json
 *   and fill in your private repo paths. (repos.config.json is gitignored)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ── Config ───────────────────────────────────────────────────────────────────

const CONFIG_PATH = path.join(__dirname, 'repos.config.json');
const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'private-knowledge.md');

if (!fs.existsSync(CONFIG_PATH)) {
  console.error('[index-repos] ERROR: scripts/repos.config.json not found.');
  console.error('  Copy scripts/repos.config.example.json to scripts/repos.config.json');
  console.error('  and fill in your private repo paths.');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

// ── File type helpers ─────────────────────────────────────────────────────────

const DOC_EXTENSIONS = new Set(['.md', '.mdx', '.txt', '.rst']);

const SCHEMA_EXTENSIONS = new Set([
  '.sql', '.prisma', '.graphql', '.gql',
  '.yaml', '.yml', '.toml', '.proto',
]);

const CONFIG_FILENAMES = new Set([
  'package.json', '.env.example', 'docker-compose.yml',
  'docker-compose.yaml', 'Makefile', 'schema.json',
]);

const GENERATED_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  'bun.lockb', 'composer.lock', 'Gemfile.lock',
  'poetry.lock', 'Pipfile.lock',
]);

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  'coverage', '__pycache__', '.cache', 'vendor', 'target',
  '.turbo', 'out', '.vercel', '.railway',
]);

// ── Utilities ─────────────────────────────────────────────────────────────────

function readFileTruncated(filePath, maxLines) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    if (lines.length <= maxLines) return content;
    return lines.slice(0, maxLines).join('\n') + `\n... (truncated at ${maxLines} lines)`;
  } catch {
    return null;
  }
}

function isTextFile(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    // Simple heuristic: if file has null bytes in first 8KB, it's binary
    const sample = buf.slice(0, 8192);
    return !sample.includes(0);
  } catch {
    return false;
  }
}

/**
 * Recursively walk a directory, calling callback for each file.
 */
function walkDir(dirPath, ignorePaths, callback) {
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || ignorePaths.includes(entry.name)) continue;
      walkDir(fullPath, ignorePaths, callback);
    } else if (entry.isFile()) {
      callback(fullPath);
    }
  }
}

// ── Per-repo extraction ───────────────────────────────────────────────────────

function extractDocs(repoPath, ignorePaths, maxLines = 300) {
  const sections = [];
  let count = 0;

  walkDir(repoPath, ignorePaths, (filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (!DOC_EXTENSIONS.has(ext)) return;

    const relPath = path.relative(repoPath, filePath);
    const stat = fs.statSync(filePath);
    if (stat.size > 200 * 1024) return; // skip > 200KB docs

    const content = readFileTruncated(filePath, maxLines);
    if (!content || content.trim().length < 20) return;

    sections.push({ relPath, content });
    count++;
  });

  return { sections, count };
}

function extractSourceCode(repoPath, ignorePaths, sourceExtensions, maxFileSizeKB, maxFiles, maxLinesPerFile = 100) {
  const extSet = new Set(sourceExtensions.map(e => e.toLowerCase()));
  const sections = [];
  let count = 0;

  walkDir(repoPath, ignorePaths, (filePath) => {
    if (count >= maxFiles) return;

    const filename = path.basename(filePath);
    if (GENERATED_FILES.has(filename)) return;

    const ext = path.extname(filePath).toLowerCase();
    if (!extSet.has(ext)) return;

    const stat = fs.statSync(filePath);
    if (stat.size > maxFileSizeKB * 1024) return;
    if (!isTextFile(filePath)) return;

    const relPath = path.relative(repoPath, filePath);
    const content = readFileTruncated(filePath, maxLinesPerFile);
    if (!content || content.trim().length < 10) return;

    sections.push({ relPath, content });
    count++;
  });

  return { sections, count };
}

function extractSchemas(repoPath, ignorePaths, maxLines = 200) {
  const sections = [];
  let count = 0;

  walkDir(repoPath, ignorePaths, (filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    const filename = path.basename(filePath);

    const isSchema = SCHEMA_EXTENSIONS.has(ext);
    const isConfigFile = CONFIG_FILENAMES.has(filename);
    if (!isSchema && !isConfigFile) return;
    if (GENERATED_FILES.has(filename)) return;

    const stat = fs.statSync(filePath);
    if (stat.size > 100 * 1024) return;

    const relPath = path.relative(repoPath, filePath);
    const content = readFileTruncated(filePath, maxLines);
    if (!content || content.trim().length < 10) return;

    sections.push({ relPath, content });
    count++;
  });

  return { sections, count };
}

function extractGitLog(repoPath, limit = 60) {
  try {
    const log = execSync(
      `git log --oneline --pretty=format:"%h %s" -${limit}`,
      { cwd: repoPath, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
    ).trim();
    return log || null;
  } catch {
    return null;
  }
}

function getGitRemote(repoPath) {
  try {
    return execSync('git remote get-url origin', {
      cwd: repoPath, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore']
    }).trim();
  } catch {
    return null;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

function buildMarkdownForRepo(repoConfig) {
  const {
    name,
    path: repoPath,
    include = {},
    sourceExtensions = ['.js', '.ts', '.py', '.go', '.java', '.rb', '.rs'],
    maxFileSizeKB = 100,
    maxFilesPerRepo = 50,
    ignorePaths = [],
  } = repoConfig;

  if (!fs.existsSync(repoPath)) {
    console.warn(`  [warn] Repo path not found, skipping: ${repoPath}`);
    return null;
  }

  const allIgnore = [...SKIP_DIRS, ...ignorePaths];
  const blocks = [];
  let totalFiles = 0;

  const remote = getGitRemote(repoPath);
  const repoMeta = remote ? `Path: ${repoPath}\nRemote: ${remote}` : `Path: ${repoPath}`;

  // ── Documentation ──
  if (include.docs !== false) {
    const { sections, count } = extractDocs(repoPath, allIgnore);
    totalFiles += count;
    if (sections.length > 0) {
      // Group all docs into one TF-IDF section for the repo
      const docContent = sections.map(s => `### ${s.relPath}\n${s.content}`).join('\n\n---\n\n');
      blocks.push(`# ${name} — Documentation\n${repoMeta}\n\n${docContent}`);
    }
    console.log(`    docs: ${count} files`);
  }

  // ── Source code ──
  if (include.source !== false) {
    const { sections, count } = extractSourceCode(repoPath, allIgnore, sourceExtensions, maxFileSizeKB, maxFilesPerRepo);
    totalFiles += count;
    // Each source file gets its own TF-IDF section (better retrieval granularity)
    for (const s of sections) {
      blocks.push(`# ${name} — Source: ${s.relPath}\n\`\`\`\n${s.content}\n\`\`\``);
    }
    console.log(`    source: ${count} files`);
  }

  // ── Schemas & config ──
  if (include.schemas !== false) {
    const { sections, count } = extractSchemas(repoPath, allIgnore);
    totalFiles += count;
    if (sections.length > 0) {
      const schemaContent = sections.map(s => `### ${s.relPath}\n\`\`\`\n${s.content}\n\`\`\``).join('\n\n---\n\n');
      blocks.push(`# ${name} — Schemas & Config\n\n${schemaContent}`);
    }
    console.log(`    schemas/config: ${count} files`);
  }

  // ── Git history ──
  if (include.gitLog !== false) {
    const log = extractGitLog(repoPath);
    if (log) {
      blocks.push(`# ${name} — Git History\n${repoMeta}\n\nRecent commits:\n\`\`\`\n${log}\n\`\`\``);
      console.log(`    git log: extracted`);
    }
  }

  console.log(`    total: ${totalFiles} files indexed`);
  return blocks.join('\n\n');
}

function run() {
  const repos = config.repos || [];
  if (repos.length === 0) {
    console.error('[index-repos] No repos configured in repos.config.json');
    process.exit(1);
  }

  console.log(`[index-repos] Indexing ${repos.length} repo(s)...\n`);

  const allBlocks = [
    `<!-- AUTO-GENERATED by scripts/index-repos.js — DO NOT EDIT MANUALLY -->`,
    `<!-- Generated: ${new Date().toISOString()} -->`,
    `<!-- This file is gitignored. Private repo content never leaves your machine unless you upload it. -->`,
  ];

  let totalRepos = 0;
  let totalSections = 0;

  for (const repoConfig of repos) {
    console.log(`  → ${repoConfig.name} (${repoConfig.path})`);
    const markdown = buildMarkdownForRepo(repoConfig);
    if (markdown) {
      allBlocks.push(markdown);
      // Count TF-IDF sections (blocks starting with # )
      const sectionCount = (markdown.match(/^# /gm) || []).length;
      totalSections += sectionCount;
      totalRepos++;
    }
    console.log('');
  }

  // Ensure data/ directory exists
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  fs.writeFileSync(OUTPUT_PATH, allBlocks.join('\n\n'), 'utf8');

  console.log(`[index-repos] Done!`);
  console.log(`  Repos processed: ${totalRepos}`);
  console.log(`  TF-IDF sections generated: ${totalSections}`);
  console.log(`  Output: ${OUTPUT_PATH}`);
  console.log(`\n  Run 'npm run dev' to start the bot with private knowledge loaded.`);
}

run();
