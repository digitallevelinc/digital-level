import { fUSDT, inject } from './utils.js';

/**
 * Actualiza la UI de la comisión del operador basada en el profit real de los bancos.
 * @param {Object} kpis - El objeto completo de la API.
 * @param {Array} bankInsights - La lista de bancos con sus profits individuales.
 */
export function updateComisionOperadorUI(kpis = {}, bankInsights = []) {
    // 1. OBTENCIÓN DE DATOS (Zero-Logic Backend)
    // El backend ahora provee el objeto 'payroll' en critical o root.
    const payroll = kpis.payroll || kpis.critical?.payroll || {};

    // fallback por si el backend viejo sigue respondiendo (temporal)
    const totalAmount = payroll.totalAmount ?? 0;
    const pct = payroll.percentage ?? 0;

    // 2. INYECCIONES EN EL COMPONENTE ASTRO
    // Inyectamos el porcentaje configurado
    inject('op-config-pct', `${pct}%`);

    // Inyectamos el monto neto acumulado para el operador
    inject('op-net-profit', fUSDT(totalAmount).replace('$', ''));

    // 3. LÓGICA DE LA BARRA DE PROGRESO (Rendimiento)
    // Usamos el Profit actual vs una meta (ejemplo $1000) o simplemente el crecimiento
    const progressBar = document.getElementById('op-profit-bar');
    if (progressBar) {
        // Por ahora mantenemos la meta estática de 1000 para el visual
        const goal = 1000;
        const amount = Number(totalAmount || 0);
        const progress = Math.min((amount / goal) * 100, 100);
        progressBar.style.width = `${amount > 0 ? progress : 0}%`;
    }
}