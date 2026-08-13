const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Inicializar Supabase con las credenciales del proyecto
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://nqoqdlycxkwunngkuewb.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xb3FkbHljeGt3dW5uZ2t1ZXdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NzkzNzUsImV4cCI6MjA5MTE1NTM3NX0.Dm8RCh2pqFhwu9lJvIeuTnNWYpArSUjxPcWR1-WV4oE';
const supabase = createClient(supabaseUrl, supabaseKey);

// Inicializar cliente de WhatsApp
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

client.on('qr', (qr) => {
    // Generar el código QR en la consola para vincular el celular
    qrcode.generate(qr, { small: true });
    console.log('\n==================================================');
    console.log('📱 ESCANEA ESTE QR CON TU WHATSAPP PARA VINCULAR EL BOT');
    console.log('==================================================\n');
});

client.on('ready', () => {
    console.log('✅ ¡Bot de WhatsApp listo y escuchando mensajes!');
});

// Función auxiliar para obtener el día de la semana
function getDayName() {
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return days[new Date().getDay()];
}

// Función para formatear hora am/pm
function formatTime(hour, minute) {
    const h = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
    const m = minute.toString().padStart(2, '0');
    const ampm = hour >= 12 ? 'PM' : 'AM';
    return `${h}:${m} ${ampm}`;
}

// Memoria temporal para no hacer spam a la misma persona
const recentlyReplied = new Map();

client.on('message', async msg => {
    const text = msg.body;
    
    // Ignorar mensajes de grupos o estados
    if (msg.isGroupMsg || msg.isStatus || msg.from === 'status@broadcast') return;

    // Quick reply shortcuts
    const quickReplies: Record<string, string> = {
        hola: '¡Hola! ¿En qué puedo ayudarte? 😊',
        gracias: 'De nada! 😊',
        ayuda: 'Puedes enviarme tu jugada (ej. 15x20) y te avisaré si el sorteo está cerrado.',
        info: 'Actualmente tengo los siguientes sorteos activos...\n(consulta la web para más detalles).',
        // agrega más respuestas según necesites
    };
    const lowerText = text.trim().toLowerCase();
    if (quickReplies[lowerText]) {
        await msg.reply(quickReplies[lowerText]);
        recentlyReplied.set(msg.from, Date.now());
        return;
    }

    // Solo procesar si el mensaje parece ser una jugada real.
    // Busca patrones como "15x20", "15 de 20", "15-20", "15/20", "15.20"
    const isPlay = /\d{1,2}\s*(x|\*|-|–|—|\/|:|el|al|del|de|con|por|\.|\s|,)+\s*\d+/i.test(text);
    if (!isPlay) return;

    // Si ya le respondimos a esta persona hace menos de 5 minutos, la ignoramos para no ser molestos
    if (recentlyReplied.has(msg.from)) {
        const lastTime = recentlyReplied.get(msg.from);
        if (Date.now() - lastTime < 5 * 60 * 1000) { // 5 minutos en milisegundos
            return;
        }
    }

    try {
        // Obtener todos los sorteos activos
        const { data: lotteries, error } = await supabase.from('lotteries').select('*');
        if (error || !lotteries) return;

        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const currentTotalMinutes = currentHour * 60 + currentMinute;
        const todayName = getDayName();

        const closedLotteries = [];
        const allLotteryNames = [...new Set(lotteries.map(l => l.name.toLowerCase()))];

        for (const lot of lotteries) {
            if (!lot.is_active) continue;
            // Verificar si juega hoy
            if (lot.days && lot.days.length > 0 && !lot.days.includes(todayName)) continue;

            const drawTotalMinutes = lot.hour * 60 + lot.minute;
            const closeMinutes = lot.close_minutes || 0;
            const closeTotalMinutes = drawTotalMinutes - closeMinutes;

            // Ventana de cierre: desde el minuto de cierre hasta 5 minutos después de la hora del sorteo
            if (currentTotalMinutes >= closeTotalMinutes && currentTotalMinutes <= drawTotalMinutes + 5) {
                closedLotteries.push(lot);
            }
        }

        if (closedLotteries.length > 0) {
            // Filtrar cuáles de los sorteos cerrados fueron mencionados
            let matchedClosed = closedLotteries.filter(lot => {
                const nameRegex = new RegExp(lot.name, 'i');
                if (!nameRegex.test(text)) return false;
                
                // Si la persona especificó OTRA hora explícitamente (ej. "7pm", "de las 7", "19:00")
                // no debemos rechazar la jugada porque es para el sorteo futuro.
                const lotH12 = lot.hour > 12 ? lot.hour - 12 : (lot.hour === 0 ? 12 : lot.hour);
                const timeMatch = text.match(/\b(\d{1,2})\s*(am|pm|:00)\b/i) || text.match(/(?:a las|de las|para las)\s*(\d{1,2})\b/i);
                
                if (timeMatch) {
                    const mentionedHour = parseInt(timeMatch[1]);
                    // Si la hora mencionada NO es la del sorteo que está cerrando, lo dejamos pasar
                    if (mentionedHour !== lotH12 && mentionedHour !== lot.hour) {
                        return false; 
                    }
                }
                
                return true;
            });

            // Si el mensaje no menciona NINGÚN nombre de sorteo en general, 
            // asumimos que están jugando para los sorteos que acaban de cerrar.
            const mentionsAnyLottery = allLotteryNames.some(name => new RegExp(name, 'i').test(text));
            
            if (!mentionsAnyLottery) {
                matchedClosed = closedLotteries; // Aplicar advertencia para todos los cerrados
            }

            if (matchedClosed.length > 0) {
                let replyText = '';
                
                for (const lot of matchedClosed) {
                    const drawTimeStr = formatTime(lot.hour, lot.minute);
                    replyText += `🚫 *${lot.name.toUpperCase()} ${drawTimeStr} CERRADO*\n`;
                }
                
                replyText += `\n⚠️ Si tu jugada es para un sorteo de más tarde, por favor vuelve a enviarla especificando la hora (Ejemplo: "Nica 7pm 15x20").`;
                
                // Enviar la respuesta automática
                await msg.reply(replyText.trim());
                recentlyReplied.set(msg.from, Date.now());
                console.log(`[BOT] Respuesta de cierre enviada a ${msg.from} por el mensaje: "${text}"`);
            }
        }
    } catch (e) {
        console.error('Error procesando mensaje:', e);
    }
});

client.initialize();
