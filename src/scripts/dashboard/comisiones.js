// src/scripts/dashboard/comisiones.js
import { fUSDT } from './utils.js';

/**
 * Procesa y actualiza la sección de Comisiones
 * @param {Object} operations - Objeto operations del backend (incluye commissions, buys, sells)
 */
export function updateComisionesUI(operations = {}) {
    const commissions = operations.commissions || {};

    // IDs del DOM
    const balanceEl = document.getElementById('fee-balance-total');
    const totalOpsEl = document.getElementById('fee-ops-count');
    const salesOpsEl = document.getElementById('fee-sales-count');
    const buysOpsEl = document.getElementById('fee-buys-count');

    if (!balanceEl) return;

    // 1. Balance Total (Ya viene calculado del backend)
    const totalFeeMoney = commissions.total || 0;

    // 2. Conteo de Operaciones
    const countTotalWithFee = commissions.operationsWithCommission || 0;
    const countSalesWithFee = commissions.sellsWithCommission || 0;
    const countBuysWithFee = commissions.buysWithCommission || 0;

    // --- Inyección de datos en la Interfaz ---
    balanceEl.textContent = fUSDT(totalFeeMoney);

    if (totalOpsEl) totalOpsEl.textContent = countTotalWithFee.toString();
    if (salesOpsEl) salesOpsEl.textContent = countSalesWithFee.toString();
    if (buysOpsEl) buysOpsEl.textContent = countBuysWithFee.toString();
}