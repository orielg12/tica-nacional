const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://nqoqdlycxkwunngkuewb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xb3FkbHljeGt3dW5uZ2t1ZXdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NzkzNzUsImV4cCI6MjA5MTE1NTM3NX0.Dm8RCh2pqFhwu9lJvIeuTnNWYpArSUjxPcWR1-WV4oE';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: tickets } = await supabase.from('tickets').select('id, ticket_number, total_amount, status, created_at, client_name');
  console.log('--- ALL TICKETS ---');
  tickets?.forEach(t => {
    console.log(`ID: ${t.id}, Num: ${t.ticket_number}, Amt: ${t.total_amount}, Client: ${t.client_name}, Status: ${t.status}, Created: ${t.created_at}`);
  });

  const { data: payouts } = await supabase.from('payouts').select('*');
  console.log('--- ALL PAYOUTS ---');
  console.log(payouts);
}
run();
