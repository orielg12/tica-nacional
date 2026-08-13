const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://nqoqdlycxkwunngkuewb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xb3FkbHljeGt3dW5uZ2t1ZXdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NzkzNzUsImV4cCI6MjA5MTE1NTM3NX0.Dm8RCh2pqFhwu9lJvIeuTnNWYpArSUjxPcWR1-WV4oE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectVendedor2() {
  console.log('--- ALL TICKETS FOR Vendedor2 / vendedor2 ---');
  const { data: tickets, error: errTix } = await supabase
    .from('tickets')
    .select('*')
    .or('vendor_id.eq.Vendedor2,vendor_id.eq.vendedor2,vendor_id.eq.2b981d34-a1d9-4d0d-8b1d-c4e542de144f')
    .order('created_at', { ascending: false });
  
  if (errTix) {
    console.error('Error:', errTix);
    return;
  }

  console.log(`Found ${tickets.length} total tickets for Vendedor2:`);
  tickets.forEach(t => {
    console.log(`Ticket ID: ${t.id} | #: ${t.ticket_number} | Vendor: ${t.vendor_id} | Client: ${t.client_name} | Amount: $${t.total_amount} | Date: ${t.created_at} | Status: ${t.status}`);
  });

  // Also check if there are other tables referencing tickets or sales
  console.log('--- CHECK TICKET_ITEMS TABLE ---');
  if (tickets.length > 0) {
    const ticketIds = tickets.map(t => t.id);
    const { data: items, error: errItems } = await supabase
      .from('ticket_items')
      .select('*')
      .in('ticket_id', ticketIds);
    
    if (errItems) console.error('ticket_items error:', errItems);
    else console.log(`Found ${items ? items.length : 0} ticket_items corresponding to these tickets.`);
  }
}

inspectVendedor2();
