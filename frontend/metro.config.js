const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
const previous = config.server?.enhanceMiddleware;
config.server = {
  ...config.server,
  enhanceMiddleware(middleware, server) {
    const next = previous ? previous(middleware, server) : middleware;
    return (req, res, nextMiddleware) => {
      if (!['/__jangboso_api_log', '/__jangboso_app_log'].includes(req.url) || req.method !== 'POST') return next(req, res, nextMiddleware);
      let text = '';
      req.on('data', chunk => { text += chunk; if (text.length > 16384) req.destroy(); });
      req.on('end', () => {
        try {
          const data = JSON.parse(text);
          const value = field => typeof data[field] === 'string' ? data[field].slice(0, 1500) : '';
          const clean = input => input.replace(/\u001b\[[0-9;]*m/g, '').replace(/Bearer\s+\S+/gi, 'Bearer [숨김]').replace(/\b01\d[-\s]?\d{3,4}[-\s]?\d{4}\b/g, '[전화번호 숨김]');
          const scope = value('scope') || `${value('method')} ${value('path')}`;
          console.warn(`\n[앱 오류] ${clean(scope)}${Number.isInteger(data.status) ? ` | HTTP ${data.status}` : ''}${data.code ? ` | ${clean(value('code'))}` : ''}\n원인: ${clean(value('message') || value('reason'))}${data.stack ? `\n${clean(value('stack'))}` : ''}\n`);
          res.writeHead(204); res.end();
        } catch { res.writeHead(400); res.end(); }
      });
    };
  },
};
module.exports = config;
