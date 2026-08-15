const { createClient } = require('@supabase/supabase-js');

const supabase = createClient('https://nqoqdlycxkwunngkuewb.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xb3FkbHljeGt3dW5uZ2t1ZXdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NzkzNzUsImV4cCI6MjA5MTE1NTM3NX0.Dm8RCh2pqFhwu9lJvIeuTnNWYpArSUjxPcWR1-WV4oE');

async function inspectRiskLimits() {
  const { data, error } = await supabase.from('risk_limits').select('*');
  console.log('risk_limits rows:', data, 'error:', error);
}

inspectRiskLimits();
