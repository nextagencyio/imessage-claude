const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

const level = LOG_LEVELS[process.env.LOG_LEVEL || 'info'] || 1;

function log(lvl, ...args) {
  if (LOG_LEVELS[lvl] >= level) {
    const ts = new Date().toISOString();
    const fn = lvl === 'error' || lvl === 'warn' ? console.error : console.log;
    fn(`[${ts}] [${lvl.toUpperCase()}]`, ...args);
  }
}

module.exports = {
  debug: (...args) => log('debug', ...args),
  info: (...args) => log('info', ...args),
  warn: (...args) => log('warn', ...args),
  error: (...args) => log('error', ...args),
};
