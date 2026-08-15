async function testApiDates() {
  const dates = [];
  const base = new Date();
  for (let i = -5; i <= 5; i++) {
    const d = new Date(base.getTime() + i * 24 * 60 * 60 * 1000);
    dates.push(d.toISOString().split('T')[0]);
  }

  console.log('Testing dates:', dates);
  for (const dt of dates) {
    const iso = `${dt}T12:00:00.000Z`;
    const url = `https://api.loteriasdominicanas.com/dominicana/sessions?date=${encodeURIComponent(iso)}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (res.ok) {
      const data = await res.json();
      console.log(`Date: ${dt} -> Sessions:`, Array.isArray(data) ? data.length : data);
      if (Array.isArray(data) && data.length > 0) {
        data.slice(0, 3).forEach(s => {
          console.log(`  [${s.game?.title || s.game?.name}] time: ${s.time} score: ${JSON.stringify(s.score)} status: ${s.status}`);
        });
      }
    }
  }
}

testApiDates();
