const { spawn } = require('child_process');
const log = require('./logger');

function invokeClaude(prompt, options = {}) {
  return new Promise((resolve, reject) => {
    const args = ['-p', prompt, '--output-format', 'json'];

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

    const child = spawn('claude', args, {
      cwd: options.workingDirectory || process.cwd(),
      stdio: ['inherit', 'pipe', 'pipe'],
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
}

function invokeClaudeWithTimeout(prompt, options, timeoutMs) {
  return Promise.race([
    invokeClaude(prompt, options),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Claude timed out after ${Math.round(timeoutMs / 1000)}s`)), timeoutMs)
    ),
  ]);
}

module.exports = { invokeClaude, invokeClaudeWithTimeout };
