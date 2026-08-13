const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://nqoqdlycxkwunngkuewb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xb3FkbHljeGt3dW5uZ2t1ZXdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NzkzNzUsImV4cCI6MjA5MTE1NTM3NX0.Dm8RCh2pqFhwu9lJvIeuTnNWYpArSUjxPcWR1-WV4oE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function transferSales() {
  const ticketIdsToTransfer = [
    '36a8d662-c550-4618-965f-38de744b39c5',
    '312637f2-c159-4a22-a049-4754a8cc89d9',
    '1ac07306-2742-4327-bf92-497410df65d3'
  ];

  console.log('--- BEFORE TRANSFER ---');
  const { data: beforeTickets, error: errBefore } = await supabase
    .from('tickets')
    .select('id, ticket_number, vendor_id, client_name, total_amount, created_at')
    .in('id', ticketIdsToTransfer);
  
  if (errBefore) {
    console.error('Error fetching before state:', errBefore);
    return;
  }
  console.log('Tickets before transfer:', beforeTickets);

  console.log('\n--- PERFORMING TRANSFER TO vendedor1 ---');
  const { data: updatedTickets, error: errUpdate } = await supabase
    .from('tickets')
    .update({ vendor_id: 'vendedor1' })
    .in('id', ticketIdsToTransfer)
    .select('id, ticket_number, vendor_id, client_name, total_amount, created_at');

  if (errUpdate) {
    console.error('Error updating tickets:', errUpdate);
  } else {
    console.log('Successfully updated tickets:', updatedTickets);
  }

  console.log('\n--- VERIFYING AFTER TRANSFER ---');
  const { data: verifyTickets, error: errVerify } = await supabase
    .from('tickets')
    .select('id, ticket_number, vendor_id, client_name, total_amount, created_at')
    .in('id', ticketIdsToTransfer);

  if (errVerify) console.error('Verification error:', errVerify);
  else console.log('Verified tickets after update:', verifyTickets);
}

transferSales();
