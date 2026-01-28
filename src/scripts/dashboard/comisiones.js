import { fUSDT } from './utils.js';

/**
 * Procesa y actualiza la sección de Comisiones sumando los datos de los bancos
 * @param {Object} data - El objeto completo (contiene bankInsights)
 */
export function updateComisionesUI(data = {}) {
    // 1. OBTENCIÓN DE DATOS (Buscamos bankInsights que es lo que inyecta updateDashboard)
    const insights = data.bankInsights || data.insights || [];

    // Mapeo de IDs del DOM
    const ui = {
        balance: document.getElementById('fee-balance-total'),
        salesAmount: document.getElementById('fee-sales-amount'),
        buysAmount: document.getElementById('fee-buys-amount'),
        totalOps: document.getElementById('fee-ops-count'),
        salesOps: document.getElementById('fee-sales-count'),
        buysOps: document.getElementById('fee-buys-count')
    };

    if (!ui.balance) return;

    // 2. DATOS GLOBALES (Source of Truth)
    // El backend ahora provee operations.totalFeesBuy y totalFeesSell
    const ops = data.operations || data.metrics?.operations || {};

    const totalFeesGlobal = Number(ops.totalFeesPaid || 0);
    const totalFeesVentas = Number(ops.totalFeesSell || 0);
    const totalFeesCompras = Number(ops.totalFeesBuy || 0);

    // Totales de Operaciones (Counts)
    const buysCount = Number(ops.buys?.count || 0);
    const sellsCount = Number(ops.sells?.count || 0);
    const totalOps = Number(ops.totalOperations || (buysCount + sellsCount));

    // 4. INYECCIÓN EN LA INTERFAZ
    // Total Global
    ui.balance.textContent = fUSDT(totalFeesGlobal);

    // Desglose de Ventas
    if (ui.salesAmount) ui.salesAmount.textContent = totalFeesVentas.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (ui.salesOps) ui.salesOps.textContent = sellsCount.toLocaleString();

    // Desglose de Compras
    if (ui.buysAmount) ui.buysAmount.textContent = totalFeesCompras.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (ui.buysOps) ui.buysOps.textContent = buysCount.toLocaleString();

    // Contador Total Arriba
    if (ui.totalOps) ui.totalOps.textContent = totalOps.toLocaleString();

    // 5. ESTILO VISUAL
    if (totalFeesGlobal > 0) {
        ui.balance.classList.add('text-[#F3BA2F]');
        ui.balance.classList.remove('text-white');
    }
}