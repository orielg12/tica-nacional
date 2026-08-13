const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://nqoqdlycxkwunngkuewb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xb3FkbHljeGt3dW5uZ2t1ZXdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NzkzNzUsImV4cCI6MjA5MTE1NTM3NX0.Dm8RCh2pqFhwu9lJvIeuTnNWYpArSUjxPcWR1-WV4oE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.from('lotteries').select('*');
  if (error) {
    console.error('Error fetching all lotteries:', error);
  } else {
    console.log('All Lotteries in DB:', data);
  }
}

check();
