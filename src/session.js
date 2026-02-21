const log = require('./logger');

class SessionManager {
  constructor(timeoutMs) {
    this.timeoutMs = timeoutMs;
    this.currentSession = null;
  }

  getSession() {
    if (!this.currentSession) return null;

    const elapsed = Date.now() - this.currentSession.lastActivity;
    if (elapsed > this.timeoutMs) {
      log.info(`Session expired after ${Math.round(elapsed / 1000)}s of inactivity`);
      this.currentSession = null;
      return null;
    }

    return this.currentSession;
  }

  startSession(sessionId) {
    this.currentSession = {
      sessionId,
      startedAt: Date.now(),
      lastActivity: Date.now(),
      messageCount: 1,
    };
    log.info(`New session started: ${sessionId}`);
  }

  updateSession(sessionId) {
    if (this.currentSession) {
      if (sessionId) this.currentSession.sessionId = sessionId;
      this.currentSession.lastActivity = Date.now();
      this.currentSession.messageCount++;
      log.debug(`Session updated (${this.currentSession.messageCount} messages)`);
    }
  }

  endSession() {
    const session = this.currentSession;
    this.currentSession = null;
    if (session) {
      log.info(`Session ended (${session.messageCount} messages)`);
    }
    return session;
  }
}

module.exports = { SessionManager };
