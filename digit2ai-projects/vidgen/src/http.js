'use strict';

const nodeHttp = require('http');
const nodeHttps = require('https');
const { URL } = require('url');

/**
 * The http client the provider adapters are given.
 *
 * IT NEVER SIZES A RESPONSE FROM content-length. Fish Audio returns synthesized
 * audio as `transfer-encoding: chunked` with no content-length header at all
 * (observed 2026-08-22: 34,271 bytes of mp3 arrived that way). A client that
 * preallocates from content-length, or that reads it to decide whether there is
 * a body, gets zero bytes back and hands the pipeline a "successful" empty
 * voiceover — which only surfaces four stages later as an ffprobe failure.
 *
 * Chunks are accumulated as they arrive and concatenated at 'end'. That is
 * correct for chunked and content-length responses alike, so there is no
 * branch on the header and no way to regress into trusting it.
 *
 * Resolves to the shape documented in providers/index.js:
 *   { ok, status, headers, buffer, body, error }
 */

function lowerKeys(obj) {
  const out = {};
  for (const k of Object.keys(obj || {})) out[k.toLowerCase()] = obj[k];
  return out;
}

function shape(res, buffer) {
  const status = res.statusCode;
  const ok = status >= 200 && status < 300;
  const headers = res.headers;            // node lower-cases these already
  const contentType = String(headers['content-type'] || '');

  // Parse JSON on both paths: providers put the actionable part of a failure
  // in the error body, not in the status.
  let body = null;
  if (buffer.length && /\bjson\b/.test(contentType)) {
    try { body = JSON.parse(buffer.toString('utf8')); } catch (_) { body = null; }
  }

  return {
    ok,
    status,
    headers,
    buffer,
    body,
    error: ok ? null : ((body && (body.message || body.error)) || `HTTP ${status}`)
  };
}

function request(method, url, jsonBody, headers = {}, opts = {}) {
  const u = new URL(url);
  const lib = u.protocol === 'https:' ? nodeHttps : nodeHttp;
  const payload = (jsonBody === undefined || jsonBody === null)
    ? null
    : Buffer.from(JSON.stringify(jsonBody), 'utf8');

  const timeoutMs = opts.timeoutMs || 120000;

  return new Promise((resolve, reject) => {
    const req = lib.request({
      method,
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port || undefined,
      path: u.pathname + u.search,
      headers: Object.assign(
        { accept: '*/*' },
        payload ? { 'content-type': 'application/json', 'content-length': payload.length } : {},
        lowerKeys(headers)
      )
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(shape(res, Buffer.concat(chunks))));
      res.on('error', reject);
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(Object.assign(new Error(`request to ${u.host} timed out after ${timeoutMs}ms`),
        { code: 'http_timeout' }));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const post = (url, jsonBody, headers, opts) => request('POST', url, jsonBody, headers, opts);
const get = (url, headers, opts) => request('GET', url, null, headers, opts);

module.exports = { post, get, request };
