const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://nqoqdlycxkwunngkuewb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xb3FkbHljeGt3dW5uZ2t1ZXdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NzkzNzUsImV4cCI6MjA5MTE1NTM3NX0.Dm8RCh2pqFhwu9lJvIeuTnNWYpArSUjxPcWR1-WV4oE';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: tickets } = await supabase.from('tickets').select('id, ticket_number, total_amount, status, created_at, client_name');
  console.log('Total tickets:', tickets?.length);
  console.log('Latest 5 tickets:', tickets?.slice(-5));

  const { data: payouts } = await supabase.from('payouts').select('*');
  console.log('Total payouts:', payouts?.length);
  console.log('Payouts:', payouts);

  const { data: results } = await supabase.from('results').select('*');
  console.log('Total results:', results?.length);
  console.log('Results:', results);
}
run();
