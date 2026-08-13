const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://nqoqdlycxkwunngkuewb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xb3FkbHljeGt3dW5uZ2t1ZXdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NzkzNzUsImV4cCI6MjA5MTE1NTM3NX0.Dm8RCh2pqFhwu9lJvIeuTnNWYpArSUjxPcWR1-WV4oE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  console.log('Inserting duplicate name/time lottery with unique ID...');
  const { data, error } = await supabase.from('lotteries').insert({
    id: 'test-dup-123',
    name: 'La Primera',
    hour: 11,
    minute: 0,
    days: null,
    is_active: true
  }).select('*');

  if (error) {
    console.error('Insert Error for duplicate name/time:', error);
  } else {
    console.log('Insert Success for duplicate name/time:', data);
    // Cleanup
    await supabase.from('lotteries').delete().eq('id', 'test-dup-123');
  }
}

check();
