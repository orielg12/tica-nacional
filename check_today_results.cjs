const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://nqoqdlycxkwunngkuewb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xb3FkbHljeGt3dW5uZ2t1ZXdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NzkzNzUsImV4cCI6MjA5MTE1NTM3NX0.Dm8RCh2pqFhwu9lJvIeuTnNWYpArSUjxPcWR1-WV4oE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTodayResults() {
  console.log('=== RESULTS IN DATABASE FOR 2026-08-12 ===');
  const { data: results, error } = await supabase
    .from('results')
    .select('*')
    .eq('date', '2026-08-12')
    .order('created_at', { ascending: false });

  if (error) console.error(error);
  else {
    console.log(`Found ${results.length} results for 2026-08-12:`);
    results.forEach(r => {
      console.log(`Draw: ${r.draw_id.padEnd(16)} | Winning Number: ${r.winning_number} | Saved at: ${r.created_at}`);
    });
  }
}

checkTodayResults();
