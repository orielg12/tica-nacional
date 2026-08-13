const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://nqoqdlycxkwunngkuewb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xb3FkbHljeGt3dW5uZ2t1ZXdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NzkzNzUsImV4cCI6MjA5MTE1NTM3NX0.Dm8RCh2pqFhwu9lJvIeuTnNWYpArSUjxPcWR1-WV4oE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function saveNewYorkNoche() {
  console.log('--- SAVING NEW YORK NOCHE (57-24-58) FOR 2026-08-12 ---');
  const { data, error } = await supabase
    .from('results')
    .upsert({
      draw_id: '2130-newyork',
      date: '2026-08-12',
      winning_number: '57-24-58'
    }, { onConflict: 'draw_id,date' })
    .select('*');

  if (error) {
    console.error('Error saving New York Noche result:', error);
  } else {
    console.log('Successfully saved New York Noche:', data);
  }
}

saveNewYorkNoche();
