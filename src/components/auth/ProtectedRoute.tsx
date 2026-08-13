import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import { useEffect, useState } from 'react';

interface Props {
  allowedRoles?: string[];
}

// Hook que detecta cuando Zustand ya terminó de leer el localStorage
function useStoreHydrated() {
  const [hydrated, setHydrated] = useState(
    // Si ya está hidratado en el momento de montar, no esperar
    useStore.persist.hasHydrated()
  );

  useEffect(() => {
    if (hydrated) return;
    // Suscribirse al evento de hidratación
    const unsub = useStore.persist.onHydrate(() => {});
    const unfinished = useStore.persist.onFinishHydration(() => {
      setHydrated(true);
    });
    // Si ya terminó antes de suscribirse
    if (useStore.persist.hasHydrated()) setHydrated(true);
    return () => {
      unsub();
      unfinished();
    };
  }, []);

  return hydrated;
}

export default function ProtectedRoute({ allowedRoles }: Props) {
  const store = useStore();
  const location = useLocation();
  const hydrated = useStoreHydrated();

  // Mientras Zustand no haya terminado de leer la sesión del localStorage,
  // mostrar una pantalla de carga simple para evitar el parpadeo del login.
  if (!hydrated) {
    return (
      <div style={{
        height: '100dvh',
        width: '100vw',
        backgroundColor: '#0f172a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: '1rem'
      }}>
        <div style={{
          width: '44px',
          height: '44px',
          border: '4px solid #134e4a',
          borderTopColor: '#14b8a6',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite'
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <span style={{ color: '#14b8a6', fontWeight: 'bold', letterSpacing: '0.2em', fontSize: '0.8rem' }}>GO</span>
      </div>
    );
  }

  if (!store.currentUser) {
    if (location.pathname.startsWith('/admin')) {
       return <Navigate to="/admin/login" replace />;
    }
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(store.currentUser.role)) {
    // Si es un vendedor y trata de entrar al admin
    if (store.currentUser.role === 'Vendedor') {
       return <Navigate to="/vendor/pos" replace />;
    }
    // Si es admin y no está en su rol
    return <Navigate to="/admin" replace />;
  }

  return <Outlet />;
}
