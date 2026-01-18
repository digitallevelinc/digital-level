import { fVES, fUSDT, buildSheetLink } from './utils.js';

/**
 * Summariza todos los bancos y actualiza la tarjeta FIAT Balance
 * @param {Object} kpis - Datos globales
 * @param {Array} bankInsights - Array con la data de cada banco
 */
export function updateFiatSection(kpis = {}, bankInsights = []) {
    const ui = {
        amount: document.getElementById('fiat-amount'),
        amountUSD: document.getElementById('fiat-amount-usd'), // Nuevo ID para el aproximado
        withdrawalCount: document.getElementById('fiat-withdrawal-count'),
        withdrawalVol: document.getElementById('fiat-withdrawal-vol'),
        depoCount: document.getElementById('fiat-depo-count'),
        depoVol: document.getElementById('fiat-depo-vol'),
        totalOps: document.getElementById('fiat-total-ops'), 
        sheetLink: document.getElementById('link-fiat-sheet')
    };

    // 1. Inicializamos acumuladores
    let totalVendidoVES = 0;
    let totalCompradoVES = 0;
    let totalCountVendido = 0;
    let totalCountComprado = 0;

    // 2. Sumarizamos la data de todos los bancos detectados
    if (bankInsights && bankInsights.length > 0) {
        bankInsights.forEach(bank => {
            totalVendidoVES += (bank.volumeSellFiat || (bank.volumeSell * bank.sellRate) || 0);
            totalCompradoVES += (bank.volumeBuyFiat || (bank.volumeBuy * bank.buyRate) || 0);
            
            totalCountVendido += (bank.countSell || 0);
            totalCountComprado += (bank.countBuy || 0);
        });
    } else {
        totalVendidoVES = kpis.operations?.sells?.totalFiat || 0;
        totalCompradoVES = kpis.operations?.buys?.totalFiat || 0;
    }

    // --- CÁLCULO DE BALANCE NETO ---
    const totalBalanceFiat = totalCompradoVES - totalVendidoVES;

    // 3. Inyección en UI
    
    // Balance Total Sumarizado
    if (ui.amount) {
        ui.amount.textContent = fVES(totalBalanceFiat);
        ui.amount.style.color = totalBalanceFiat >= 0 ? "#28a745" : "#dc3545";
    }

    // --- NUEVO: CÁLCULO APROXIMADO USD ---
    if (ui.amountUSD) {
        // Obtenemos la tasa de venta (prioridad: tasa de mercado > tasa de kpis)
        const currentRate = kpis.rates?.sellRate || kpis.metrics?.sellRate || 0;

        if (currentRate > 0 && totalBalanceFiat !== 0) {
            const usdApprox = totalBalanceFiat / currentRate;
            ui.amountUSD.textContent = `${fUSDT(usdApprox)} USD`;
        } else {
            ui.amountUSD.textContent = "0.00 USD";
        }
    }

    // ROJO: Salidas/Vendido (PRODUCCIÓN)
    if (ui.withdrawalCount) ui.withdrawalCount.textContent = (totalCountVendido || kpis.operations?.sells?.count || 0).toString();
    if (ui.withdrawalVol) ui.withdrawalVol.textContent = fVES(totalVendidoVES);

    // VERDE: Entradas/Comprado (PRODUCCIÓN)
    if (ui.depoCount) ui.depoCount.textContent = (totalCountComprado || kpis.operations?.buys?.count || 0).toString();
    if (ui.depoVol) ui.depoVol.textContent = fVES(totalCompradoVES);

    // TOTAL DE OPERACIONES (PRODUCCIÓN)
    if (ui.totalOps) {
        const total = (totalCountVendido + totalCountComprado) || 
                      ((kpis.operations?.sells?.count || 0) + (kpis.operations?.buys?.count || 0));
        ui.totalOps.textContent = total.toString();
    }

    // 4. Link Sheet (PRODUCCIÓN)
    if (ui.sheetLink) {
        const url = kpis.config?.fiatSheetUrl || buildSheetLink(kpis.config?.googleSheetId);
        ui.sheetLink.href = url;
        ui.sheetLink.style.opacity = url ? "1" : "0.3";
    }
}