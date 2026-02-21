const path = require('path');
const os = require('os');

const config = {
  // REQUIRED: Your iMessage handle (phone number like +15551234567 or email)
  selfHandle: process.env.IMESSAGE_HANDLE || '',

  // Working directory for Claude Code (defaults to ./workspace)
  claudeWorkingDirectory: process.env.CLAUDE_WORKING_DIR || path.join(__dirname, 'workspace'),

  // Polling interval in milliseconds
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS, 10) || 2000,

  // Session timeout in milliseconds (default 30 minutes)
  sessionTimeoutMs: parseInt(process.env.SESSION_TIMEOUT_MS, 10) || 30 * 60 * 1000,

  // Prefix for bot responses (used to detect and skip our own messages)
  responsePrefix: process.env.RESPONSE_PREFIX || '[Claude] ',

  // Path to chat.db
  chatDbPath: process.env.CHAT_DB_PATH || path.join(os.homedir(), 'Library', 'Messages', 'chat.db'),

  // Claude CLI timeout in milliseconds (default 5 minutes)
  claudeTimeoutMs: parseInt(process.env.CLAUDE_TIMEOUT_MS, 10) || 5 * 60 * 1000,

  // Max agent turns per invocation
  claudeMaxTurns: parseInt(process.env.CLAUDE_MAX_TURNS, 10) || 10,

  // Tools Claude can use
  claudeAllowedTools: (process.env.CLAUDE_ALLOWED_TOOLS || 'Read,Grep,Glob,Bash,Edit,Write').split(','),
};

module.exports = config;
