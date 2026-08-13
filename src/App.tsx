import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy, useEffect } from 'react';
import { useStore } from './store/useStore';
import { supabase } from './utils/supabase';

// Admin
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'));
const AdminLotteries = lazy(() => import('./pages/admin/LotteryManager'));
const AdminRisk = lazy(() => import('./pages/admin/RiskManagement'));
const AdminResults = lazy(() => import('./pages/admin/ResultsManager'));
const AdminUsers = lazy(() => import('./pages/admin/UsersManager'));
const AdminReports = lazy(() => import('./pages/admin/Reports'));
const AdminSettings = lazy(() => import('./pages/admin/Settings'));
const AdminTickets = lazy(() => import('./pages/admin/TicketsManager'));
const AdminManualSale = lazy(() => import('./pages/admin/ManualSale'));
const AdminLayout = lazy(() => import('./components/admin/AdminLayout'));
const ForecastsView = lazy(() => import('./components/shared/ForecastsView'));

// Vendor
const VendorPOS = lazy(() => import('./pages/vendor/POS'));
const PaletPOS = lazy(() => import('./pages/vendor/PaletPOS'));
const GranjitaPOS = lazy(() => import('./pages/vendor/GranjitaPOS'));
const VendorResults = lazy(() => import('./pages/vendor/Results'));
const VendorTickets = lazy(() => import('./pages/vendor/Tickets'));
const VendorSales = lazy(() => import('./pages/vendor/Sales'));
const VendorLayout = lazy(() => import('./components/vendor/VendorLayout'));
const LinkPrinter = lazy(() => import('./pages/vendor/LinkPrinter'));
const CashClose = lazy(() => import('./pages/vendor/CashClose'));
const VendorPastDraws = lazy(() => import('./pages/vendor/PastDraws'));

// Auth
const Login = lazy(() => import('./pages/auth/Login'));
const AdminLogin = lazy(() => import('./pages/auth/AdminLogin'));
const ProtectedRoute = lazy(() => import('./components/auth/ProtectedRoute'));

function Loader() {
  return (
    <div className="flex justify-center items-center" style={{ height: '100vh', backgroundColor: '#f0f2f5', color: '#16a34a' }}>
      <div style={{ padding: '20px', borderRadius: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: '40px', height: '40px', border: '4px solid #16a34a', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <h3 style={{ marginTop: '15px' }}>PUNTO DE VENTA</h3>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function App() {
  const store = useStore();
  
  useEffect(() => {
    // Sincronizar sorteos y usuarios globales al montar la app
    store.fetchLotteries();
    store.fetchUsers();

    // Configurar canal de tiempo real para cambios en sorteos
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lotteries' },
        () => {
          // Fetch inmediato cuando hay cambio en la BD
          store.fetchLotteries();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Realtime] Conectado a cambios de loterias');
        }
      });

    // Refresco preventivo cada 15 segundos (fallback si realtime falla)
    const interval = setInterval(() => {
      store.fetchLotteries();
      store.fetchUsers();
    }, 15000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, []);

  return (
    <>
      <div id="print-section" className="print-only"></div>
      
      <div className="no-print h-full w-full flex-col">
        <BrowserRouter>
          <Suspense fallback={<Loader />}>
            <Routes>
              {/* Auth Routes */}
              <Route path="/" element={<Navigate to="/login" replace />} />
              <Route path="/login" element={<Login />} />
              <Route path="/admin/login" element={<AdminLogin />} />

              {/* Admin Routes */}
              <Route element={<ProtectedRoute allowedRoles={['Admin']} />}>
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<AdminDashboard />} />
                  <Route path="lotteries" element={<AdminLotteries />} />
                  <Route path="risk" element={<AdminRisk />} />
                  <Route path="results" element={<AdminResults />} />
                  <Route path="forecasts" element={<ForecastsView />} />
                  <Route path="users" element={<AdminUsers />} />
                  <Route path="tickets" element={<AdminTickets />} />
                  <Route path="reports" element={<AdminReports />} />
                  <Route path="manual-sale" element={<AdminManualSale />} />
                  <Route path="settings" element={<AdminSettings />} />
                </Route>
              </Route>

              {/* Vendor Routes */}
              <Route element={<ProtectedRoute allowedRoles={['Vendedor', 'Admin']} />}>
                <Route path="/vendor" element={<VendorLayout />}>
                  <Route path="pos" element={<VendorPOS />} />
                  <Route path="palets" element={<PaletPOS />} />
                  <Route path="granjita" element={<GranjitaPOS />} />
                  <Route path="printer" element={<LinkPrinter />} />
                  <Route path="sales" element={<VendorSales />} />
                  <Route path="close" element={<CashClose />} />
                  <Route path="past-draws" element={<VendorPastDraws />} />
                  
                  {/* Legacy fallbacks just in case */}
                  <Route path="results" element={<VendorResults />} />
                  <Route path="forecasts" element={<ForecastsView />} />
                  <Route path="tickets" element={<VendorTickets />} />
                </Route>
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </div>
    </>
  );
}

export default App;
