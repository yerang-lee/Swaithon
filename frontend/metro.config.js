const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
const previous = config.server?.enhanceMiddleware;
config.server = {
  ...config.server,
  enhanceMiddleware(middleware, server) {
    const next = previous ? previous(middleware, server) : middleware;
    return (req, res, nextMiddleware) => {
      if (req.url !== '/__jangboso_api_log' || req.method !== 'POST') return next(req, res, nextMiddleware);
      let text = '';
      req.on('data', chunk => { text += chunk; if (text.length > 8192) req.destroy(); });
      req.on('end', () => {
        try {
          const data = JSON.parse(text);
          const value = field => typeof data[field] === 'string' ? data[field].slice(0, 1500) : '';
          console.warn(`\n[API 오류] ${value('method')} ${value('path')} | HTTP ${Number.isInteger(data.status) ? data.status : '응답 없음'}\n원인: ${value('reason')}${data.detail ? `\n서버 상세: ${value('detail')}` : ''}\n`);
          res.writeHead(204); res.end();
        } catch { res.writeHead(400); res.end(); }
      });
    };
  },
};
module.exports = config;
