async function findValidApiDate() {
  const months = ['2024-08-15', '2025-01-15', '2025-08-15', '2026-01-15', '2026-08-01', '2026-08-15'];
  for (const m of months) {
    const iso = `${m}T12:00:00.000Z`;
    const url = `https://api.loteriasdominicanas.com/dominicana/sessions?date=${encodeURIComponent(iso)}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (res.ok) {
      const data = await res.json();
      console.log(`${m} -> count:`, Array.isArray(data) ? data.length : data);
      if (Array.isArray(data) && data.length > 0) {
        console.log('Sample from', m, ':', data[0]);
      }
    }
  }
}

findValidApiDate();
