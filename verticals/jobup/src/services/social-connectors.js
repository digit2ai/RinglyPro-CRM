'use strict';

/**
 * The platform connectors. One function per destination type, all returning the
 * SAME shape so the agent never branches on platform when recording a result:
 *
 *   { ok, post_id, post_url, posted_at, error, transient }
 *
 * `transient` is what decides whether the agent's single retry fires. Network
 * faults, 429s and 5xx are transient. A permission, credential or content-policy
 * rejection is not, and retrying it just burns another API call against a
 * decision the platform has already made.
 *
 * NOTHING HERE INVENTS A VALUE. post_id and post_url are read from the API
 * response or left null; posted_at is stamped only after the platform confirms.
 * A connector that cannot reach the platform returns ok:false, never a
 * plausible-looking id.
 */

const GRAPH = process.env.JOBUP_GRAPH_BASE || 'https://graph.facebook.com';
const GRAPH_VERSION = process.env.JOBUP_GRAPH_VERSION || 'v21.0';
const TIMEOUT_MS = parseInt(process.env.JOBUP_GRAPH_TIMEOUT_MS || '20000', 10);

function fail(error, transient = false) {
  return { ok: false, post_id: null, post_url: null, posted_at: null, error, transient };
}

/** Meta error codes that are worth one more attempt. */
function isTransient(status, body) {
  if (status === 429) return true;
  if (status >= 500) return true;
  const code = body && body.error && body.error.code;
  // 1 unknown, 2 service temporarily unavailable, 4/17/32/613 rate limiting.
  return [1, 2, 4, 17, 32, 613].includes(code);
}

async function graph(path, { method = 'POST', params = {}, token } = {}) {
  const url = new URL(`${GRAPH}/${GRAPH_VERSION}${path}`);
  // A GET carries its parameters in the query string. Putting them in a body
  // is not merely unidiomatic — fetch rejects a GET with a body outright, so
  // the permalink lookup failed as a network error and every Instagram post
  // came back with a null url.
  const isGet = String(method).toUpperCase() === 'GET';
  const fields = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null) fields.append(k, String(v));
  fields.append('access_token', token);
  if (isGet) for (const [k, v] of fields) url.searchParams.append(k, v);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url.toString(), Object.assign({
      method,
      signal: ctrl.signal,
    }, isGet ? {} : {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: fields,
    }));
    let json = null;
    try { json = await r.json(); } catch (e) { json = null; }
    return { status: r.status, ok: r.ok, json };
  } catch (e) {
    // Abort or DNS/socket failure — transient by definition.
    return { status: 0, ok: false, json: null, networkError: e.name === 'AbortError' ? 'timeout' : e.message };
  } finally { clearTimeout(timer); }
}

/** Strip anything token-shaped out of a platform message before it is stored. */
function safeMessage(json, fallback) {
  const msg = (json && json.error && (json.error.message || json.error.type)) || fallback || 'unknown error';
  return String(msg).replace(/EAA[A-Za-z0-9]{10,}/g, '[token]').slice(0, 500);
}

/**
 * Facebook Page photo post: POST /{page-id}/photos with a public image url.
 * Returns the photo id and, when the platform gives one, the post id.
 */
async function postFacebookPage({ pageId, imageUrl, caption, token }) {
  const r = await graph(`/${encodeURIComponent(pageId)}/photos`, {
    params: { url: imageUrl, caption, published: 'true' }, token,
  });
  if (r.networkError) return fail(`network: ${r.networkError}`, true);
  if (!r.ok || !r.json || r.json.error) {
    return fail(safeMessage(r.json, `http ${r.status}`), isTransient(r.status, r.json));
  }
  // post_id is what a human can open; id is the photo. Prefer post_id, and only
  // build a url from an id the platform actually returned.
  const postId = r.json.post_id || r.json.id || null;
  if (!postId) return fail('platform returned no post id', false);
  return {
    ok: true,
    post_id: String(postId),
    post_url: `https://www.facebook.com/${String(postId)}`,
    posted_at: new Date().toISOString(),
    error: null,
    transient: false,
  };
}

/**
 * Instagram Content Publishing is two calls: create a media container, then
 * publish it. A failure between the two leaves an unpublished container and NO
 * post — which is reported as a failure, not as a success with a missing url.
 */
async function postInstagram({ igUserId, imageUrl, caption, token }) {
  const create = await graph(`/${encodeURIComponent(igUserId)}/media`, {
    params: { image_url: imageUrl, caption }, token,
  });
  if (create.networkError) return fail(`network: ${create.networkError}`, true);
  if (!create.ok || !create.json || create.json.error || !create.json.id) {
    return fail(safeMessage(create.json, `container: http ${create.status}`),
      isTransient(create.status, create.json));
  }

  const publish = await graph(`/${encodeURIComponent(igUserId)}/media_publish`, {
    params: { creation_id: create.json.id }, token,
  });
  if (publish.networkError) return fail(`network on publish: ${publish.networkError}`, true);
  if (!publish.ok || !publish.json || publish.json.error || !publish.json.id) {
    return fail(safeMessage(publish.json, `publish: http ${publish.status}`),
      isTransient(publish.status, publish.json));
  }

  const mediaId = String(publish.json.id);
  // Ask for the permalink. If Instagram does not give one, the post still
  // succeeded — the url is left null rather than guessed from the id.
  let permalink = null;
  const look = await graph(`/${mediaId}`, { method: 'GET', params: { fields: 'permalink' }, token });
  if (look.ok && look.json && look.json.permalink) permalink = look.json.permalink;

  return {
    ok: true,
    post_id: mediaId,
    post_url: permalink,
    posted_at: new Date().toISOString(),
    error: null,
    transient: false,
  };
}

/** Verify a token is live and has the permission, without posting anything. */
async function verifyCredential({ platform, accountId, token }) {
  if (!token) return { ok: false, error: 'no access token stored' };
  const path = platform === 'instagram' ? `/${encodeURIComponent(accountId)}` : `/${encodeURIComponent(accountId)}`;
  const r = await graph(path, { method: 'GET', params: { fields: 'id,name' }, token });
  if (r.networkError) return { ok: false, error: `network: ${r.networkError}` };
  if (!r.ok || !r.json || r.json.error) return { ok: false, error: safeMessage(r.json, `http ${r.status}`) };
  return { ok: true, id: r.json.id, name: r.json.name || null };
}

module.exports = { postFacebookPage, postInstagram, verifyCredential, isTransient, GRAPH_VERSION };
