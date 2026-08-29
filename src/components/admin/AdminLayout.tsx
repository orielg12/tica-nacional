import { Outlet, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Trophy, Users, Building, Calendar, Settings, FileText, ChevronRight, LogOut, Ticket, Bell, Menu, X, Sparkles, Plus } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '../../utils/supabase';

export default function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;
  
  const [alerts, setAlerts] = useState<{id: number, message: string}[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Cerrar sidebar al cambiar de ruta en móvil
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    // Subscribe to covers inserts for Live Alerts
    const channel = supabase.channel('covers-alerts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'covers' }, (payload) => {
         const newCover = payload.new as any;
         try {
           const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
           audio.play().catch(() => {});
         } catch(e) {}
         
         const msg = `Exceso de $${parseFloat(newCover.excess_amount).toFixed(2)} enviado a respaldo.`;
         const id = Date.now();
         setAlerts(prev => [...prev, { id, message: msg }]);
         
         setTimeout(() => {
            setAlerts(prev => prev.filter(a => a.id !== id));
         }, 5000);
      })
      .subscribe();

    // Sincronización automática de resultados en segundo plano cada 60 segundos
    const syncInterval = setInterval(() => {
      import('../../services/autoResultsService').then(mod => {
        mod.syncAutoResults().catch(err => console.warn('Auto sync error:', err));
      });
    }, 60000);

    // Ejecución inicial al abrir el panel admin
    import('../../services/autoResultsService').then(mod => {
      mod.syncAutoResults().catch(err => console.warn('Initial auto sync error:', err));
    });

    return () => {
      supabase.removeChannel(channel);
      clearInterval(syncInterval);
    };
  }, []);

  const store = useStore();
  const currentUser = store.currentUser;
  const isSuperAdmin = !currentUser?.isSubAdmin;
  const canManageLotteries = isSuperAdmin || currentUser?.allowManageLotteries === true;

  const navLinks = [
    { group: 'PRINCIPAL', items: [
      { to: '/admin', label: 'Dashboard', icon: <LayoutDashboard size={18} />, exact: true },
      { to: '/admin/results', label: 'Resultados', icon: <Trophy size={18} /> },
      { to: '/admin/forecasts', label: 'Pronósticos', icon: <Sparkles size={18} /> },
    ]},
    { group: 'GESTIÓN', items: [
      { to: '/admin/tickets', label: 'Control de Tickets', icon: <Ticket size={18} /> },
      { to: '/admin/users', label: isSuperAdmin ? 'Usuarios / Sub-Admins' : 'Mis Vendedores', icon: <Users size={18} /> },
      { to: '/admin/risk', label: 'Bancas (Respaldo)', icon: <Building size={18} /> },
      ...(canManageLotteries ? [{ to: '/admin/lotteries', label: 'Sorteos', icon: <Calendar size={18} /> }] : []),
    ]},
    { group: 'FINANCIERO', items: [
      { to: '/admin/reports', label: 'Reportes', icon: <FileText size={18} /> },
      { to: '/admin/manual-sale', label: 'Venta Manual', icon: <Plus size={18} /> },
    ]},
    ...(isSuperAdmin ? [{
      group: 'SISTEMA', items: [
        { to: '/admin/settings', label: 'Configuración', icon: <Settings size={18} /> },
      ]
    }] : []),
  ];

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div style={{ padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <h2 style={{ fontSize: '1.1rem', margin: 0, color: '#3399ff', fontWeight: 800 }}>GO</h2>
            <span style={{ 
              fontSize: '0.65rem', 
              backgroundColor: isSuperAdmin ? 'rgba(245, 158, 11, 0.2)' : 'rgba(3, 105, 161, 0.2)', 
              color: isSuperAdmin ? '#f59e0b' : '#38bdf8', 
              padding: '0.15rem 0.45rem', 
              borderRadius: '4px', 
              fontWeight: 'bold' 
            }}>
              {isSuperAdmin ? '👑 MADRE' : '🏢 SUB-ADMIN'}
            </span>
          </div>
          <span style={{ fontSize: '0.7rem', color: '#8b9bb4' }}>
            {currentUser?.username ? `@${currentUser.username}` : 'Panel Admin'}
          </span>
        </div>
        {/* Botón cerrar en móvil */}
        <button 
          onClick={() => setSidebarOpen(false)}
          style={{ background: 'transparent', border: 'none', color: '#8b9bb4', cursor: 'pointer', display: 'none' }}
          className="sidebar-close-btn"
        >
          <X size={20} />
        </button>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '1rem 0', overflowY: 'auto' }}>
        {navLinks.map(group => (
          <div key={group.group}>
            <div style={{ padding: '0 1.5rem', fontSize: '0.65rem', color: '#5b6b84', fontWeight: 'bold', letterSpacing: '1px', margin: '1rem 0 0.5rem 0' }}>
              {group.group}
            </div>
            {group.items.map(item => {
              const isActive = item.exact ? path === item.to : path === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className="admin-nav-link"
                  style={getNavStyle(isActive)}
                >
                  {item.icon}
                  <span style={{ flex: 1 }}>{item.label}</span>
                  <ChevronRight size={14} style={{ opacity: 0.4 }} />
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
         <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
           <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: isSuperAdmin ? '#3399ff' : '#0369a1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
             {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : 'A'}
           </div>
           <div>
             <div style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>{currentUser?.name || 'Administrador'}</div>
             <div style={{ fontSize: '0.7rem', color: '#8b9bb4' }}>{isSuperAdmin ? 'Admin Madre' : `Sub-Admin (@${currentUser?.username})`}</div>
           </div>
         </div>
         <button 
           onClick={() => {
              useStore.getState().logout();
              navigate('/login', { replace: true });
           }}
           style={{ background: 'transparent', border: 'none', color: '#dc3545', cursor: 'pointer', padding: '0.5rem' }}
         >
           <LogOut size={18} />
         </button>
      </div>
    </>
  );

  return (
    <>
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideInLeft {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
        .admin-sidebar-mobile {
          animation: slideInLeft 0.25s ease-out;
        }
        .admin-layout-root {
          height: 100vh;
          height: 100dvh;
        }
        @media (max-width: 768px) {
          .admin-sidebar-desktop { display: none !important; }
          .admin-topbar { display: flex !important; }
          .sidebar-close-btn { display: flex !important; }
        }
        @media (min-width: 769px) {
          .admin-sidebar-mobile-overlay { display: none !important; }
          .admin-topbar { display: none !important; }
        }
        .admin-nav-link:hover {
          background-color: rgba(255,255,255,0.05);
          color: #fff;
        }

        /* ── RESPONSIVE GLOBAL PARA TODAS LAS PÁGINAS DEL ADMIN ── */
        @media (max-width: 768px) {
          main {
            padding: 0 !important;
            padding-bottom: 2rem !important;
          }
          /* Asegurar que las tablas tengan scroll horizontal suave sin romper el layout */
          main table {
            display: table !important;
            min-width: 100% !important;
          }
        }
      `}</style>


      <div className="admin-layout-root" style={{ display: 'flex', width: '100vw', backgroundColor: '#f0f4f8', color: '#333', overflow: 'hidden' }}>
        
        {/* ── SIDEBAR DESKTOP ── */}
        <aside className="admin-sidebar-desktop" style={{
          width: '260px',
          minWidth: '260px',
          backgroundColor: '#17233D',
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '2px 0 10px rgba(0,0,0,0.1)',
          zIndex: 10
        }}>
          <SidebarContent />
        </aside>

        {/* ── SIDEBAR MÓVIL (OVERLAY) ── */}
        {sidebarOpen && (
          <div
            className="admin-sidebar-mobile-overlay"
            style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex' }}
          >
            {/* Fondo oscuro */}
            <div
              onClick={() => setSidebarOpen(false)}
              style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }}
            />
            {/* Panel lateral */}
            <aside
              className="admin-sidebar-mobile"
              style={{
                position: 'relative',
                width: '280px',
                backgroundColor: '#17233D',
                color: '#fff',
                display: 'flex',
                flexDirection: 'column',
                zIndex: 1,
                boxShadow: '4px 0 20px rgba(0,0,0,0.4)'
              }}
            >
              <SidebarContent />
            </aside>
          </div>
        )}

        {/* ── CONTENIDO PRINCIPAL ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          
          {/* Top bar móvil */}
          <header
            className="admin-topbar"
            style={{
              display: 'none',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.75rem 1rem',
              backgroundColor: '#17233D',
              color: '#fff',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              zIndex: 50,
              flexShrink: 0
            }}
          >
            <button
              onClick={() => setSidebarOpen(true)}
              style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: '0.4rem' }}
            >
              <Menu size={24} />
            </button>
            <h2 style={{ margin: 0, fontSize: '1rem', color: '#3399ff', fontWeight: 800 }}>GO</h2>
            <button
              onClick={() => {
                useStore.getState().logout();
                navigate('/login', { replace: true });
              }}
              style={{ background: 'transparent', border: 'none', color: '#dc3545', cursor: 'pointer', padding: '0.4rem' }}
            >
              <LogOut size={20} />
            </button>
          </header>

          {/* Main Content */}
          <main style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', position: 'relative' }}>
            {/* Notificaciones Toast */}
            <div style={{ position: 'fixed', top: '70px', right: '20px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '10px' }}>
               {alerts.map(alert => (
                 <div key={alert.id} style={{
                    backgroundColor: '#ef4444',
                    color: 'white',
                    padding: '12px 20px',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    fontWeight: 'bold',
                    animation: 'slideIn 0.3s ease-out'
                 }}>
                    <Bell size={20} />
                    {alert.message}
                 </div>
               ))}
            </div>
            <Outlet />
          </main>
        </div>
      </div>
    </>
  );
}

// Estilos dinámicos para el hover / ruta activa
function getNavStyle(isActive: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '0.8rem',
    padding: '0.7rem 1.5rem',
    color: isActive ? '#fff' : '#8b9bb4',
    backgroundColor: isActive ? 'rgba(255,255,255,0.05)' : 'transparent',
    borderLeft: isActive ? '3px solid #3399ff' : '3px solid transparent',
    textDecoration: 'none',
    fontSize: '0.85rem',
    transition: 'all 0.2s',
    fontWeight: isActive ? '600' : 'normal'
  };
}
