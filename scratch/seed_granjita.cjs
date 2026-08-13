const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://nqoqdlycxkwunngkuewb.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xb3FkbHljeGt3dW5uZ2t1ZXdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NzkzNzUsImV4cCI6MjA5MTE1NTM3NX0.Dm8RCh2pqFhwu9lJvIeuTnNWYpArSUjxPcWR1-WV4oE';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function seedGranjita() {
  console.log('Inserting La Granjita lotteries into Supabase...');

  const granjitaDraws = [
    { id: '10am-granjita', name: 'La Granjita 10:00 AM', hour: 10, minute: 0, is_active: true, close_minutes: 5, days: null },
    { id: '11am-granjita', name: 'La Granjita 11:00 AM', hour: 11, minute: 0, is_active: true, close_minutes: 5, days: null },
    { id: '1pm-granjita',  name: 'La Granjita 1:00 PM',  hour: 13, minute: 0, is_active: true, close_minutes: 5, days: null },
    { id: '3pm-granjita',  name: 'La Granjita 3:00 PM',  hour: 15, minute: 0, is_active: true, close_minutes: 5, days: ['Lunes', 'Martes', 'Jueves', 'Viernes', 'Sábado'] }
  ];

  for (const draw of granjitaDraws) {
    const { data, error } = await supabase
      .from('lotteries')
      .upsert(draw, { onConflict: 'id' });

    if (error) {
      console.error(`Error inserting ${draw.id}:`, error);
    } else {
      console.log(`Successfully seeded ${draw.id} (${draw.name})`);
    }
  }

  // Also query to confirm
  const { data: allLotteries } = await supabase.from('lotteries').select('*');
  console.log('\nTotal lotteries now in DB:', allLotteries?.length);
  allLotteries?.filter(l => l.name.toLowerCase().includes('granjita')).forEach(l => {
    console.log(' -', l.id, ':', l.name, `(${l.hour}:${l.minute})`);
  });
}

seedGranjita();
