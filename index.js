const { execFileSync } = require('child_process');
const fs = require('fs');
const config = require('./config');
const log = require('./src/logger');
const { MessagePoller } = require('./src/db');
const { invokeClaudeWithTimeout } = require('./src/claude');
const { sendBotResponse } = require('./src/sender');
const { SessionManager } = require('./src/session');

// --- Preflight checks ---

function preflight() {
  if (!config.selfHandle) {
    console.error('ERROR: IMESSAGE_HANDLE is required.');
    console.error('  export IMESSAGE_HANDLE="+15551234567"   (your phone number)');
    process.exit(1);
  }

  // Check chat.db is readable
  try {
    fs.accessSync(config.chatDbPath, fs.constants.R_OK);
  } catch {
    console.error(`ERROR: Cannot read ${config.chatDbPath}`);
    console.error('Grant Full Disk Access to your terminal in:');
    console.error('  System Settings > Privacy & Security > Full Disk Access');
    process.exit(1);
  }

  // Check claude CLI is available
  try {
    execFileSync('which', ['claude'], { stdio: 'pipe' });
  } catch {
    console.error('ERROR: claude CLI not found in PATH.');
    console.error('Install Claude Code: https://claude.ai/download');
    process.exit(1);
  }
}

// --- Main ---

async function main() {
  preflight();

  log.info('Starting iMessage-Claude relay');
  log.info(`Handle: ${config.selfHandle}`);
  log.info(`Working dir: ${config.claudeWorkingDirectory}`);
  log.info(`Poll interval: ${config.pollIntervalMs}ms`);
  log.info(`Session timeout: ${config.sessionTimeoutMs / 1000}s`);

  const sessionManager = new SessionManager(config.sessionTimeoutMs);
  const poller = new MessagePoller(config);

  let processing = false;
  const queue = [];

  async function processQueue() {
    if (processing || queue.length === 0) return;
    processing = true;

    const { text } = queue.shift();

    try {
      // Check for special commands
      const cmd = text.trim().toLowerCase();
      if (cmd === '!reset' || cmd === '/reset') {
        sessionManager.endSession();
        await sendBotResponse(config.selfHandle, 'Session reset. Next message starts fresh.', config.responsePrefix);
        return;
      }
      if (cmd === '!status' || cmd === '/status') {
        const session = sessionManager.getSession();
        const msg = session
          ? `Active session: ${session.messageCount} messages, started ${Math.round((Date.now() - session.startedAt) / 1000)}s ago`
          : 'No active session.';
        await sendBotResponse(config.selfHandle, msg, config.responsePrefix);
        return;
      }

      const session = sessionManager.getSession();
      const options = {
        workingDirectory: config.claudeWorkingDirectory,
        allowedTools: config.claudeAllowedTools,
        maxTurns: config.claudeMaxTurns,
      };

      if (session) {
        options.sessionId = session.sessionId;
      }

      log.info(`Invoking Claude${session ? ` (session: ${session.sessionId.substring(0, 8)}...)` : ' (new session)'}...`);

      // Send a "thinking" indicator so the user knows it's working
      await sendBotResponse(config.selfHandle, 'Thinking...', config.responsePrefix);

      const result = await invokeClaudeWithTimeout(text, options, config.claudeTimeoutMs);

      if (result.is_error) {
        log.error(`Claude error: ${result.result}`);
        await sendBotResponse(config.selfHandle, `Error: ${result.result}`, config.responsePrefix);
      } else {
        if (session) {
          sessionManager.updateSession(result.session_id);
        } else {
          sessionManager.startSession(result.session_id);
        }

        const cost = result.total_cost_usd != null ? ` ($${result.total_cost_usd.toFixed(4)})` : '';
        log.info(`Claude responded${cost}`);
        await sendBotResponse(config.selfHandle, result.result, config.responsePrefix);
      }
    } catch (err) {
      log.error('Error:', err.message);
      try {
        await sendBotResponse(config.selfHandle, `Error: ${err.message}`, config.responsePrefix);
      } catch (sendErr) {
        log.error('Failed to send error message:', sendErr.message);
      }
    } finally {
      processing = false;
      if (queue.length > 0) {
        processQueue();
      }
    }
  }

  poller.onMessage = (text, rowId) => {
    log.info(`New message [ROWID ${rowId}]: "${text.substring(0, 80)}${text.length > 80 ? '...' : ''}"`);
    queue.push({ text, rowId });
    processQueue();
  };

  poller.start();
  log.info('Polling started. Send yourself a message to begin.');

  // Graceful shutdown
  const shutdown = () => {
    log.info('Shutting down...');
    poller.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
