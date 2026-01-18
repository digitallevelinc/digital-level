import { fUSDT, inject } from './utils.js';

/**
 * Actualiza la UI de la comisión del operador basada en el profit real de los bancos.
 * @param {Object} kpis - El objeto completo de la API.
 * @param {Array} bankInsights - La lista de bancos con sus profits individuales.
 */
export function updateComisionOperadorUI(kpis = {}, bankInsights = []) {
    // 1. OBTENER CONFIGURACIÓN
    // Buscamos el porcentaje en la API, si no existe usamos 60 como base
    const configPct = kpis.config?.operatorCommissionPct || 60;
    
    // 2. FUENTE DE VERDAD: PROFIT ACUMULADO
    // Sumamos los profits de los bancos exactamente igual que en profit.js
    const totalProfitCalculated = bankInsights.reduce((acc, bank) => acc + (bank.profit || 0), 0);

    // 3. CÁLCULO DE LA COMISIÓN (Profit Share)
    // Solo calculamos si el profit es positivo
    const comisionMonto = totalProfitCalculated > 0 
        ? (totalProfitCalculated * (configPct / 100)) 
        : 0;

    // 4. INYECCIONES EN EL COMPONENTE ASTRO
    // Inyectamos el porcentaje configurado
    inject('op-config-pct', `${configPct}%`);
    
    // Inyectamos el monto neto acumulado para el operador
    inject('op-net-profit', fUSDT(comisionMonto).replace('$', '')); 

    // 5. LÓGICA DE LA BARRA DE PROGRESO (Rendimiento)
    // Usamos el Profit actual vs una meta (ejemplo $1000) o simplemente el crecimiento
    const progressBar = document.getElementById('op-profit-bar');
    if (progressBar) {
        // Calculamos un progreso visual (puedes ajustar el divisor según tu meta mensual)
        const goal = 1000; 
        const progress = Math.min((totalProfitCalculated / goal) * 100, 100);
        progressBar.style.width = `${totalProfitCalculated > 0 ? progress : 0}%`;
    }

    // Opcional: Log de auditoría para el desarrollador
    // console.log(`[Payroll] Profit: ${totalProfitCalculated} | Share: ${configPct}% | Total: ${comisionMonto}`);
}