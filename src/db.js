const Database = require('better-sqlite3');
const log = require('./logger');
const { decodeMessage } = require('./message-decoder');

class MessagePoller {
  constructor(config) {
    this.config = config;
    this.responsePrefix = config.responsePrefix;
    this.pollIntervalMs = config.pollIntervalMs;
    this.onMessage = null; // callback: (text, rowId) => void
    this.timer = null;
    this.lastRowId = 0;
    this.selfChatIds = [];
    this.db = null;
    this.recentTexts = new Map(); // text -> timestamp, for dedup within 5s window
  }

  start() {
    log.info(`Opening database: ${this.config.chatDbPath}`);
    this.db = new Database(this.config.chatDbPath, {
      readonly: true,
      fileMustExist: true,
    });

    this.selfChatIds = this._findSelfChats();
    if (this.selfChatIds.length === 0) {
      throw new Error(
        `No self-chat found for handle "${this.config.selfHandle}". ` +
        `Make sure you've sent yourself a message in iMessage and that IMESSAGE_HANDLE is correct.`
      );
    }
    log.info(`Found self-chat IDs: ${this.selfChatIds.join(', ')}`);

    this.lastRowId = this._getMaxRowId();
    log.info(`Starting from ROWID: ${this.lastRowId}`);

    this.timer = setInterval(() => this._poll(), this.pollIntervalMs);
    log.info(`Polling every ${this.pollIntervalMs}ms`);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  _findSelfChats() {
    const handle = this.config.selfHandle;

    // Try exact match first, then without the + prefix, then as email
    const stmt = this.db.prepare(
      `SELECT ROWID FROM chat WHERE chat_identifier = ? OR chat_identifier = ? OR chat_identifier = ?`
    );
    const rows = stmt.all(handle, handle.replace(/^\+/, ''), handle.replace(/^\+1/, ''));
    return rows.map((r) => r.ROWID);
  }

  _getMaxRowId() {
    if (this.selfChatIds.length === 0) return 0;

    const placeholders = this.selfChatIds.map(() => '?').join(',');
    const stmt = this.db.prepare(
      `SELECT COALESCE(MAX(m.ROWID), 0) as max_rowid
       FROM message m
       INNER JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
       WHERE cmj.chat_id IN (${placeholders})`
    );
    const row = stmt.get(...this.selfChatIds);
    return row.max_rowid;
  }

  _poll() {
    try {
      const placeholders = this.selfChatIds.map(() => '?').join(',');
      // DISTINCT prevents duplicates when a self-message is joined to the chat twice
      const stmt = this.db.prepare(
        `SELECT DISTINCT m.ROWID, m.text, m.attributedBody, m.is_from_me, m.date
         FROM message m
         INNER JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
         WHERE cmj.chat_id IN (${placeholders})
           AND m.ROWID > ?
           AND m.is_from_me = 1
         ORDER BY m.ROWID ASC`
      );

      const rows = stmt.all(...this.selfChatIds, this.lastRowId);

      // Clean up old dedup entries (older than 10s)
      const now = Date.now();
      for (const [key, ts] of this.recentTexts) {
        if (now - ts > 10000) this.recentTexts.delete(key);
      }

      for (const row of rows) {
        this.lastRowId = row.ROWID;

        const text = decodeMessage(row);
        if (!text) continue;

        // Skip bot's own responses
        if (text.startsWith(this.responsePrefix)) continue;

        // Dedup: skip if we saw the exact same text within 5 seconds
        const dedupKey = text.trim();
        const lastSeen = this.recentTexts.get(dedupKey);
        if (lastSeen && now - lastSeen < 5000) {
          log.debug(`Skipping duplicate [ROWID ${row.ROWID}]: "${text.substring(0, 40)}"`);
          continue;
        }
        this.recentTexts.set(dedupKey, now);

        log.debug(`Message [ROWID ${row.ROWID}]: "${text.substring(0, 80)}"`);

        if (this.onMessage) {
          this.onMessage(text, row.ROWID);
        }
      }
    } catch (err) {
      log.error('Poll error:', err.message);
    }
  }
}

module.exports = { MessagePoller };
