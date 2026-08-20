import { useState, useEffect, useMemo } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Menu, X, ShoppingCart, List, LogOut, Trophy, CalendarDays, Banknote, Sparkles, Trash2, Sun, Moon } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { ThemeContext } from '../../context/ThemeContext';

export default function VendorLayout() {
  const store = useStore();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    // Check localStorage first, then prefer system preference
    const saved = localStorage.getItem('go-theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const navigate = useNavigate();
  const location = useLocation();

  const toggleDrawer = () => setIsDrawerOpen(!isDrawerOpen);
  const closeDrawer = () => setIsDrawerOpen(false);

  // Apply theme to document root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
    document.documentElement.style.colorScheme = isDarkMode ? 'dark' : 'light';
    if (isDarkMode) {
      document.body.classList.add('dark');
      document.body.classList.remove('light');
    } else {
      document.body.classList.add('light');
      document.body.classList.remove('dark');
    }
    localStorage.setItem('go-theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  useEffect(() => {
    closeDrawer();
  }, [location.pathname]);

  useEffect(() => {
    store.fetchUsers();
    const interval = setInterval(() => {
      store.fetchUsers();
      store.fetchLotteries();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!store.currentUser) {
      navigate('/login', { replace: true });
    }
  }, [store.currentUser, navigate]);

  const menuItems = [
    { name: 'Punto de Venta', icon: ShoppingCart, path: '/vendor/pos' },
    ...(store.currentUser?.allowPalet !== false ? [{ name: 'Venta de Palets', icon: ShoppingCart, path: '/vendor/palets' }] : []),
    ...(store.currentUser?.allowGranjita !== false ? [{ name: 'La Granjita 🐓', icon: ShoppingCart, path: '/vendor/granjita' }] : []),
    { name: 'Mis Tickets', icon: List, path: '/vendor/tickets' },
    { name: 'Agregar Impresora', icon: List, path: '/vendor/printer' },
    { name: 'Premios', icon: Trophy, path: '/vendor/results' },
    ...(store.enableVendorForecasts ? [{ name: 'Pronósticos', icon: Sparkles, path: '/vendor/forecasts' }] : []),
    { name: 'Consulta Sorteos', icon: CalendarDays, path: '/vendor/past-draws' },
    { name: 'Reporte de Ventas', icon: CalendarDays, path: '/vendor/sales' },
    { name: 'Cierre de Caja (Z)', icon: Banknote, path: '/vendor/close' },
  ];

  const activeCart = useMemo(() => {
    if (location.pathname === '/vendor/granjita') {
      return store.cart.filter(i => i.isGranjita);
    }
    if (location.pathname === '/vendor/palets') {
      return store.cart.filter(i => i.isPalet);
    }
    if (location.pathname === '/vendor/pos') {
      return store.cart.filter(i => !i.isGranjita && !i.isPalet);
    }
    return store.cart;
  }, [store.cart, location.pathname]);

  const cartTotalDollar = useMemo(() => {
    return activeCart.reduce((sum, item) => {
      if (item.isPalet) {
        return sum + (item.amount * (item.lotteries?.length || 1));
      }
      return sum + (item.amount * (item.lotteries?.length || 1) * store.saleMode);
    }, 0);
  }, [activeCart, store.saleMode]);

  const hasCart = activeCart.length > 0;
  const isOnPOS = location.pathname === '/vendor/pos' || location.pathname === '/vendor/palets' || location.pathname === '/vendor/granjita';

  const handleClearCurrentCart = () => {
    if (window.confirm('¿Vaciar el carrito actual?')) {
      activeCart.forEach(item => store.removeNumber(item.id));
    }
  };

  // tc() helper: pick a class based on current theme
  const tc = (darkClass: string, lightClass: string) => isDarkMode ? darkClass : lightClass;
  // Header teal sólido en modo claro (franja de color profesional)
  const headerBg   = tc('bg-slate-900 border-slate-800', 'bg-[#0d9488] border-[#0a7a6f]');
  const headerText = tc('text-teal-400', 'text-white');
  // Drawer: oscuro en dark, blanco limpio en light
  const drawerBg   = tc('bg-slate-900 border-slate-800', 'bg-white border-r border-slate-200');

  // Memoised context value to avoid unnecessary re-renders
  const themeCtx = useMemo(() => ({ isDarkMode, tc }), [isDarkMode]);

  return (
    <ThemeContext.Provider value={themeCtx}>
    <div className={`flex flex-col h-[100dvh] w-full overflow-hidden ${tc('bg-slate-950 text-white', 'bg-white text-slate-900')}`}>
      
      {/* HEADER BAR */}
      <header className={`flex-none ${headerBg} border-b flex items-center justify-between px-3.5 z-20`} style={{ paddingTop: 'max(env(safe-area-inset-top), 40px)', height: 'calc(60px + max(env(safe-area-inset-top), 40px))' }}>
        
        {/* LADO IZQUIERDO: Menu GO + Botón MODO separado */}
        <div className="flex items-center gap-2.5 min-w-0">
          <button onClick={toggleDrawer} className={`flex items-center gap-1 p-1 -ml-1 ${headerText} active:bg-slate-800/10 rounded-lg transition-colors`}>
            <Menu size={26} />
            <span className="font-bold text-base tracking-wider">GO</span>
          </button>

          {/* BOTÓN MODO: Limpio, grande y separado para evitar toques accidentales */}
          <button
            onClick={() => {
              const currentRounded = Math.round(store.saleMode * 100);
              const newMode = currentRounded === 20 ? 0.25 : 0.20;
              store.setSaleMode(newMode);
            }}
            className={`px-2.5 py-1 text-xs font-black tracking-wider border rounded shadow-sm transition-all active:scale-95 whitespace-nowrap ${
              Math.round(store.saleMode * 100) === 25
                ? 'bg-purple-900 border-purple-500 text-purple-100'
                : isDarkMode
                  ? 'bg-slate-800 border-slate-600 text-teal-400'
                  : 'bg-[#f0fdfa] border-[#99f6e4] text-[#0d9488] shadow-sm'
            }`}
            title="Toca para cambiar modo de venta"
          >
            MODO: ${store.saleMode.toFixed(2)}
          </button>
        </div>

        {/* CENTRO: MONTO TOTAL GRANDE - solo visible en POS/Palets cuando hay carrito */}
        <div className="flex items-center justify-center px-1 flex-1">
          {isOnPOS && hasCart ? (
            <div className={`flex items-center gap-2 px-4 py-1.5 rounded-lg ${isDarkMode ? 'bg-emerald-950 border-2 border-emerald-600/70' : 'bg-[#f0fdfa] border-2 border-[#99f6e4] shadow-sm'}`}>
              <span className={`text-[11px] font-bold uppercase tracking-widest ${isDarkMode ? 'text-emerald-400' : 'text-[#0d9488]'}`}>TOTAL</span>
              <span className={`text-3xl font-black font-mono tracking-tight ${isDarkMode ? 'text-emerald-300' : 'text-[#0d9488]'}`}>${cartTotalDollar.toFixed(2)}</span>
            </div>
          ) : null}
        </div>

        {/* LADO DERECHO: VACIAR CARRITO (solo en POS con carrito) */}
        <div className="flex items-center gap-2">
          {isOnPOS && hasCart ? (
            <button
              onClick={handleClearCurrentCart}
              className={`flex items-center gap-1 px-2.5 py-1.5 border transition-colors active:scale-95 text-xs font-bold uppercase tracking-wider ${isDarkMode ? 'text-red-400 active:bg-red-900/40 bg-red-950/70 border-red-700/60' : 'text-red-600 active:bg-red-100 bg-red-50 border-red-200 rounded-lg'}`}
              title="Vaciar Carrito"
            >
              <Trash2 size={16} />
              <span className="text-[11px] font-black">VACIAR</span>
            </button>
          ) : (
            <div className="w-8"></div>
          )}
        </div>

      </header>

      {/* DRAWER OVERLAY */}
      {isDrawerOpen && (
        <div 
          className="fixed inset-0 bg-black/70 z-30 transition-opacity backdrop-blur-sm"
          onClick={closeDrawer}
        />
      )}

      {/* DRAWER PANEL */}
      <div 
        className={`fixed top-0 left-0 h-full w-[280px] ${drawerBg} border-r z-40 transform transition-transform duration-300 ease-in-out flex flex-col ${
          isDrawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className={`p-6 flex justify-between items-center border-b ${isDarkMode ? 'border-slate-800' : 'border-gray-200'}`} style={{ paddingTop: 'max(env(safe-area-inset-top), 40px)' }}>
          <h2 className={`text-xl font-bold tracking-widest ${isDarkMode ? 'text-teal-400' : 'text-teal-600'}`}>MENÚ</h2>
          <button onClick={closeDrawer} className={`${isDarkMode ? 'text-gray-400 active:text-white' : 'text-gray-500 active:text-gray-900'} p-2`}>
            <X size={24} />
          </button>
        </div>

        {/* MODO VENTA - dentro del drawer */}
        {(store.currentUser?.saleModeAccess === 'Ambos' || !store.currentUser?.saleModeAccess) && (
          <div className={`px-6 py-3 border-b ${isDarkMode ? 'border-slate-800' : 'border-gray-200'}`}>
            <p className={`text-xs uppercase tracking-wider mb-2 font-bold ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Modo de Venta</p>
            <button
              onClick={() => {
                const currentRounded = Math.round(store.saleMode * 100);
                const newMode = currentRounded === 20 ? 0.25 : 0.20;
                store.setSaleMode(newMode);
              }}
              className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg font-bold text-sm border transition-colors ${
                Math.round(store.saleMode * 100) === 25
                  ? 'bg-purple-900 border-purple-500 text-purple-200 shadow-[0_0_10px_rgba(168,85,247,0.3)]'
                  : isDarkMode
                    ? 'bg-slate-800 border-gray-600 text-teal-400'
                    : 'bg-gray-100 border-gray-300 text-teal-600'
              }`}
            >
              <span>MODO: ${store.saleMode.toFixed(2)}</span>
              <span className={`text-xs px-2 py-0.5 rounded font-black ${Math.round(store.saleMode * 100) === 25 ? 'bg-purple-700 text-purple-100' : 'bg-teal-900/50 text-teal-300'}`}>
                {Math.round(store.saleMode * 100) === 25 ? 'ACTIVO' : 'CAMBIAR'}
              </span>
            </button>
          </div>
        )}

        <div className="flex-1 py-4 flex flex-col gap-5 overflow-y-auto no-scrollbar">
          {menuItems.map((item, index) => {
            const isActive = location.pathname === item.path;
            return (
              <button
                key={index}
                onClick={() => {
                   navigate(item.path);
                }}
                className={`w-full flex items-center gap-5 px-6 py-3 rounded-r-full transition-colors border-l-4 ${
                  isActive 
                    ? isDarkMode 
                      ? 'border-teal-500 bg-teal-900/40 text-teal-300 font-black shadow-lg shadow-teal-900/20' 
                      : 'border-teal-600 bg-teal-50 text-teal-800 font-black shadow-sm'
                    : isDarkMode
                      ? 'border-transparent text-gray-300 active:bg-slate-800'
                      : 'border-transparent text-gray-700 active:bg-gray-100'
                }`}
              >
                <item.icon size={26} className={isActive ? (isDarkMode ? "text-teal-400" : "text-teal-600") : (isDarkMode ? "text-gray-400" : "text-gray-500")} />
                <span className={`text-[1.15rem] leading-tight ${isActive ? 'font-black' : 'font-medium'}`}>
                  {item.name}
                </span>
              </button>
            );
          })}
        </div>
        
        {/* FOOTER DEL DRAWER: Tema + Cerrar Sesión */}
        <div className={`p-4 border-t ${isDarkMode ? 'border-slate-800' : 'border-gray-200'} flex flex-col gap-2`}>
          {/* TOGGLE OSCURO/CLARO */}
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border font-bold text-sm transition-colors ${
              isDarkMode
                ? 'bg-slate-800 border-slate-700 text-yellow-300 active:bg-slate-700'
                : 'bg-yellow-50 border-yellow-200 text-yellow-700 active:bg-yellow-100'
            }`}
          >
            <div className="flex items-center gap-2">
              {isDarkMode ? <Moon size={18} className="text-blue-400" /> : <Sun size={18} className="text-yellow-500" />}
              <span>{isDarkMode ? 'Modo Oscuro' : 'Modo Claro'}</span>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded font-black ${isDarkMode ? 'bg-blue-900/50 text-blue-300' : 'bg-yellow-200 text-yellow-700'}`}>
              {isDarkMode ? '🌙' : '☀️'}
            </span>
          </button>

          <button
            onClick={() => {
              useStore.getState().logout();
              navigate('/login', { replace: true });
            }}
            className={`w-full flex items-center justify-center gap-2 p-3 rounded-lg transition-colors font-bold ${isDarkMode ? 'text-red-400 bg-red-950/30 active:bg-red-900/50' : 'text-red-600 bg-red-50 active:bg-red-100 border border-red-200'}`}
          >
            <LogOut size={20} /> Cerrar Sesión
          </button>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <main className={`flex-1 w-full overflow-hidden relative ${isDarkMode ? 'bg-slate-950' : 'bg-white'}`}>
        <Outlet />
      </main>

    </div>
    </ThemeContext.Provider>
  );
}
