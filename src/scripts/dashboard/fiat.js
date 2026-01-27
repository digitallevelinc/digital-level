import { fVES, fUSDT, buildSheetLink } from './utils.js';

const formatNumber = (num, decimals = 2) => {
    return Number(num || 0).toLocaleString('es-VE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

/**
 * Summariza todos los bancos y actualiza la tarjeta FIAT Balance
 * @param {Object} kpis - Datos globales
 * @param {Array} bankInsights - Array con la data de cada banco
 */
export function updateFiatSection(kpis = {}, bankInsights = []) {
    const ui = {
        amount: document.getElementById('fiat-amount'),
        amountUSD: document.getElementById('fiat-amount-usd'),
        withdrawalCount: document.getElementById('fiat-withdrawal-count'),
        withdrawalVol: document.getElementById('fiat-withdrawal-vol'),
        depoCount: document.getElementById('fiat-depo-count'),
        depoVol: document.getElementById('fiat-depo-vol'),
        totalOps: document.getElementById('fiat-total-ops'),
        sheetLink: document.getElementById('link-fiat-sheet')
    };

    const operations = kpis.operations || {};

    // Balance Fiat (COMPRADO/VENDIDO/BALANCE)
    // Aseguramos leer totalFiat de las operaciones globales
    const fiatBought = operations?.buys?.totalFiat || 0;
    const fiatSold = operations?.sells?.totalFiat || 0;

    // Balance desde operations (nuevo campo API)
    const fiatBalance = operations?.fiatBalance || 0;
    const fiatBalanceUSDT = operations?.fiatBalanceUSDT || 0;

    // 3. Inyección en UI

    // Balance Total VES
    if (ui.amount) {
        ui.amount.textContent = `${formatNumber(fiatBalance, 2)} VES`;
        ui.amount.style.color = fiatBalance >= 0 ? "#28a745" : "#dc3545";
    }

    // USD equivalent (nuevo campo API)
    if (ui.amountUSD) {
        ui.amountUSD.textContent = `≈ ${formatNumber(fiatBalanceUSDT, 2)} USD`;
    }

    // VENDIDO (Salidas/Withdrawals)
    // Elements.fiatSold -> ui.withdrawalVol
    if (ui.withdrawalVol) {
        ui.withdrawalVol.textContent = `$${formatNumber(fiatSold, 2)}`;
    }
    // Counts mapping (keep existing logic or map from operations)
    if (ui.withdrawalCount) {
        ui.withdrawalCount.textContent = (operations?.sells?.count || 0).toString();
    }

    // COMPRADO (Entradas/Deposits)
    // Elements.fiatBought -> ui.depoVol
    if (ui.depoVol) {
        ui.depoVol.textContent = `$${formatNumber(fiatBought, 2)}`;
    }
    if (ui.depoCount) {
        ui.depoCount.textContent = (operations?.buys?.count || 0).toString();
    }

    // TOTAL DE OPERACIONES
    if (ui.totalOps) {
        const total = (operations?.sells?.count || 0) + (operations?.buys?.count || 0);
        ui.totalOps.textContent = total.toString();
    }

    // 4. Link Sheet
    if (ui.sheetLink) {
        const url = kpis.config?.fiatSheetUrl || buildSheetLink(kpis.config?.googleSheetId);
        ui.sheetLink.href = url;
        ui.sheetLink.style.opacity = url ? "1" : "0.3";
    }
}