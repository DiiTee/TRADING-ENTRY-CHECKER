// /api/social-scan — Vercel serverless function
// Routes all X/Twitter social API calls through the server to avoid CORS.
// Scan modes: first_success | auto_fallback | merge_all
// Supports 5 configurable Apify actors.

'use strict';

const PRIORITY_KEYS = ['ca', 'ticker', 'ticker_dollar', 'name'];
const DEFAULT_TIMEOUT_MS = 15000;
const APIFY_TIMEOUT_MS  = 58000;

const APIFY_ACTORS = {
  getxapi_actor:  'getxapi~twitter-scraper',
  xquik:          'xquik~x-tweet-scraper',
  quadraphonic:   'celebrated-quadraphonic~x-twitter-scraper-v3',
  kaitoeasyapi:   'kaitoeasyapi~twitter-x-data-tweet-scraper-pay-per-result-cheapest',
  igolaizola:     'igolaizola~x-twitter-scraper-ppe',
};

const COST_PER_TWEET = {
  'twitterapi.io':      0.00015,
  'getxapi':            0.00005,
  'apify_getxapi_actor':0.00005,
  'apify_xquik':        0.00015,
  'apify_quadraphonic': 0.00020,
  'apify_kaitoeasyapi': 0.00025,
  'apify_igolaizola':   0.00015,
};

function apifyCostKey(actor) {
  return 'apify_' + (actor || 'getxapi_actor');
}

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

function buildApifyInput(actorKey, query, limit) {
  switch (actorKey) {
    case 'getxapi_actor':
      return { searchQuery: query, count: limit, searchType: 'Latest' };
    case 'xquik':
      return { searchTerms: [query], maxItems: limit, sort: 'Latest', includeReplies: false };
    case 'quadraphonic':
      return { searchQueries: [query], maxTweets: limit, mode: 'latest' };
    case 'kaitoeasyapi':
      return { searchQueries: [query], maxItems: limit, searchType: 'Latest' };
    case 'igolaizola':
      return { queries: [{ term: query }], maxResults: limit, sort: 'latest' };
    default:
      return { searchTerms: [query], maxItems: limit, sort: 'Latest' };
  }
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
        const msg = 'TwitterAPI.io Invalid API Key (HTTP ' + resp.status + ')';
        log.errors.push(msg);
        return { ok: false, error: msg, tweets: [] };
      }
      if (resp.status === 429) {
        const msg = 'TwitterAPI.io Rate Limited — wait 60s and retry';
        log.errors.push(msg);
        return { ok: false, error: msg, tweets: [] };
      }
      if (!resp.ok) {
        const msg = 'TwitterAPI.io HTTP ' + resp.status;
        log.errors.push(msg);
        return { ok: false, error: msg, tweets: [] };
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
      const msg = 'TwitterAPI.io ' + (e.message && e.message.includes('timed out') ? 'Request Timed Out (15s)' : (e.message || 'Unknown error'));
      log.errors.push(msg);
      return { ok: false, error: msg, tweets: [] };
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
        const msg = 'GetXAPI Invalid Bearer Token (HTTP 401)';
        log.errors.push(msg);
        return { ok: false, error: msg, tweets: [] };
      }
      if (resp.status === 403) {
        const msg = 'GetXAPI Forbidden — endpoint not enabled for this plan (HTTP 403)';
        log.errors.push(msg);
        return { ok: false, error: msg, tweets: [] };
      }
      if (resp.status === 429) {
        const msg = 'GetXAPI Rate Limited — retry in a few seconds';
        log.errors.push(msg);
        return { ok: false, error: msg, tweets: [] };
      }
      if (!resp.ok) {
        let errMsg = '';
        try { errMsg = (await resp.json()).error || ''; } catch (_) {}
        const msg = 'GetXAPI HTTP ' + resp.status + (errMsg ? ': ' + errMsg : '');
        log.errors.push(msg);
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
      const msg = 'GetXAPI ' + (e.message && e.message.includes('timed out') ? 'Request Timed Out' : (e.message || 'Unknown error'));
      log.errors.push(msg);
      return { ok: false, error: msg, tweets: [] };
    }
  }
  return { ok: true, tweets: [], usedQuery: null, provider: 'getxapi',
           warning: 'No posts found for any query format' };
}

async function tryApify(queries, limit, token, actorKey, log) {
  const actorId = APIFY_ACTORS[actorKey] || APIFY_ACTORS.getxapi_actor;
  for (const key of PRIORITY_KEYS) {
    const q = queries[key];
    if (!q) continue;
    const url = 'https://api.apify.com/v2/acts/' + actorId +
      '/run-sync-get-dataset-items?token=' + encodeURIComponent(token) + '&timeout=45';
    log.request_urls.push(url);
    log.queries_attempted.push({ provider: 'apify', key, query: q });
    try {
      const input = buildApifyInput(actorKey, q, limit);
      const resp = await fetchTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }, APIFY_TIMEOUT_MS);
      log.response_codes.push(resp.status);
      if (resp.status === 401) {
        const msg = 'Apify Invalid Token (HTTP 401)';
        log.errors.push(msg);
        return { ok: false, error: msg, tweets: [] };
      }
      if (resp.status === 400) {
        const msg = 'Apify Invalid Actor Input (HTTP 400) — check actor configuration';
        log.errors.push(msg);
        return { ok: false, error: msg, tweets: [] };
      }
      if (resp.status === 404) {
        const msg = 'Apify Actor Not Found (HTTP 404) — actor may be unavailable or retired';
        log.errors.push(msg);
        return { ok: false, error: msg, tweets: [] };
      }
      if (!resp.ok) {
        const msg = 'Apify HTTP ' + resp.status;
        log.errors.push(msg);
        return { ok: false, error: msg, tweets: [] };
      }
      const arr = await resp.json();
      if (!Array.isArray(arr)) {
        const msg = 'Apify Actor Returned Invalid Response (expected array, got ' + typeof arr + ')';
        log.errors.push(msg);
        return { ok: false, error: msg, tweets: [] };
      }
      log.post_counts.push(arr.length);
      if (!arr.length) continue;
      const tweets = arr.slice(0, limit).map(t => {
        const created = t.created_at || t.createdAt || '';
        const ts      = created ? new Date(created).getTime() : null;
        const auth    = (t.author && t.author.userName) || (t.user && t.user.screen_name) || '';
        return {
          id:       String(t.id || t.rest_id || ''),
          text:     t.full_text || t.text || '',
          ts,
          author:   auth.toLowerCase(),
          retweets: t.retweet_count  || t.retweetCount  || 0,
          likes:    t.favorite_count || t.likeCount      || 0,
        };
      }).filter(t => t.ts);
      if (!tweets.length) {
        log.errors.push('Apify Actor Returned Zero Results');
        continue;
      }
      return { ok: true, tweets, usedQuery: key, queryValue: q, provider: 'apify' };
    } catch (e) {
      const msg = 'Apify ' + (e.message && e.message.includes('timed out') ? 'Actor Request Timed Out (45s)' : (e.message || 'Unknown error'));
      log.errors.push(msg);
      return { ok: false, error: msg, tweets: [] };
    }
  }
  return { ok: true, tweets: [], usedQuery: null, provider: 'apify',
           warning: 'Apify Actor Returned Zero Results' };
}

function mergeTweets(arrays, limit) {
  const seen   = new Set();
  const merged = [];
  for (const arr of arrays) {
    for (const t of (arr || [])) {
      const key = t.id || (t.author + ':' + String(t.text || '').slice(0, 40));
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(t);
      }
    }
  }
  return limit ? merged.slice(0, limit) : merged;
}

async function runProvider(name, fn, cost_key, log) {
  const t0 = Date.now();
  const r  = await fn();
  const ms = Date.now() - t0;
  const cnt    = (r.tweets || []).length;
  const cost   = cnt * (COST_PER_TWEET[cost_key] || 0);
  const status = r.ok && cnt > 0 ? 'Success' : r.ok ? 'No Results' : 'Failed';
  if (r.ok && cnt > 0) log.providers_succeeded.push(name);
  const fp = r.ok && cnt > 0
    ? ('✓ ' + name + ' returned ' + cnt + ' posts' + (r.usedQuery ? ' (query: ' + r.usedQuery + ')' : ''))
    : ('⚠ ' + name + ': ' + (r.error || r.warning || 'No results'));
  log.fallback_path.push(fp);
  return { r, diag: { provider: name, status, error: r.error || null, tweets: cnt, requestTimeMs: ms, costEstimate: cost } };
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

  const {
    queries,
    limit       = 15,
    sinceTs     = null,
    apiKeys     = {},
    scanMode    = 'auto_fallback',
    providerConfig = {},
    apifyActor  = 'getxapi_actor',
  } = body || {};

  if (!queries) { res.status(400).json({ error: 'Missing required field: queries' }); return; }

  const twKey = apiKeys.twitterapio || '';
  const gxKey = apiKeys.getxapi     || '';
  const apKey = apiKeys.apify        || '';

  const twEnabled = providerConfig.twitterapi !== false;
  const gxEnabled = providerConfig.getxapi    !== false;
  const apEnabled = providerConfig.apify       !== false;

  const log = {
    scan_mode:           scanMode,
    apify_actor:         apifyActor,
    providers_tried:     [],
    providers_succeeded: [],
    errors:              [],
    fallback_path:       [],
    queries_attempted:   [],
    request_urls:        [],
    response_codes:      [],
    post_counts:         [],
    queries_used:        queries,
  };

  const providerDiagnostics = [];
  let result = null;

  // ── Disabled-provider helper ──────────────────────────────────────────────
  function skipDiag(label, reason, costKey) {
    log.fallback_path.push('— ' + label + ': ' + reason);
    providerDiagnostics.push({ provider: label, status: 'Disabled', error: reason, tweets: 0, requestTimeMs: 0, costEstimate: 0, costKey });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SEQUENTIAL MODES: first_success / auto_fallback
  // ─────────────────────────────────────────────────────────────────────────
  if (scanMode === 'first_success' || scanMode === 'auto_fallback') {

    // TwitterAPI.io
    if (twEnabled && twKey) {
      log.providers_tried.push('twitterapi.io');
      const { r, diag } = await runProvider('TwitterAPI.io', () =>
        tryTwitterAPIio(queries, limit, sinceTs, twKey, log), 'twitterapi.io', log);
      diag.costKey = 'twitterapi';
      providerDiagnostics.push(diag);
      if (r.ok && (r.tweets || []).length > 0) result = r;
    } else if (!twEnabled) {
      skipDiag('TwitterAPI.io', 'Provider Disabled By User', 'twitterapi');
    } else {
      skipDiag('TwitterAPI.io', 'No API key configured', 'twitterapi');
    }

    // GetXAPI
    if (!result) {
      if (gxEnabled && gxKey) {
        log.providers_tried.push('getxapi');
        const { r, diag } = await runProvider('GetXAPI', () =>
          tryGetXAPI(queries, limit, sinceTs, gxKey, log), 'getxapi', log);
        diag.costKey = 'getxapi';
        providerDiagnostics.push(diag);
        if (r.ok && (r.tweets || []).length > 0) result = r;
      } else if (!gxEnabled) {
        skipDiag('GetXAPI', 'Provider Disabled By User', 'getxapi');
      } else {
        skipDiag('GetXAPI', 'No API key configured', 'getxapi');
      }
    }

    // Apify
    if (!result) {
      if (apEnabled && apKey) {
        log.providers_tried.push('apify');
        const actorLabel = 'Apify (' + (apifyActor || 'getxapi_actor') + ')';
        const { r, diag } = await runProvider(actorLabel, () =>
          tryApify(queries, limit, apKey, apifyActor, log), apifyCostKey(apifyActor), log);
        diag.costKey = 'apify';
        providerDiagnostics.push(diag);
        if (r.ok && (r.tweets || []).length > 0) result = r;
      } else if (!apEnabled) {
        skipDiag('Apify', 'Provider Disabled By User', 'apify');
      } else {
        skipDiag('Apify', 'No Apify token configured', 'apify');
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MERGE ALL MODE: run all enabled providers concurrently, deduplicate
  // ─────────────────────────────────────────────────────────────────────────
  if (scanMode === 'merge_all') {
    const tasks = [];

    if (twEnabled && twKey) {
      log.providers_tried.push('twitterapi.io');
      tasks.push(runProvider('TwitterAPI.io', () =>
        tryTwitterAPIio(queries, limit, sinceTs, twKey, log), 'twitterapi.io', log)
        .then(({ r, diag }) => { diag.costKey = 'twitterapi'; providerDiagnostics.push(diag); return r; }));
    } else {
      skipDiag('TwitterAPI.io', twEnabled ? 'No API key configured' : 'Provider Disabled By User', 'twitterapi');
      tasks.push(Promise.resolve({ ok: false, tweets: [] }));
    }

    if (gxEnabled && gxKey) {
      log.providers_tried.push('getxapi');
      tasks.push(runProvider('GetXAPI', () =>
        tryGetXAPI(queries, limit, sinceTs, gxKey, log), 'getxapi', log)
        .then(({ r, diag }) => { diag.costKey = 'getxapi'; providerDiagnostics.push(diag); return r; }));
    } else {
      skipDiag('GetXAPI', gxEnabled ? 'No API key configured' : 'Provider Disabled By User', 'getxapi');
      tasks.push(Promise.resolve({ ok: false, tweets: [] }));
    }

    if (apEnabled && apKey) {
      log.providers_tried.push('apify');
      const actorLabel = 'Apify (' + (apifyActor || 'getxapi_actor') + ')';
      tasks.push(runProvider(actorLabel, () =>
        tryApify(queries, limit, apKey, apifyActor, log), apifyCostKey(apifyActor), log)
        .then(({ r, diag }) => { diag.costKey = 'apify'; providerDiagnostics.push(diag); return r; }));
    } else {
      skipDiag('Apify', apEnabled ? 'No Apify token configured' : 'Provider Disabled By User', 'apify');
      tasks.push(Promise.resolve({ ok: false, tweets: [] }));
    }

    const settled = await Promise.all(tasks);
    const merged  = mergeTweets(settled.map(r => r.tweets), limit * 2);
    const anyOk   = settled.some(r => r.ok && (r.tweets || []).length > 0);

    if (anyOk) {
      const firstOk = settled.find(r => r.ok && (r.tweets || []).length > 0);
      result = {
        ok: true,
        tweets: merged,
        provider: log.providers_succeeded.length > 1 ? 'merged' : (firstOk ? firstOk.provider : null),
        usedQuery: firstOk ? firstOk.usedQuery : null,
        queryValue: firstOk ? firstOk.queryValue : null,
      };
      log.fallback_path.push('✓ Merged ' + merged.length + ' unique posts from ' + log.providers_succeeded.length + ' provider(s)');
    }
  }

  // ── Final fallback ────────────────────────────────────────────────────────
  if (!result) {
    result = { ok: false, tweets: [], provider: null, usedQuery: null };
    const noKey = !twKey && !gxKey && !apKey;
    const allOff = !twEnabled && !gxEnabled && !apEnabled;
    if (allOff) {
      const msg = 'All providers disabled — enable at least one in Social Provider Settings';
      log.errors.push(msg);
      log.fallback_path.push('✗ ' + msg);
    } else if (noKey) {
      const msg = 'No X API keys configured — add a TwitterAPI.io, GetXAPI, or Apify key in Settings';
      log.errors.push(msg);
      log.fallback_path.push('✗ ' + msg);
    } else {
      log.fallback_path.push('✗ All configured providers exhausted — no results returned');
    }
  }

  res.status(200).json({ ...result, diagnostics: log, providerDiagnostics });
};
