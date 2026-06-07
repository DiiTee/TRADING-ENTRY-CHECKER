// /api/social-scan — Vercel serverless function
// Routes all X/Twitter social API calls through the server to avoid CORS.
// Provider waterfall: TwitterAPI.io → GetXAPI → Apify
// Each provider logs request URL, response code, post count, and error details.

'use strict';

const PRIORITY_KEYS = ['ca', 'ticker', 'ticker_dollar', 'name'];
const DEFAULT_TIMEOUT_MS = 15000;
const APIFY_TIMEOUT_MS  = 58000;

async function fetchTimeout(url, options, ms) {
  const ctrl = new AbortController();
  const id   = setTimeout(() => ctrl.abort(), ms || DEFAULT_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { ...options, signal: ctrl.signal });
    clearTimeout(id);
    return resp;
  } catch (e) {
    clearTimeout(id);
    if (e.name === 'AbortError')
      throw new Error('Request timed out (' + Math.round((ms || DEFAULT_TIMEOUT_MS) / 1000) + 's)');
    throw e;
  }
}

function normalizeTweet(t) {
  const created = t.created_at || t.createdAt || '';
  const ts = created ? new Date(created).getTime() : null;
  const auth =
    (t.author && (t.author.userName || t.author.screen_name)) ||
    (t.user   && (t.user.screen_name || t.user.userName))     || '';
  return {
    id:       String(t.id || t.rest_id || ''),
    text:     t.text || t.full_text || '',
    ts,
    author:   auth.toLowerCase(),
    retweets: t.retweet_count  || t.retweetCount  || 0,
    likes:    t.favorite_count || t.likeCount      || 0,
  };
}

async function tryTwitterAPIio(queries, limit, sinceTs, apiKey, log) {
  for (const key of PRIORITY_KEYS) {
    const q = queries[key];
    if (!q) continue;
    const fullQuery = sinceTs ? (q + ' since_time:' + sinceTs) : q;
    const url = 'https://api.twitterapi.io/twitter/tweet/advanced_search?' +
      new URLSearchParams({ query: fullQuery, queryType: 'Latest' }).toString();
    log.request_urls.push(url);
    log.queries_attempted.push({ provider: 'twitterapi.io', key, query: fullQuery });
    try {
      const resp = await fetchTimeout(url, { headers: { 'X-API-Key': apiKey } });
      log.response_codes.push(resp.status);
      if (resp.status === 401 || resp.status === 403) {
        const msg = 'Invalid API key (HTTP ' + resp.status + ')';
        log.errors.push('TwitterAPI.io: ' + msg);
        return { ok: false, error: msg, tweets: [] };
      }
      if (resp.status === 429) {
        const msg = 'Rate limited (HTTP 429) — wait 60s and retry';
        log.errors.push('TwitterAPI.io: ' + msg);
        return { ok: false, error: msg, tweets: [] };
      }
      if (!resp.ok) {
        log.errors.push('TwitterAPI.io: HTTP ' + resp.status);
        return { ok: false, error: 'HTTP ' + resp.status, tweets: [] };
      }
      const json = await resp.json();
      const raw  = Array.isArray(json.tweets) ? json.tweets :
                   (Array.isArray(json.data)   ? json.data   : []);
      log.post_counts.push(raw.length);
      if (!raw.length) continue;
      const tweets = raw.slice(0, limit).map(normalizeTweet).filter(t => t.ts);
      if (!tweets.length) continue;
      return { ok: true, tweets, usedQuery: key, queryValue: fullQuery, provider: 'twitterapi.io' };
    } catch (e) {
      log.errors.push('TwitterAPI.io: ' + (e.message || 'Unknown error'));
      return { ok: false, error: e.message || 'Unknown error', tweets: [] };
    }
  }
  return { ok: true, tweets: [], usedQuery: null, provider: 'twitterapi.io',
           warning: 'No posts found for any query format' };
}

async function tryGetXAPI(queries, limit, sinceTs, apiKey, log) {
  for (const key of PRIORITY_KEYS) {
    const q = queries[key];
    if (!q) continue;
    const fullQuery = sinceTs ? (q + ' since_time:' + sinceTs) : q;
    const params = new URLSearchParams({ q: fullQuery, product: 'Latest', count: String(limit) });
    const url    = 'https://api.getxapi.com/twitter/tweet/advanced_search?' + params.toString();
    log.request_urls.push(url);
    log.queries_attempted.push({ provider: 'getxapi', key, query: fullQuery });
    try {
      const resp = await fetchTimeout(url, { headers: { Authorization: 'Bearer ' + apiKey } });
      log.response_codes.push(resp.status);
      if (resp.status === 401) {
        const msg = 'Invalid Bearer token (HTTP 401)';
        log.errors.push('GetXAPI: ' + msg);
        return { ok: false, error: msg, tweets: [] };
      }
      if (resp.status === 403) {
        const msg = 'Forbidden — endpoint not enabled for this plan (HTTP 403)';
        log.errors.push('GetXAPI: ' + msg);
        return { ok: false, error: msg, tweets: [] };
      }
      if (resp.status === 429) {
        const msg = 'Rate limited (HTTP 429) — retry in a few seconds';
        log.errors.push('GetXAPI: ' + msg);
        return { ok: false, error: msg, tweets: [] };
      }
      if (!resp.ok) {
        let errMsg = '';
        try { errMsg = (await resp.json()).error || ''; } catch (_) {}
        const msg = 'HTTP ' + resp.status + (errMsg ? ': ' + errMsg : '');
        log.errors.push('GetXAPI: ' + msg);
        return { ok: false, error: msg, tweets: [] };
      }
      const json = await resp.json();
      const raw  = Array.isArray(json.data)   ? json.data :
                   (Array.isArray(json.tweets) ? json.tweets : []);
      log.post_counts.push(raw.length);
      if (!raw.length) continue;
      const tweets = raw.slice(0, limit).map(normalizeTweet).filter(t => t.ts);
      if (!tweets.length) continue;
      return { ok: true, tweets, usedQuery: key, queryValue: fullQuery, provider: 'getxapi' };
    } catch (e) {
      log.errors.push('GetXAPI: ' + (e.message || 'Unknown error'));
      return { ok: false, error: e.message || 'Unknown error', tweets: [] };
    }
  }
  return { ok: true, tweets: [], usedQuery: null, provider: 'getxapi',
           warning: 'No posts found for any query format' };
}

async function tryApify(queries, limit, token, log) {
  for (const key of PRIORITY_KEYS) {
    const q = queries[key];
    if (!q) continue;
    const url = 'https://api.apify.com/v2/acts/apidojo~tweet-scraper/run-sync-get-dataset-items' +
      '?token=' + encodeURIComponent(token) + '&timeout=45';
    log.request_urls.push(url);
    log.queries_attempted.push({ provider: 'apify', key, query: q });
    try {
      const resp = await fetchTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ searchTerms: [q], sort: 'Latest', maxItems: limit, includeReplies: false }),
      }, APIFY_TIMEOUT_MS);
      log.response_codes.push(resp.status);
      if (resp.status === 401) {
        const msg = 'Invalid Apify token (HTTP 401)';
        log.errors.push('Apify: ' + msg);
        return { ok: false, error: msg, tweets: [] };
      }
      if (!resp.ok) {
        const msg = 'HTTP ' + resp.status;
        log.errors.push('Apify: ' + msg);
        return { ok: false, error: msg, tweets: [] };
      }
      const arr = await resp.json();
      log.post_counts.push(Array.isArray(arr) ? arr.length : 0);
      if (!Array.isArray(arr) || !arr.length) continue;
      const tweets = arr.slice(0, limit).map(t => {
        const created = t.created_at || t.createdAt || '';
        const ts      = created ? new Date(created).getTime() : null;
        const auth    = (t.author && t.author.userName) || (t.user && t.user.screen_name) || '';
        return {
          id:       t.id || '',
          text:     t.full_text || t.text || '',
          ts,
          author:   auth.toLowerCase(),
          retweets: t.retweet_count  || t.retweetCount  || 0,
          likes:    t.favorite_count || t.likeCount      || 0,
        };
      }).filter(t => t.ts);
      if (!tweets.length) continue;
      return { ok: true, tweets, usedQuery: key, queryValue: q, provider: 'apify' };
    } catch (e) {
      log.errors.push('Apify: ' + (e.message || 'Unknown error'));
      return { ok: false, error: e.message || 'Unknown error', tweets: [] };
    }
  }
  return { ok: true, tweets: [], usedQuery: null, provider: 'apify',
           warning: 'No posts found for any query format' };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST')    { res.status(405).json({ error: 'Method not allowed' }); return; }

  let body = req.body;
  if (!body) {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
    } catch (_) {
      res.status(400).json({ error: 'Invalid JSON body' });
      return;
    }
  }

  const { queries, limit = 15, sinceTs = null, apiKeys = {} } = body || {};
  if (!queries) { res.status(400).json({ error: 'Missing required field: queries' }); return; }

  const twKey = apiKeys.twitterapio || '';
  const gxKey = apiKeys.getxapi     || '';
  const apKey = apiKeys.apify        || '';

  const log = {
    providers_tried:    [],
    providers_succeeded: [],
    errors:             [],
    fallback_path:      [],
    queries_attempted:  [],
    request_urls:       [],
    response_codes:     [],
    post_counts:        [],
    queries_used:       queries,
  };

  let result = null;

  if (twKey) {
    log.providers_tried.push('twitterapi.io');
    const r = await tryTwitterAPIio(queries, limit, sinceTs, twKey, log);
    if (r.ok && r.tweets && r.tweets.length > 0) {
      result = r;
      log.providers_succeeded.push('twitterapi.io');
      log.fallback_path.push('✓ TwitterAPI.io returned ' + r.tweets.length + ' posts (query key: ' + r.usedQuery + ')');
    } else {
      const msg = r.error || r.warning || 'No results';
      log.fallback_path.push('⚠ TwitterAPI.io: ' + msg);
    }
  }

  if (!result && gxKey) {
    log.providers_tried.push('getxapi');
    const r = await tryGetXAPI(queries, limit, sinceTs, gxKey, log);
    if (r.ok && r.tweets && r.tweets.length > 0) {
      result = r;
      log.providers_succeeded.push('getxapi');
      log.fallback_path.push('✓ GetXAPI returned ' + r.tweets.length + ' posts (query key: ' + r.usedQuery + ')');
    } else {
      const msg = r.error || r.warning || 'No results';
      log.fallback_path.push('⚠ GetXAPI: ' + msg);
    }
  }

  if (!result && apKey) {
    log.providers_tried.push('apify');
    const r = await tryApify(queries, limit, apKey, log);
    if (r.ok && r.tweets && r.tweets.length > 0) {
      result = r;
      log.providers_succeeded.push('apify');
      log.fallback_path.push('✓ Apify returned ' + r.tweets.length + ' posts (query key: ' + r.usedQuery + ')');
    } else {
      const msg = r.error || r.warning || 'No results';
      log.fallback_path.push('⚠ Apify: ' + msg);
    }
  }

  if (!result) {
    result = { ok: false, tweets: [], provider: null, usedQuery: null };
    if (!twKey && !gxKey && !apKey) {
      const noKeyMsg = 'No X API keys configured — add a TwitterAPI.io, GetXAPI, or Apify key in Settings';
      log.errors.push(noKeyMsg);
      log.fallback_path.push('✗ ' + noKeyMsg);
    } else {
      log.fallback_path.push('✗ All configured providers exhausted with no results');
    }
  }

  res.status(200).json({ ...result, diagnostics: log });
};
