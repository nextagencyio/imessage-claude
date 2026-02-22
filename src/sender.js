const { execFile } = require('child_process');
const { promisify } = require('util');
const log = require('./logger');

const execFileAsync = promisify(execFile);

const MAX_MESSAGE_LENGTH = 10000;

function stripMarkdown(text) {
  return text
    // Code blocks: ```lang\ncode\n``` → just the code
    .replace(/```[\w]*\n?([\s\S]*?)```/g, '$1')
    // Inline code: `code` → code
    .replace(/`([^`]+)`/g, '$1')
    // Bold: **text** or __text__ → text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    // Italic: *text* or _text_ → text
    .replace(/(?<!\w)\*([^*]+?)\*(?!\w)/g, '$1')
    .replace(/(?<!\w)_([^_]+?)_(?!\w)/g, '$1')
    // Headers: ## Header → Header
    .replace(/^#{1,6}\s+/gm, '')
    // Markdown links: [text](url) → text (url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    // Horizontal rules
    .replace(/^[-*_]{3,}\s*$/gm, '')
    // Clean up extra blank lines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function escapeForAppleScript(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

async function sendMessage(handle, text) {
  const escaped = escapeForAppleScript(text);
  const script = `
    tell application "Messages"
      set targetService to 1st service whose service type = iMessage
      set targetBuddy to buddy "${handle}" of targetService
      send "${escaped}" to targetBuddy
    end tell
  `;

  try {
    await execFileAsync('osascript', ['-e', script], { timeout: 15000 });
  } catch (err) {
    throw new Error(`Failed to send iMessage: ${err.message}`);
  }
}

function splitIntoChunks(text, maxLen) {
  if (text.length <= maxLen) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }

    // Try to split at a paragraph boundary
    let splitAt = remaining.lastIndexOf('\n\n', maxLen);
    if (splitAt <= 0) {
      // Try a single newline
      splitAt = remaining.lastIndexOf('\n', maxLen);
    }
    if (splitAt <= 0) {
      // Try a space
      splitAt = remaining.lastIndexOf(' ', maxLen);
    }
    if (splitAt <= 0) {
      // Hard cut
      splitAt = maxLen;
    }

    chunks.push(remaining.substring(0, splitAt));
    remaining = remaining.substring(splitAt).replace(/^\n+/, '');
  }

  return chunks;
}

async function sendBotResponse(handle, text, prefix) {
  const fullText = prefix + stripMarkdown(text);
  const chunks = splitIntoChunks(fullText, MAX_MESSAGE_LENGTH);

  for (let i = 0; i < chunks.length; i++) {
    log.debug(`Sending chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)`);
    await sendMessage(handle, chunks[i]);

    // Small delay between chunks to maintain ordering
    if (i < chunks.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

module.exports = { sendMessage, sendBotResponse };
