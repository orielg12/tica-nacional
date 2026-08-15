const { createClient } = require('@supabase/supabase-js');

const supabase = createClient('https://nqoqdlycxkwunngkuewb.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xb3FkbHljeGt3dW5uZ2t1ZXdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NzkzNzUsImV4cCI6MjA5MTE1NTM3NX0.Dm8RCh2pqFhwu9lJvIeuTnNWYpArSUjxPcWR1-WV4oE');

async function inspectColumns() {
  const { data: tickets } = await supabase.from('tickets').select('*').limit(1);
  console.log('Sample ticket keys:', tickets ? Object.keys(tickets[0]) : 'None');

  const { data: tn } = await supabase.from('ticket_numbers').select('*').limit(1);
  console.log('Sample ticket_numbers keys:', tn ? Object.keys(tn[0]) : 'None');

  const { data, error } = await supabase
    .from('ticket_numbers')
    .select('number_played, amount, draw_id, ticket:ticket_id(id, status, total_amount)')
    .limit(5);
  console.log('Fixed query result:', data, 'error:', error);
}

inspectColumns();
