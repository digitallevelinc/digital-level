import { fUSDT, inject } from './utils.js';

/**
 * Actualiza la UI de la comisión del operador basada en el profit real de los bancos.
 * @param {Object} kpis - El objeto completo de la API.
 * @param {Array} bankInsights - La lista de bancos con sus profits individuales.
 */
export function updateComisionOperadorUI(kpis = {}, bankInsights = []) {
    // Single source of truth: the payroll card must only use the dedicated
    // payroll summary endpoint. Using KPI fallback causes value jumps because
    // /api/kpis and /api/payroll/summary do not apply the same formula.
    const payroll = kpis.payroll;
    if (!payroll) {
        return;
    }

    const totalAmount = payroll.totalAmount ?? 0;
    const pct = payroll.percentage ?? 0;

    inject('op-config-pct', `${pct}%`);
    inject('op-net-profit', fUSDT(totalAmount).replace('$', ''));

    const progressBar = document.getElementById('op-profit-bar');
    if (progressBar) {
        const goal = 1000;
        const amount = Number(totalAmount || 0);
        const progress = Math.min((amount / goal) * 100, 100);
        progressBar.style.width = `${amount > 0 ? progress : 0}%`;
    }
}
