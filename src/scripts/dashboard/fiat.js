import { fVES, buildSheetLink } from './utils.js';

/**
 * Summariza todos los bancos y actualiza la tarjeta FIAT Balance
 * @param {Object} kpis - Datos globales
 * @param {Array} bankInsights - Array con la data de cada banco (proviene de bancos.js)
 */
export function updateFiatSection(kpis = {}, bankInsights = []) {
    const ui = {
        amount: document.getElementById('fiat-amount'),
        withdrawalCount: document.getElementById('fiat-withdrawal-count'),
        withdrawalVol: document.getElementById('fiat-withdrawal-vol'),
        depoCount: document.getElementById('fiat-depo-count'),
        depoVol: document.getElementById('fiat-depo-vol'),
        totalOps: document.getElementById('fiat-total-ops'), 
        sheetLink: document.getElementById('link-fiat-sheet')
    };

    // 1. Inicializamos acumuladores
    let totalBalanceFiat = 0;
    let totalVendidoVES = 0;
    let totalCompradoVES = 0;
    let totalCountVendido = 0;
    let totalCountComprado = 0;

    // 2. Sumarizamos la data de todos los bancos detectados
    if (bankInsights && bankInsights.length > 0) {
        bankInsights.forEach(bank => {
            // Balances
            totalBalanceFiat += (bank.fiatBalance || 0);

            // Volúmenes (Usando la lógica de bancos.js)
            // Vendido: Salida de VES (Generalmente asociado a Buys de Cripto en tu flujo)
            // Comprado: Entrada de VES (Generalmente asociado a Sells de Cripto)
            
            totalVendidoVES += (bank.volumeSellFiat || (bank.volumeSell * bank.sellRate) || 0);
            totalCompradoVES += (bank.volumeBuyFiat || (bank.volumeBuy * bank.buyRate) || 0);
            
            // Operaciones (si tu API las entrega por banco, si no, se mantiene el global)
            totalCountVendido += (bank.countSell || 0);
            totalCountComprado += (bank.countBuy || 0);
        });
    } else {
        // Fallback: Si no hay array de bancos, intentar usar el objeto wallets general
        totalBalanceFiat = kpis.wallets?.balanceFiat || 0;
        // Aquí podrías usar ops.sells / ops.buys como respaldo
        totalVendidoVES = kpis.operations?.sells?.totalFiat || 0;
        totalCompradoVES = kpis.operations?.buys?.totalFiat || 0;
    }

    // 3. Inyección en UI
    
    // Balance Total Sumarizado
    if (ui.amount) ui.amount.textContent = fVES(totalBalanceFiat);

    // ROJO: Salidas/Vendido (Suma de todos los bancos)
    if (ui.withdrawalCount) ui.withdrawalCount.textContent = (totalCountVendido || kpis.operations?.sells?.count || 0).toString();
    if (ui.withdrawalVol) ui.withdrawalVol.textContent = fVES(totalVendidoVES);

    // VERDE: Entradas/Comprado (Suma de todos los bancos)
    if (ui.depoCount) ui.depoCount.textContent = (totalCountComprado || kpis.operations?.buys?.count || 0).toString();
    if (ui.depoVol) ui.depoVol.textContent = fVES(totalCompradoVES);

    // TOTAL DE OPERACIONES
    if (ui.totalOps) {
        const total = (totalCountVendido + totalCountComprado) || 
                      ((kpis.operations?.sells?.count || 0) + (kpis.operations?.buys?.count || 0));
        ui.totalOps.textContent = total.toString();
    }

    // 4. Link Sheet
    if (ui.sheetLink) {
        const url = kpis.config?.fiatSheetUrl || buildSheetLink(kpis.config?.googleSheetId);
        ui.sheetLink.href = url;
        ui.sheetLink.style.opacity = url ? "1" : "0.3";
    }
}