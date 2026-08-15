const https = require('https');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { resolve(null); }
      });
    }).on('error', reject);
  });
}

function resolveNuxt(val, arr, depth = 0) {
  if (depth > 10) return val;
  if (typeof val === 'number' && val >= 0 && val < arr.length) {
    const target = arr[val];
    if (typeof target === 'string' || typeof target === 'number' || typeof target === 'boolean' || target === null) {
      return target;
    }
    if (Array.isArray(target)) {
      return target.map(item => resolveNuxt(item, arr, depth + 1));
    }
    if (typeof target === 'object') {
      const res = {};
      for (const k in target) {
        res[k] = resolveNuxt(target[k], arr, depth + 1);
      }
      return res;
    }
  }
  if (Array.isArray(val)) {
    return val.map(item => resolveNuxt(item, arr, depth + 1));
  }
  if (val && typeof val === 'object') {
    const res = {};
    for (const k in val) {
      res[k] = resolveNuxt(val[k], arr, depth + 1);
    }
    return res;
  }
  return val;
}

async function decode() {
  const data = await fetchJson('https://loteriasdominicanas.com/_payload.json');
  if (!data || !Array.isArray(data)) {
    console.log('Not array');
    return;
  }
  console.log('Payload items:', data.length);

  // Search for games or sessions
  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      // If it has title, game, score, etc.
      const resolvedTitle = typeof item.title === 'number' ? data[item.title] : item.title;
      if (typeof resolvedTitle === 'string' && (resolvedTitle.toLowerCase().includes('primera') || resolvedTitle.toLowerCase().includes('anguilla') || resolvedTitle.toLowerCase().includes('florida') || resolvedTitle.toLowerCase().includes('york'))) {
        console.log(`\nFound Game at idx ${i}:`, resolvedTitle);
        console.log('Raw object:', item);
        const resolved = resolveNuxt(item, data, 0);
        console.log('Resolved:', JSON.stringify(resolved, null, 2));
      }
    }
  }
}

decode();
