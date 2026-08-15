async function checkServerDate() {
  const res = await fetch('https://loteriasdominicanas.com/', { headers: { 'User-Agent': 'Mozilla/5.0' } });
  console.log('Server Date header:', res.headers.get('date'));
  const serverDate = new Date(res.headers.get('date'));
  console.log('Parsed server date:', serverDate.toISOString());

  // Try querying with serverDate
  const iso = serverDate.toISOString();
  const apiRes = await fetch(`https://api.loteriasdominicanas.com/dominicana/sessions?date=${encodeURIComponent(iso)}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const data = await apiRes.json();
  console.log('Data for serverDate ISO:', data);

  // Also try yesterday / today / tomorrow in server year
  const yIso = new Date(serverDate.getTime() - 24*60*60*1000).toISOString();
  const apiResY = await fetch(`https://api.loteriasdominicanas.com/dominicana/sessions?date=${encodeURIComponent(yIso)}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  console.log('Data for yesterday ISO:', await apiResY.json());
}

checkServerDate();
