-- ==============================================================================
-- LIMPIAR TODOS LOS DATOS DE PRUEBA (SOLO PARA PASAR A PRODUCCIÓN)
-- ==============================================================================
-- Ejecuta esto en el SQL Editor de Supabase cuando vayas a lanzar la App final.
-- Esto borrará TODO EL HISTORIAL de Ventas, Tickets, Resultados y Pagos,
-- pero dejará intacta la estructura de tablas y políticas.

TRUNCATE TABLE public.ticket_numbers CASCADE;
TRUNCATE TABLE public.tickets CASCADE;
TRUNCATE TABLE public.results CASCADE;
TRUNCATE TABLE public.payouts CASCADE;
TRUNCATE TABLE public.covers CASCADE;

-- Si deseas resetear también los perfiles de usuario (excepto auth de Supabase),
-- quita los guiones de abajo:
-- TRUNCATE TABLE public.profiles CASCADE;

-- Refresca la página después de ejecutar.
