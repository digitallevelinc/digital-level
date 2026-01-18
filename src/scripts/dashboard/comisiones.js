// src/scripts/dashboard/comisiones.js
import { fUSDT } from './utils.js';

/**
 * Procesa y actualiza la sección de Comisiones
 * @param {Object} operations - Objeto operations del backend
 */
export function updateComisionesUI(operations = {}) {
    // Intentamos obtener el objeto de comisiones, fallback a objeto vacío si no existe
    const commissions = operations.commissions || {};

    // Mapeo de IDs del DOM (incluyendo los nuevos campos de montos)
    const ui = {
        balance: document.getElementById('fee-balance-total'),
        totalOps: document.getElementById('fee-ops-count'),
        salesOps: document.getElementById('fee-sales-count'),
        buysOps: document.getElementById('fee-buys-count'),
        salesAmount: document.getElementById('fee-sales-amount'),
        buysAmount: document.getElementById('fee-buys-amount')
    };

    // Si el elemento principal no existe, abortamos
    if (!ui.balance) return;

    // 1. CÁLCULO Y NORMALIZACIÓN DE DATOS
    // Montos (Dinero)
    const totalFeeMoney = Number(commissions.total || 0);
    const amountSales = Number(commissions.totalSells || commissions.amountSales || 0);
    const amountBuys = Number(commissions.totalBuys || commissions.amountBuys || 0);

    // Conteos (Cantidad de Ops)
    const countTotal = commissions.operationsWithCommission || 0;
    const countSales = commissions.sellsWithCommission || 0;
    const countBuys = commissions.buysWithCommission || 0;

    // 2. INYECCIÓN EN LA INTERFAZ CON CLASES DE SEGURIDAD
    // Balance principal
    ui.balance.textContent = fUSDT(totalFeeMoney);

    // Montos detallados (Los bloques de colores)
    if (ui.salesAmount) ui.salesAmount.textContent = fUSDT(amountSales).replace('USDT', '');
    if (ui.buysAmount) ui.buysAmount.textContent = fUSDT(amountBuys).replace('USDT', '');

    // Conteos de operaciones
    if (ui.totalOps) ui.totalOps.textContent = countTotal.toLocaleString();
    if (ui.salesOps) ui.salesOps.textContent = countSales.toLocaleString();
    if (ui.buysOps) ui.buysOps.textContent = countBuys.toLocaleString();

    // 3. EFECTO VISUAL DINÁMICO
    // Si el balance es muy alto (ej. > 100), podemos resaltar el texto
    if (totalFeeMoney > 0) {
        ui.balance.classList.add('text-white');
    } else {
        ui.balance.classList.add('text-gray-600');
    }
}