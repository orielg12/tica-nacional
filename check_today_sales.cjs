const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://nqoqdlycxkwunngkuewb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xb3FkbHljeGt3dW5uZ2t1ZXdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NzkzNzUsImV4cCI6MjA5MTE1NTM3NX0.Dm8RCh2pqFhwu9lJvIeuTnNWYpArSUjxPcWR1-WV4oE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTodaySales() {
  console.log('=== TICKETS FOR Vendedor2 / vendedor2 ===');
  const { data: tickets, error: errT } = await supabase
    .from('tickets')
    .select('*')
    .or('vendor_id.eq.Vendedor2,vendor_id.eq.vendedor2,vendor_id.eq.2b981d34-a1d9-4d0d-8b1d-c4e542de144f')
    .order('created_at', { ascending: false });

  if (errT) console.error('Error tickets:', errT);
  else {
    console.log('Total tickets:', tickets.length);
    tickets.forEach(t => {
      console.log(`[Ticket ${t.id}] #: ${t.ticket_number} | Vendor: ${t.vendor_id} | Client: ${t.client_name} | Total: $${t.total_amount} | Date: ${t.created_at}`);
    });
  }

  console.log('\n=== PALET_TICKETS FOR Vendedor2 / vendedor2 ===');
  const { data: paletTickets, error: errP } = await supabase
    .from('palet_tickets')
    .select('*')
    .or('vendor_id.eq.Vendedor2,vendor_id.eq.vendedor2,vendor_id.eq.2b981d34-a1d9-4d0d-8b1d-c4e542de144f')
    .order('created_at', { ascending: false });

  if (errP) console.error('Error palet_tickets:', errP);
  else {
    console.log('Total palet tickets:', paletTickets ? paletTickets.length : 0);
    paletTickets?.forEach(pt => {
      console.log(`[Palet Ticket ${pt.id}] Vendor: ${pt.vendor_id} | Client: ${pt.client_name} | Total: $${pt.total_amount} | Date: ${pt.created_at}`);
    });
  }

  console.log('\n=== PAYOUTS FOR Vendedor2 / vendedor2 ===');
  const { data: payouts, error: errPay } = await supabase
    .from('payouts')
    .select('*')
    .or('paid_by.eq.Vendedor2,paid_by.eq.vendedor2,paid_by.eq.2b981d34-a1d9-4d0d-8b1d-c4e542de144f')
    .order('created_at', { ascending: false });

  if (errPay) console.error('Error payouts:', errPay);
  else {
    console.log('Total payouts:', payouts ? payouts.length : 0);
    payouts?.forEach(p => {
      console.log(`[Payout ${p.id}] PaidBy: ${p.paid_by} | Amount: $${p.amount} | Date: ${p.created_at}`);
    });
  }
}

checkTodaySales();
