async function testDateParams() {
  const formats = [
    'https://api.loteriasdominicanas.com/dominicana/sessions?date=2026-08-15',
    'https://api.loteriasdominicanas.com/dominicana/sessions?date=2026-08-15T00:00:00.000Z',
    'https://api.loteriasdominicanas.com/dominicana/sessions?date=2026-08-15T15:00:00.000Z',
    'https://api.loteriasdominicanas.com/dominicana/sessions?date=15-08-2026',
    'https://api.loteriasdominicanas.com/dominicana/sessions?date=2026-08-14T12:00:00.000Z'
  ];

  for (const u of formats) {
    const res = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const text = await res.text();
    console.log(u, '-> Status:', res.status, 'Body:', text.substring(0, 200));
  }
}

testDateParams();
