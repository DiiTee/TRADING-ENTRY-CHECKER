'use strict';
// Local development server for Trading Entry Checker.
// Serves trading-entry-checker.html and proxies /api/social-scan to the
// Vercel serverless function handler so CORS-blocked providers work locally.

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT    = parseInt(process.env.PORT || '5000', 10);
const HTML    = path.join(__dirname, 'trading-entry-checker.html');
const handler = require('./api/social-scan');

const server = http.createServer((req, res) => {
  const isApi = req.url === '/api/social-scan';

  if (isApi && req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  if (isApi && req.method === 'POST') {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', async () => {
      const bodyStr = Buffer.concat(chunks).toString();
      let parsedBody = {};
      try { parsedBody = JSON.parse(bodyStr); } catch (_) {}

      const mockReq = { method: req.method, headers: req.headers, body: parsedBody };
      const mockRes = {
        _status:  200,
        _headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        status(code)  { this._status = code; return this; },
        setHeader(k, v) { this._headers[k] = v; },
        json(data) {
          res.writeHead(this._status, this._headers);
          res.end(JSON.stringify(data));
        },
        end() { res.writeHead(this._status, this._headers); res.end(); },
      };

      try {
        await handler(mockReq, mockRes);
      } catch (e) {
        console.error('[/api/social-scan] handler error:', e);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error: ' + e.message }));
      }
    });
    return;
  }

  fs.readFile(HTML, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('TEC dev server → http://0.0.0.0:' + PORT);
  console.log('Social scan proxy active at /api/social-scan');
});
