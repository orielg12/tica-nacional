import { useState, useEffect } from 'react';
import { PlusCircle, Search, Edit2, Trash2 } from 'lucide-react';
import { useStore } from '../../store/useStore';

export default function UsersManager() {
  const store = useStore();
  const users = store.users;
  const [loading, setLoading] = useState(false);

  useEffect(() => {
     store.fetchUsers();
  }, []);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | number | null>(null);
  
  // Form states
  const [formData, setFormData] = useState({
    name: '',
    commission: '15',
    username: '',
    password: '',
    status: 'Activo' as 'Activo' | 'Inactivo',
    saleModeAccess: 'Ambos' as '0.20' | '0.25' | 'Ambos',
    allowPalet: true,
    allowGranjita: true
  });

  const handleOpenAdd = () => {
    setEditingId(null);
    setFormData({ name: '', commission: '15', username: '', password: '', status: 'Activo', saleModeAccess: 'Ambos', allowPalet: true, allowGranjita: true });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (id: string | number) => {
    const user = users.find(u => u.id === id);
    if (!user) return;
    setEditingId(id);
    setFormData({
       name: user.name,
       commission: user.commission.toString(),
       username: user.username,
       password: user.password || '',
       status: user.status,
       saleModeAccess: user.saleModeAccess || 'Ambos',
       allowPalet: user.allowPalet !== false,
       allowGranjita: user.allowGranjita !== false
    });
    setIsModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.username) return;

    setLoading(true);

    if (editingId !== null) {
       const success = await store.editUser(
         editingId, 
         formData.name,
         parseInt(formData.commission, 10) || 0, 
         formData.status, 
         formData.username.trim(), 
         formData.password.trim(),
         formData.saleModeAccess,
         formData.allowPalet,
         formData.allowGranjita
       );
       if (!success) alert("Error al conectar con la Nube. ¿Ejecutaste el código de Supabase?");
    } else {
       const success = await store.addUser({
         name: formData.name,
         role: 'Vendedor',
         commission: parseInt(formData.commission, 10) || 0,
         status: formData.status,
         username: formData.username.trim(),
         password: formData.password.trim(),
         saleModeAccess: formData.saleModeAccess,
         allowPalet: formData.allowPalet,
         allowGranjita: formData.allowGranjita
       });
       if (!success) alert("Error guardando el usuario. Por favor verifica que copiaste y pegaste el código SQL en Supabase (O contacta a soporte).");
    }
    
    setLoading(false);
    setIsModalOpen(false);
  };

  const [userToDelete, setUserToDelete] = useState<string | number | null>(null);

  const handleDeleteUser = (id: string | number) => {
    setUserToDelete(id);
  };

  const confirmDelete = async () => {
    if (userToDelete !== null) {
       setLoading(true);
       await store.deleteUser(userToDelete);
       setUserToDelete(null);
       setLoading(false);
    }
  };

  return (
    <div style={{ padding: '2rem', backgroundColor: '#f4f7f6', minHeight: '100%', color: '#333' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', padding: '1rem 1.5rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '1.5rem' }}>
         <div>
           <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#17233D' }}>Gestión de Usuarios</h2>
           <span style={{ fontSize: '0.85rem', color: '#6c757d' }}>Administra vendedores y sus comisiones</span>
         </div>
         <button 
           onClick={handleOpenAdd}
           style={{ backgroundColor: '#3399ff', color: '#fff', padding: '0.6rem 1rem', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem', border: 'none', cursor: 'pointer' }}
         >
           <PlusCircle size={16} /> Añadir Usuario
         </button>
      </div>

      {/* Main Table Area */}
      <div style={{ backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', padding: '1.5rem' }}>
         
         <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
           <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#f8f9fa', padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid #e9ecef', width: '300px' }}>
              <Search size={16} color="#6c757d" style={{ marginRight: '0.5rem' }} />
              <input type="text" placeholder="Buscar usuario..." style={{ border: 'none', backgroundColor: 'transparent', outline: 'none', width: '100%', fontSize: '0.85rem' }} />
           </div>
         </div>

         <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
           <thead>
             <tr style={{ backgroundColor: '#f8f9fa', color: '#495057', textAlign: 'left' }}>
               <th style={{ padding: '0.8rem 1rem', borderBottom: '2px solid #e9ecef' }}>ID</th>
               <th style={{ padding: '0.8rem 1rem', borderBottom: '2px solid #e9ecef' }}>Nombre Completo</th>
               <th style={{ padding: '0.8rem 1rem', borderBottom: '2px solid #e9ecef' }}>Rol</th>
               <th style={{ padding: '0.8rem 1rem', borderBottom: '2px solid #e9ecef' }}>Usuario</th>
               <th style={{ padding: '0.8rem 1rem', borderBottom: '2px solid #e9ecef' }}>Contraseña</th>
               <th style={{ padding: '0.8rem 1rem', borderBottom: '2px solid #e9ecef' }}>% Comisión</th>
               <th style={{ padding: '0.8rem 1rem', borderBottom: '2px solid #e9ecef' }}>Vende A</th>
               <th style={{ padding: '0.8rem 1rem', borderBottom: '2px solid #e9ecef' }}>Palets</th>
               <th style={{ padding: '0.8rem 1rem', borderBottom: '2px solid #e9ecef' }}>Estado</th>
               <th style={{ padding: '0.8rem 1rem', borderBottom: '2px solid #e9ecef', textAlign: 'center' }}>Acciones</th>
             </tr>
           </thead>
           <tbody>
             {users.map(u => (
               <tr key={u.id} style={{ borderBottom: '1px solid #e9ecef' }}>
                 <td style={{ padding: '1rem', color: '#6c757d' }}>#{u.id}</td>
                 <td style={{ padding: '1rem', fontWeight: 600, color: '#17233D' }}>{u.name}</td>
                 <td style={{ padding: '1rem' }}>
                   <span style={{ backgroundColor: '#eef2f7', padding: '0.3rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem', color: '#5b6b84' }}>{u.role}</span>
                 </td>
                 <td style={{ padding: '1rem', fontFamily: 'monospace', fontWeight: 'bold' }}>{u.username}</td>
                <td style={{ padding: '1rem', fontFamily: 'monospace', color: '#dc3545' }}>{u.password || 'N/A'}</td>
                <td style={{ padding: '1rem', fontWeight: 'bold', color: '#28a745' }}>{u.commission}%</td>
                <td style={{ padding: '1rem', fontWeight: 'bold', color: '#6f42c1' }}>{u.saleModeAccess || 'Ambos'}</td>
                 <td style={{ padding: '1rem' }}>
                    <span style={{ 
                      backgroundColor: u.allowPalet !== false ? 'rgba(245, 158, 11, 0.1)' : 'rgba(100, 116, 139, 0.1)', 
                      color: u.allowPalet !== false ? '#d97706' : '#64748b',
                      padding: '0.3rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600
                    }}>
                      {u.allowPalet !== false ? 'Habilitado' : 'Deshabilitado'}
                    </span>
                 </td>
                 <td style={{ padding: '1rem' }}>
                   <span style={{ 
                     backgroundColor: u.status === 'Activo' ? 'rgba(40, 167, 69, 0.1)' : 'rgba(220, 53, 69, 0.1)', 
                     color: u.status === 'Activo' ? '#28a745' : '#dc3545',
                     padding: '0.3rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600
                   }}>
                     {u.status}
                   </span>
                 </td>
                 <td style={{ padding: '1rem', textAlign: 'center' }}>
                   <button onClick={() => handleOpenEdit(u.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#3399ff', marginRight: '0.8rem' }}><Edit2 size={16} /></button>
                   <button onClick={() => handleDeleteUser(u.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#dc3545' }}><Trash2 size={16} /></button>
                 </td>
               </tr>
             ))}
           </tbody>
         </table>

      </div>

      {/* REACT MODAL OVERLAY */}
      {isModalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
           <div style={{ backgroundColor: '#fff', padding: '2rem', borderRadius: '12px', width: '90%', maxWidth: '400px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
              <h3 style={{ margin: '0 0 1.5rem 0', color: '#17233D' }}>{editingId ? 'Editar Vendedor' : 'Nuevo Vendedor'}</h3>
              
              <form onSubmit={handleSaveUser} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                 <div>
                   <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: '#6c757d', marginBottom: '0.3rem' }}>Nombre Empleado (Solo Ref.)</label>
                   <input type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} disabled={editingId !== null} style={{ width: '100%', padding: '0.8rem', borderRadius: '6px', border: '1px solid #ced4da', backgroundColor: editingId ? '#f1f5f9' : '#fff' }} required />
                 </div>
                 
                 <div>
                   <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: '#6c757d', marginBottom: '0.3rem' }}>Usuario de Acceso</label>
                   <input type="text" value={formData.username} onChange={(e) => setFormData({...formData, username: e.target.value})} style={{ width: '100%', padding: '0.8rem', borderRadius: '6px', border: '1px solid #ced4da' }} required />
                 </div>

                 <div>
                   <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: '#6c757d', marginBottom: '0.3rem' }}>Contraseña</label>
                   <input type="text" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} style={{ width: '100%', padding: '0.8rem', borderRadius: '6px', border: '1px solid #ced4da', fontFamily: 'monospace' }} placeholder="Dejar en blanco si no cambia" />
                 </div>

                 <div style={{ display: 'flex', gap: '1rem' }}>
                    <div style={{ flex: 1 }}>
                       <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: '#6c757d', marginBottom: '0.3rem' }}>% Comisión</label>
                       <input type="number" value={formData.commission} onChange={(e) => setFormData({...formData, commission: e.target.value})} style={{ width: '100%', padding: '0.8rem', borderRadius: '6px', border: '1px solid #ced4da' }} required />
                    </div>
                    <div style={{ flex: 1 }}>
                       <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: '#6c757d', marginBottom: '0.3rem' }}>Estado</label>
                       <select value={formData.status} onChange={(e) => setFormData({...formData, status: e.target.value as 'Activo'|'Inactivo'})} style={{ width: '100%', padding: '0.8rem', borderRadius: '6px', border: '1px solid #ced4da', backgroundColor: '#fff' }}>
                         <option value="Activo">Activo</option>
                         <option value="Inactivo">Inactivo</option>
                       </select>
                    </div>
                 </div>

                 <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: '#6c757d', marginBottom: '0.3rem' }}>Precio de Venta (Por Defecto)</label>
                    <select value={formData.saleModeAccess} onChange={(e) => setFormData({...formData, saleModeAccess: e.target.value as '0.20'|'0.25'|'Ambos'})} style={{ width: '100%', padding: '0.8rem', borderRadius: '6px', border: '1px solid #ced4da', backgroundColor: '#fff' }}>
                      <option value="Ambos">Ambos (Puede elegir en la app)</option>
                      <option value="0.20">0.20 (Fijo)</option>
                      <option value="0.25">0.25 (Fijo)</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input 
                        type="checkbox" 
                        id="allowPalet"
                        checked={formData.allowPalet} 
                        onChange={(e) => setFormData({...formData, allowPalet: e.target.checked})} 
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                      <label htmlFor="allowPalet" style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#17233D', cursor: 'pointer' }}>
                        Permitir venta de Palets
                      </label>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input 
                        type="checkbox" 
                        id="allowGranjita"
                        checked={formData.allowGranjita} 
                        onChange={(e) => setFormData({...formData, allowGranjita: e.target.checked})} 
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                      <label htmlFor="allowGranjita" style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#0d9488', cursor: 'pointer' }}>
                        Permitir vender La Granjita 🐓
                      </label>
                    </div>
                  </div>

                 <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                    <button type="button" onClick={() => setIsModalOpen(false)} style={{ flex: 1, padding: '0.8rem', border: '1px solid #ced4da', backgroundColor: 'transparent', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', color: '#6c757d' }}>Cancelar</button>
                    <button type="submit" disabled={loading} style={{ flex: 1, padding: '0.8rem', border: 'none', backgroundColor: '#3399ff', color: '#fff', borderRadius: '6px', cursor: loading ? 'wait' : 'pointer', fontWeight: 'bold' }}>
                       {loading ? 'Sincronizando...' : 'Guardar'}
                    </button>
                 </div>
              </form>
           </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {userToDelete !== null && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
           <div style={{ backgroundColor: '#fff', padding: '2rem', borderRadius: '12px', width: '90%', maxWidth: '350px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)', textAlign: 'center' }}>
              <h3 style={{ margin: '0 0 1rem 0', color: '#dc3545' }}>⚠️ Confirmar Eliminación</h3>
              <p style={{ color: '#6c757d', marginBottom: '1.5rem' }}>¿Estás 100% seguro de que deseas eliminar permanentemente a este vendedor del sistema?</p>
              
              <div style={{ display: 'flex', gap: '1rem' }}>
                 <button onClick={() => setUserToDelete(null)} style={{ flex: 1, padding: '0.8rem', border: '1px solid #ced4da', backgroundColor: 'transparent', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', color: '#6c757d' }}>Cancelar</button>
                 <button onClick={confirmDelete} disabled={loading} style={{ flex: 1, padding: '0.8rem', border: 'none', backgroundColor: '#dc3545', color: '#fff', borderRadius: '6px', cursor: loading ? 'wait' : 'pointer', fontWeight: 'bold' }}>
                    {loading ? 'Eliminando...' : 'Sí, Eliminar'}
                 </button>
              </div>
           </div>
        </div>
      )}

    </div>
  );
}
