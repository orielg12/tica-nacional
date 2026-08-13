import { useState, useEffect } from 'react';
import { Bluetooth, CheckCircle, AlertTriangle, Printer, Search } from 'lucide-react';
import { BluetoothSerial } from '@e-is/capacitor-bluetooth-serial';
import { Capacitor } from '@capacitor/core';

export default function LinkPrinter() {
  const [deviceList, setDeviceList] = useState<any[]>([]);
  const [printerMac, setPrinterMac] = useState<string>('');
  const [printerName, setPrinterName] = useState<string>('');
  const [isBusy, setIsBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => {
    const savedMac = localStorage.getItem('bt_printer_mac');
    const savedName = localStorage.getItem('bt_printer_name');
    if (savedMac) {
       setPrinterMac(savedMac);
       setPrinterName(savedName || 'Impresora Bluetooth');
    }
  }, []);

  const addLog = (msg: string) => {
     setLog(prev => [msg, ...prev]);
  };

  const handleSearchPrinters = async () => {
    try {
      setIsBusy(true);
      setLog([]);
      setDeviceList([]);
      
      if (!Capacitor.isNativePlatform()) {
         addLog("⚠️ Estás en la Web. Bluetooth nativo de Android no funciona aquí.");
         alert("Esta función requiere la aplicación de Android (APK).");
         return;
      }

      addLog("Pidiendo permisos y activando Bluetooth de Android...");
      try {
         await BluetoothSerial.enable();
      } catch(e) {
         addLog("Aviso: No se pudo auto-activar BT. Probablemente ya está activado o el usuario debe encenderlo.");
      }
      
      addLog("Escaneando impresoras vinculadas en tu Android...");
      const scanResult = await BluetoothSerial.scan();
      const result = scanResult.devices;
      
      if (!result || result.length === 0) {
         addLog("❌ No se encontraron impresoras Emparejadas. Ve a 'Ajustes > Bluetooth' en tu celular y empareja la impresora primero.");
         alert("No hay impresoras emparejadas. Empareja la impresora en Ajustes de Android.");
         return;
      }

      setDeviceList(result);
      addLog(`Se encontraron ${result.length} dispositivos emparejados. Por favor selecciona tu impresora de la lista inferior.`);

    } catch (err: any) {
      console.error(err);
      addLog("Error: " + (err.message || JSON.stringify(err)));
      alert("Error buscando impresoras: " + (err.message || JSON.stringify(err)));
    } finally {
      setIsBusy(false);
    }
  };

  const handleSelectPrinter = (device: any) => {
     const mac = device.address || device.id;
     const name = device.name || 'Impresora Genérica';
     
     setPrinterMac(mac);
     setPrinterName(name);
     
     localStorage.setItem('bt_printer_mac', mac);
     localStorage.setItem('bt_printer_name', name);
     
     alert(`Impresora fijada exitosamente:\n${name}`);
     addLog("Impresora grabada en el sistema. Ya puedes ir a realizar ventas.");
  };

  const handleTestPrint = async () => {
     if (!Capacitor.isNativePlatform()) {
        alert("La impresión real solo funciona en el teléfono (APK).");
        return;
     }

     if (!printerMac) {
        alert("Primero busca y selecciona una impresora haciendo clic en su nombre.");
        return;
     }

     try {
       setIsBusy(true);
       addLog(`Intentando conectar con Mac: ${printerMac}...`);
       
       await BluetoothSerial.connect({ address: printerMac });
       addLog("Conectado exitosamente. Imprimiendo...");

       const testText = "PRUEBA DE IMPRESION\nSISTEMA GO\n------------------\nConfiguracion Exitosa!\n\n\n";
       await BluetoothSerial.write({ address: printerMac, value: testText });
       
       addLog("Impresión enviada.");
       
       setTimeout(async () => {
          await BluetoothSerial.disconnect({ address: printerMac });
          addLog("Desconectado de la impresora por seguridad.");
       }, 1500);

     } catch (error: any) {
        addLog("Fallo de conexión: " + (error.message || JSON.stringify(error)));
        alert("Fallo de conexión. Asegúrate que la impresora está encendida y es la correcta.");
     } finally {
        setIsBusy(false);
     }
  };

  return (
    <div className="flex-1 bg-slate-900 p-6 overflow-y-auto w-full max-w-full text-white">
      <div className="mb-8">
        <h1 className="text-3xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-emerald-300 drop-shadow-sm mb-2">
          CONFIGURAR IMPRESORA (APK)
        </h1>
        <p className="text-gray-400">Escanea y fija la impresora térmica correcta para que GO se comunique en vivo.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 max-w-3xl">
         
         <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-xl w-full">
             <div className="flex items-center gap-3 mb-6">
                <Printer className="text-teal-400" size={28} />
                <h2 className="text-xl font-bold">Impresora Actual Destino</h2>
             </div>
             
             {printerMac ? (
                <div className="bg-teal-900/40 border border-teal-700 p-4 rounded-xl flex items-center justify-between mb-4">
                   <div>
                       <p className="font-bold text-lg text-teal-300">{printerName}</p>
                       <p className="text-xs text-gray-400 uppercase tracking-widest">{printerMac}</p>
                   </div>
                   <CheckCircle className="text-teal-400" size={30} />
                </div>
             ) : (
                <div className="bg-slate-900 border border-red-900/50 p-4 rounded-xl flex items-center gap-3 mb-4">
                   <AlertTriangle className="text-red-400" size={24} />
                   <p className="text-sm text-red-300 font-bold">Ninguna Impresora Seleccionada.</p>
                </div>
             )}

             <button 
                onClick={handleSearchPrinters}
                disabled={isBusy}
                className="w-full bg-blue-600 active:bg-blue-700 text-white font-bold py-4 rounded-xl text-[15px] uppercase tracking-wider flex justify-center items-center gap-2 mb-4"
             >
                <Search size={20} />
                {isBusy ? 'Buscando...' : 'Buscar Impresoras Emparejadas'}
             </button>

             {deviceList.length > 0 && (
                <div className="mt-4">
                   <h3 className="text-sm font-bold text-gray-400 mb-2 uppercase">Selecciona tu Impresora:</h3>
                   <div className="flex flex-col gap-2">
                      {deviceList.map((dev: any, i) => (
                         <button 
                            key={i}
                            onClick={() => handleSelectPrinter(dev)}
                            className="bg-slate-700 hover:bg-slate-600 p-3 rounded-lg text-left flex justify-between items-center transition-colors"
                         >
                            <span className="font-bold text-white">{dev.name || 'Desconocido'}</span>
                            <span className="text-xs text-green-400 bg-green-900/30 px-2 py-1 rounded">Vincular</span>
                         </button>
                      ))}
                   </div>
                </div>
             )}
         </div>

         <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-xl w-full">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Bluetooth className="text-blue-400" /> Prueba de Impresión
            </h2>
            <button 
                onClick={handleTestPrint}
                disabled={isBusy || !printerMac}
                className="w-full bg-teal-600 disabled:bg-teal-900/30 disabled:text-gray-500 active:bg-teal-700 text-white font-bold py-4 rounded-xl text-[15px] uppercase tracking-wider flex justify-center items-center gap-2 mb-6"
            >
                <Printer size={20} />
                {isBusy ? 'Procesando...' : 'Imprimir Ticket de Prueba'}
            </button>
            <div className="bg-black/50 p-4 rounded-lg border border-slate-700 max-h-48 overflow-y-auto">
               <h3 className="text-xs font-bold text-gray-500 mb-2 sticky top-0 bg-black/50 p-1">REPORTE DEL SISTEMA BLUETOOTH</h3>
               {log.length === 0 && <p className="text-xs text-gray-600">Esperando acciones...</p>}
               {log.map((l, i) => (
                   <p key={i} className="text-xs font-mono text-green-400 mb-1 border-b border-gray-800 pb-1">
                      {l}
                   </p>
               ))}
            </div>
         </div>

      </div>
    </div>
  );
}
