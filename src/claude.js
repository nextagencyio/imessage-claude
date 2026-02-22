const { spawn } = require('child_process');
const log = require('./logger');

function invokeClaude(prompt, options = {}) {
  let child;

  const promise = new Promise((resolve, reject) => {
    const args = ['-p', prompt, '--output-format', 'json', '--dangerously-skip-permissions'];

    if (options.sessionId) {
      args.push('--resume', options.sessionId);
    }

    if (options.allowedTools && options.allowedTools.length > 0) {
      args.push('--allowedTools', options.allowedTools.join(','));
    }

    if (options.maxTurns) {
      args.push('--max-turns', String(options.maxTurns));
    }

    log.debug(`Spawning: claude ${args.join(' ')}`);

    child = spawn('claude', args, {
      cwd: options.workingDirectory || process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Claude exited with code ${code}: ${stderr || stdout}`));
        return;
      }
      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch (e) {
        // If JSON parse fails, return the raw text as the result
        resolve({ result: stdout.trim(), session_id: null, is_error: false });
      }
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn claude: ${err.message}`));
    });
  });

  // Attach the child process so the timeout can kill it
  promise._child = child;
  return promise;
}

function invokeClaudeWithTimeout(prompt, options, timeoutMs) {
  const claudePromise = invokeClaude(prompt, options);

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      // Kill the child process so it doesn't linger
      if (claudePromise._child && !claudePromise._child.killed) {
        log.warn('Killing timed-out Claude process');
        claudePromise._child.kill('SIGTERM');
      }
      reject(new Error(`Claude timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
  });

  return Promise.race([claudePromise, timeoutPromise]);
}

module.exports = { invokeClaude, invokeClaudeWithTimeout };
