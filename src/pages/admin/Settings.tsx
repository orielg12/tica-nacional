import { useState } from 'react';
import { supabase } from '../../utils/supabase';
import { getLocalISODate, getStartOfDayUTC, getEndOfDayUTC } from '../../utils/dateUtils';
import { useStore } from '../../store/useStore';
import { useNavigate } from 'react-router-dom';
import { Settings as SettingsIcon, Save, Shield, Receipt, Briefcase, Sparkles } from 'lucide-react';

export default function AdminSettings() {
  const store = useStore();
  const navigate = useNavigate();
  
  // Encontrar el admin actual (ID 0 por defecto)
  const adminUser = store.users.find(u => u.role === 'Admin');

  // Estados locales para los formularios
  const [adminUsername, setAdminUsername] = useState(adminUser?.username || '');
  const [adminPassword, setAdminPassword] = useState(adminUser?.password || '');
  

  
  const [ticketHeader, setTicketHeader] = useState(store.ticketHeader || '');
  const [ticketFooter, setTicketFooter] = useState(store.ticketFooter || '');
  const [cancelGraceMins, setCancelGraceMins] = useState((store.cancelGraceMinutes ?? 10).toString()); // used below

  const [wipeDate, setWipeDate] = useState(getLocalISODate());
  const [wipePassword, setWipePassword] = useState('');
  const [isWiping, setIsWiping] = useState(false);

  const [partnerActive, setPartnerActive] = useState(store.partnerModeActive || false);
  const [partnerCap, setPartnerCap] = useState((store.partnerCapital || 7000).toString());
  const [partnerSplitPct, setPartnerSplitPct] = useState((store.partnerSplit || 70).toString());
  const [partnerReinvestPct, setPartnerReinvestPct] = useState((store.partnerReinvestPct || 0).toString());
  const [enableForecasts, setEnableForecasts] = useState(store.enableVendorForecasts || false);

  const handleSaveSecurity = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminUsername || !adminPassword) {
      alert("El usuario y contraseña no pueden estar vacíos.");
      return;
    }
    
    if (adminUser) {
      store.editUser(adminUser.id, adminUser.name, adminUser.commission, adminUser.status, adminUsername, adminPassword, adminUser.saleModeAccess);
      alert("Credenciales actualizadas. Por seguridad, se cerrará tu sesión.");
      store.logout();
      navigate('/admin/login');
    }
  };


  const handleSaveTickets = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketHeader || !ticketFooter) {
       alert("El encabezado y pie de página son obligatorios.");
       return;
    }
    const mins = parseInt(cancelGraceMins);
    store.updateTicketConfig(ticketHeader, ticketFooter);
    store.setCancelGraceMinutes(isNaN(mins) ? 10 : mins);
    alert("Configuración de ticket y anulación actualizada correctamente.");
  };

  const handleSavePartner = (e: React.FormEvent) => {
    e.preventDefault();
    const cap = parseFloat(partnerCap);
    const split = parseFloat(partnerSplitPct);
    const reinvest = parseFloat(partnerReinvestPct);
    
    if (isNaN(cap) || cap < 0 || isNaN(split) || split < 0 || split > 100 || isNaN(reinvest) || reinvest < 0 || reinvest > 100) {
      alert("Valores numéricos inválidos para el módulo de socios.");
      return;
    }
    
    if (split + reinvest > 100) {
      alert("La suma del % del socio y la reinversión no puede superar el 100%.");
      return;
    }

    store.updatePartnerConfig(partnerActive, cap, split, reinvest);
    alert("Configuración de socios y reinversión actualizada.");
  };

  const handleSaveForecasts = (e: React.FormEvent) => {
    e.preventDefault();
    store.toggleVendorForecasts(enableForecasts);
    alert("Configuración de Pronósticos actualizada.");
  };

  const handleWipeData = async (e: React.FormEvent) => {
     e.preventDefault();
     if (wipePassword !== '0000') {
        alert("Clave de seguridad incorrecta. Acceso denegado.");
        return;
     }

     if (!wipeDate) { alert('Selecciona una fecha'); return; }

     if (!window.confirm(`¿Estás SEGURO de eliminar absolutamente todas las VENTAS y PREMIOS del día ${wipeDate}?\n\nEsto dejará la banca del día en $0.00 para pruebas. ESTO NO SE PUEDE DESHACER.`)) return;

     setIsWiping(true);
     try {
       // Eliminar pagos del día PRIMERO para evitar violar la Foreign Key constraint de PostgreSQL
       const { error: pErr } = await supabase.from('payouts')
         .delete()
         .gte('created_at', getStartOfDayUTC(wipeDate))
         .lte('created_at', getEndOfDayUTC(wipeDate));

       // Eliminar tickets de la fecha LUEGO. Por cascade se elimina ticket_numbers y covers.
       const { error: tErr } = await supabase.from('tickets')
         .delete()
         .gte('created_at', getStartOfDayUTC(wipeDate))
         .lte('created_at', getEndOfDayUTC(wipeDate));

       if (tErr || pErr) {
          alert('Hubo un error borrando datos. Verifica que tengas conexión a internet.');
          console.error(tErr, pErr);
       } else {
          alert(`La banca ha sido RESETEADA con éxito a $0.00 para la fecha: ${wipeDate}.`);
          setWipePassword('');
       }
     } catch(err) {
       console.error("Wipe error", err);
     } finally {
       setIsWiping(false);
     }
  };

  return (
    <div style={{ padding: '2rem', backgroundColor: '#f4f7f6', minHeight: '100%', color: '#333' }}>
      
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', padding: '1rem 1.5rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '1.5rem' }}>
         <div>
           <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#17233D' }}>Configuración del Sistema</h2>
           <span style={{ fontSize: '0.85rem', color: '#6c757d' }}>Parámetros globales y seguridad</span>
         </div>
         <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <SettingsIcon size={24} color="#cbd5e1" />
         </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        
        {/* MODULO 1: SEGURIDAD (ADMIN PASSWORD) */}
        <div style={{ backgroundColor: '#fff', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid #eee', paddingBottom: '0.5rem' }}>
             <Shield size={20} color="#3399ff" />
             <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#17233D' }}>Seguridad de Acceso</h3>
          </div>
          
          <form onSubmit={handleSaveSecurity} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
             <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: '#6c757d', marginBottom: '0.3rem' }}>Usuario Maestro</label>
                <input 
                  type="text" 
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  style={{ width: '100%', padding: '0.8rem', borderRadius: '6px', border: '1px solid #ced4da', fontSize: '0.9rem' }}
                />
             </div>
             <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: '#6c757d', marginBottom: '0.3rem' }}>Nueva Contraseña</label>
                <input 
                  type="text" 
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  style={{ width: '100%', padding: '0.8rem', borderRadius: '6px', border: '1px solid #ced4da', fontSize: '0.9rem', fontFamily: 'monospace' }}
                />
             </div>
             <button type="submit" style={{ backgroundColor: '#17233D', color: '#fff', padding: '0.8rem', borderRadius: '6px', border: 'none', fontWeight: 'bold', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginTop: '0.5rem' }}>
               <Save size={16} /> Cambiar Clave
             </button>
          </form>
        </div>

        {/* MODULO 2: IMPRESION Y TICKETS */}
        <div style={{ backgroundColor: '#fff', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid #eee', paddingBottom: '0.5rem' }}>
             <Receipt size={20} color="#3399ff" />
             <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#17233D' }}>Personalización Impresora</h3>
          </div>
          
          <form onSubmit={handleSaveTickets} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
             <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: '#6c757d', marginBottom: '0.3rem' }}>Encabezado del Ticket</label>
                <input 
                  type="text" 
                  value={ticketHeader}
                  onChange={(e) => setTicketHeader(e.target.value)}
                  placeholder="E.j. BANCA EL SUERTE"
                  style={{ width: '100%', padding: '0.8rem', borderRadius: '6px', border: '1px solid #ced4da', fontSize: '0.9rem' }}
                />
             </div>
             <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: '#6c757d', marginBottom: '0.3rem' }}>Pie del Ticket (Leyenda Inferior)</label>
                <input 
                  type="text" 
                  value={ticketFooter}
                  onChange={(e) => setTicketFooter(e.target.value)}
                  placeholder="Revise su ticket antes de salir..."
                  style={{ width: '100%', padding: '0.8rem', borderRadius: '6px', border: '1px solid #ced4da', fontSize: '0.9rem' }}
                />
             </div>
             <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: '#6c757d', marginBottom: '0.3rem' }}>Grace Minutes (Cancelación)</label>
              <input
                type="number"
                min="0"
                value={cancelGraceMins}
                onChange={(e) => setCancelGraceMins(e.target.value)}
                style={{ width: '100%', padding: '0.8rem', borderRadius: '6px', border: '1px solid #ced4da', fontSize: '0.9rem' }}
              />
            </div>
             <button type="submit" style={{ backgroundColor: '#17233D', color: '#fff', padding: '0.8rem', borderRadius: '6px', border: 'none', fontWeight: 'bold', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginTop: '0.5rem' }}>
               <Save size={16} /> Guardar Textos
             </button>
          </form>
        </div>



        {/* MODULO: PRONÓSTICOS / PIRÁMIDES */}
        <div style={{ backgroundColor: '#fff', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid #eee', paddingBottom: '0.5rem' }}>
             <Sparkles size={20} color="#f59e0b" />
             <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#17233D' }}>Pirámides y Pronósticos</h3>
          </div>
          
          <form onSubmit={handleSaveForecasts} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
             <p style={{ fontSize: '0.85rem', color: '#6c757d', margin: 0 }}>
               Controla quién puede ver la herramienta de números sugeridos (Pirámide de la suerte, Números calientes y fríos).
             </p>
             <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 'bold' }}>
                <input 
                  type="checkbox" 
                  checked={enableForecasts}
                  onChange={(e) => setEnableForecasts(e.target.checked)}
                />
                Habilitar vista a los Vendedores
             </label>
             <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '-0.5rem' }}>
               Si se desactiva, solo los administradores podrán ver la sección de pronósticos.
             </p>
             <button type="submit" style={{ backgroundColor: '#17233D', color: '#fff', padding: '0.8rem', borderRadius: '6px', border: 'none', fontWeight: 'bold', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginTop: 'auto' }}>
               <Save size={16} /> Guardar Ajustes
             </button>
          </form>
        </div>

        {/* MODULO 4: SOCIOS / INVERSIONISTAS */}
        <div style={{ backgroundColor: '#fff', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid #eee', paddingBottom: '0.5rem' }}>
             <Briefcase size={20} color="#8b5cf6" />
             <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#17233D' }}>Módulo de Socios</h3>
          </div>
          
          <form onSubmit={handleSavePartner} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
             <p style={{ fontSize: '0.85rem', color: '#6c757d', margin: 0 }}>
               Calcula divisiones de ganancias netas entre tú y un socio capitalista.
             </p>
             <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 'bold' }}>
                <input 
                  type="checkbox" 
                  checked={partnerActive}
                  onChange={(e) => setPartnerActive(e.target.checked)}
                />
                Activar Módulo de División (Socios)
             </label>
             <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: '#6c757d', marginBottom: '0.3rem' }}>Capital de Respaldo ($)</label>
                <input 
                  type="number" 
                  step="0.01"
                  value={partnerCap}
                  onChange={(e) => setPartnerCap(e.target.value)}
                  disabled={!partnerActive}
                  style={{ width: '100%', padding: '0.8rem', borderRadius: '6px', border: '1px solid #ced4da', fontSize: '0.9rem' }}
                />
             </div>
             <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: '#6c757d', marginBottom: '0.3rem' }}>% de Ganancia para el Socio</label>
                <input 
                  type="number" 
                  step="1"
                  value={partnerSplitPct}
                  onChange={(e) => setPartnerSplitPct(e.target.value)}
                  disabled={!partnerActive}
                  style={{ width: '100%', padding: '0.8rem', borderRadius: '6px', border: '1px solid #ced4da', fontSize: '0.9rem' }}
                />
             </div>
             <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: '#10b981', marginBottom: '0.3rem' }}>% para Crecer Banca (Reinversión)</label>
                <input 
                  type="number" 
                  step="1"
                  value={partnerReinvestPct}
                  onChange={(e) => setPartnerReinvestPct(e.target.value)}
                  disabled={!partnerActive}
                  style={{ width: '100%', padding: '0.8rem', borderRadius: '6px', border: '1px solid #10b981', fontSize: '0.9rem', backgroundColor: '#ecfdf5', fontWeight: 'bold' }}
                />
             </div>
             <button type="submit" style={{ backgroundColor: '#17233D', color: '#fff', padding: '0.8rem', borderRadius: '6px', border: 'none', fontWeight: 'bold', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginTop: 'auto' }}>
               <Save size={16} /> Guardar Socios
             </button>
          </form>
        </div>

        {/* MODULO 5: LIMPIEZA DE DATOS (Zona Peligro) */}
        <div style={{ backgroundColor: '#fff', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', border: '1px solid #fca5a5' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid #fee2e2', paddingBottom: '0.5rem' }}>
             <Shield size={20} color="#ef4444" />
             <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#b91c1c' }}>Zona de Peligro (Pruebas)</h3>
          </div>
          
          <form onSubmit={handleWipeData} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
             <p style={{ fontSize: '0.85rem', color: '#6c757d', margin: 0 }}>
               Limpia todas las Ventas, Respaldos y Premios de una fecha para simular o testear un día limpio.
             </p>
             <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: '#6c757d', marginBottom: '0.3rem' }}>Día a Limpiar (a $0.00)</label>
                <input 
                  type="date"
                  value={wipeDate}
                  onChange={(e) => setWipeDate(e.target.value)}
                  style={{ width: '100%', padding: '0.8rem', borderRadius: '6px', border: '1px solid #ced4da', fontSize: '0.9rem' }}
                />
             </div>
             <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: '#6c757d', marginBottom: '0.3rem' }}>Clave de Seguridad Segreta</label>
                <input 
                  type="password" 
                  value={wipePassword}
                  onChange={(e) => setWipePassword(e.target.value)}
                  placeholder="****"
                  style={{ width: '100%', padding: '0.8rem', borderRadius: '6px', border: '1px solid #ced4da', fontSize: '0.9rem', fontFamily: 'monospace' }}
                />
             </div>
             <button type="submit" disabled={isWiping} style={{ backgroundColor: '#dc2626', color: '#fff', padding: '0.8rem', borderRadius: '6px', border: 'none', fontWeight: 'bold', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', cursor: isWiping ? 'not-allowed' : 'pointer', marginTop: 'auto' }}>
               {isWiping ? 'Eliminando BDD...' : 'Resetear Banca a 0.00'}
             </button>
          </form>
        </div>

      </div>
    </div>
  );
}
