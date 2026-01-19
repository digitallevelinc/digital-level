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

    // 2. ACUMULADORES MANUALES
    let totalFeesVentas = 0;
    let totalFeesCompras = 0;
    let totalOpsVentas = 0;
    let totalOpsCompras = 0;

    // 3. SUMA DETALLADA BANCO POR BANCO
    insights.forEach(b => {
        // Sumamos Montos (Fees en USDT)
        // Probamos varias combinaciones de nombres por si la API cambia
        totalFeesVentas += Number(b.feeSell || b.totalFeeSell || 0);
        totalFeesCompras += Number(b.feeBuy || b.totalFeeBuy || 0);

        // Sumamos Cantidad de Operaciones
        totalOpsVentas += Number(b.countSell || b.sellCount || 0);
        totalOpsCompras += Number(b.countBuy || b.buyCount || 0);
    });

    const totalGlobal = totalFeesVentas + totalFeesCompras;
    const totalOpsGlobal = totalOpsVentas + totalOpsCompras;

    // 4. INYECCIÓN EN LA INTERFAZ
    // Total Global
    ui.balance.textContent = fUSDT(totalGlobal);

    // Desglose de Ventas
    if (ui.salesAmount) ui.salesAmount.textContent = totalFeesVentas.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (ui.salesOps) ui.salesOps.textContent = totalOpsVentas.toLocaleString();

    // Desglose de Compras
    if (ui.buysAmount) ui.buysAmount.textContent = totalFeesCompras.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (ui.buysOps) ui.buysOps.textContent = totalOpsCompras.toLocaleString();

    // Contador Total Arriba
    if (ui.totalOps) ui.totalOps.textContent = totalOpsGlobal.toLocaleString();

    // 5. ESTILO VISUAL
    if (totalGlobal > 0) {
        ui.balance.classList.add('text-[#F3BA2F]'); 
        ui.balance.classList.remove('text-white');
    }
}