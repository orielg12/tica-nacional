const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://nqoqdlycxkwunngkuewb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xb3FkbHljeGt3dW5uZ2t1ZXdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NzkzNzUsImV4cCI6MjA5MTE1NTM3NX0.Dm8RCh2pqFhwu9lJvIeuTnNWYpArSUjxPcWR1-WV4oE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('--- PROFILES ---');
  const { data: profiles, error: errProf } = await supabase.from('profiles').select('*');
  if (errProf) console.error('Profiles error:', errProf);
  else console.log('Profiles:', profiles);

  console.log('--- RECENT TICKETS/SALES ---');
  const { data: tickets, error: errTix } = await supabase
    .from('tickets')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  
  if (errTix) {
    console.error('Tickets error:', errTix);
  } else {
    console.log('Tickets count retrieved:', tickets.length);
    if (tickets.length > 0) {
      console.log('Sample ticket keys:', Object.keys(tickets[0]));
      console.log('Sample ticket:', JSON.stringify(tickets[0], null, 2));
    }
    const vendorSummary = {};
    tickets.forEach(t => {
      const v = t.vendor_id || t.user_id || t.vendor_name || t.created_by || 'unknown';
      const day = t.created_at ? t.created_at.substring(0, 10) : 'no-date';
      const key = `vendor: ${v} | date: ${day}`;
      vendorSummary[key] = (vendorSummary[key] || 0) + 1;
    });
    console.log('Vendor summary (last 50 tickets):', vendorSummary);
  }
}

run();
