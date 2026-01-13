// src/scripts/dashboard/comisiones.js
import { fUSDT } from './utils.js';

/**
 * Procesa y actualiza la sección de Comisiones
 * @param {Array} transactions - Lista de transacciones con campos { fee, type }
 */
export function updateComisionesUI(transactions = []) {
    const balanceEl = document.getElementById('fee-balance-total');
    const totalOpsEl = document.getElementById('fee-ops-count');
    const salesOpsEl = document.getElementById('fee-sales-count');
    const buysOpsEl = document.getElementById('fee-buys-count');

    if (!balanceEl) return;

    // 1. Filtrar solo las que pagaron comisión (fee > 0)
    const transactionsWithFee = transactions.filter(t => (parseFloat(t.fee) || 0) > 0);

    // 2. Métrica: Balance de comisiones (Suma total de dinero)
    const totalFeeMoney = transactionsWithFee.reduce((acc, curr) => acc + (parseFloat(curr.fee) || 0), 0);

    // 3. Métrica: Cantidad total de operaciones que pagaron comisión
    const countTotalWithFee = transactionsWithFee.length;

    // 4. Métrica: Cantidad de comisiones pagadas en VENTAS
    const countSalesWithFee = transactionsWithFee.filter(t => 
        ['VENTA', 'SELL'].includes(String(t.type || '').toUpperCase())
    ).length;

    // 5. Métrica: Cantidad de comisiones pagadas en COMPRAS
    const countBuysWithFee = transactionsWithFee.filter(t => 
        ['COMPRA', 'BUY'].includes(String(t.type || '').toUpperCase())
    ).length;

    // --- Inyección de datos en la Interfaz ---
    balanceEl.textContent = fUSDT(totalFeeMoney);
    
    if (totalOpsEl) totalOpsEl.textContent = countTotalWithFee.toString();
    if (salesOpsEl) salesOpsEl.textContent = countSalesWithFee.toString();
    if (buysOpsEl) buysOpsEl.textContent = countBuysWithFee.toString();
}