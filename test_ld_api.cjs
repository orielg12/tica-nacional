const https = require('https');

async function testEndpoints() {
  const endpoints = [
    'https://api.loteriasdominicanas.com/dominicana/sessions',
    'https://api.loteriasdominicanas.com/sessions',
    'https://api.loteriasdominicanas.com/dominicana/latest',
    'https://api.loteriasdominicanas.com/games',
    'https://api.loteriasdominicanas.com/sites/4/sessions',
    'https://loteriasdominicanas.com/api/sessions',
    'https://www.loteriasdominicanas.com/la-primera',
    'https://loterias.conectate.com.do/la-primera',
    'https://loterias.conectate.com.do/api/sessions'
  ];

  for (const ep of endpoints) {
    try {
      console.log('--- Testing:', ep);
      const res = await fetch(ep, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      console.log('Status:', res.status, 'Content-Type:', res.headers.get('content-type'));
      if (res.ok) {
        const text = await res.text();
        console.log('Length:', text.length, 'Snippet:', text.substring(0, 300));
      }
    } catch(e) {
      console.error('Error:', e.message);
    }
  }
}

testEndpoints();
