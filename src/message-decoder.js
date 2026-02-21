/**
 * Decodes message text from a chat.db message row.
 *
 * Modern macOS (Ventura+) stores message text in the `attributedBody` column
 * as a serialized NSAttributedString (NSKeyedArchiver binary plist). Older
 * versions use the plain `text` column. This module handles both.
 */

function decodeMessage(row) {
  // Prefer the plain text column when available
  if (row.text && row.text.trim().length > 0) {
    return row.text;
  }

  if (!row.attributedBody) {
    return null;
  }

  return parseAttributedBody(row.attributedBody);
}

function parseAttributedBody(blob) {
  const buffer = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);

  // Scan for the NSString marker inside the NSKeyedArchiver blob
  const marker = 'NSString';
  const idx = buffer.indexOf(marker, 0, 'utf-8');
  if (idx === -1) {
    return null;
  }

  // The text content starts 5 bytes after the marker
  const content = buffer.subarray(idx + marker.length + 5);
  if (content.length === 0) return null;

  let length;
  let start;

  // The first byte(s) encode the string length
  if (content[0] === 0x81) {
    // Two-byte length (messages 128–65535 chars)
    if (content.length < 3) return null;
    length = content.readUInt16LE(1);
    start = 3;
  } else if (content[0] === 0x82) {
    // Three-byte length
    if (content.length < 4) return null;
    length = content.readUInt32LE(1) & 0x00FFFFFF;
    start = 4;
  } else if (content[0] === 0x83) {
    // Four-byte length
    if (content.length < 5) return null;
    length = content.readUInt32LE(1);
    start = 5;
  } else {
    // Single-byte length (messages <= 127 chars)
    length = content[0];
    start = 1;
  }

  if (content.length < start + length) {
    // Truncated — return what we can
    length = content.length - start;
  }

  const text = content.subarray(start, start + length).toString('utf-8');
  return text.trim().length > 0 ? text : null;
}

module.exports = { decodeMessage };
