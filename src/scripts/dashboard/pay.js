import { fUSDT, buildSheetLink } from './utils.js';

export const updatePaySection = (kpis) => {
    const container = document.getElementById('wallet-pay');
    if (!container) return;

    const data = kpis.wallets?.pay || kpis.wallets;
    const mainValue = document.getElementById('pay-balance-total');
    const sheetLink = document.getElementById('link-pay-detail');

    const ui = {
        sentCount: document.getElementById('pay-sent-count'),
        sentVol: document.getElementById('pay-sent-vol'),
        receivedCount: document.getElementById('pay-received-count'),
        receivedVol: document.getElementById('pay-received-vol'),
        totalOps: document.getElementById('pay-total-ops') // Nuevo ID
    };

    if (data && (data.balancePay !== undefined)) {
        if (mainValue) mainValue.textContent = fUSDT(data.balancePay);

        // --- Salidas (Enviado) ---
        const sent = data.paySentCount ?? 0;
        if (ui.sentCount) ui.sentCount.textContent = sent.toString();
        if (ui.sentVol) ui.sentVol.textContent = fUSDT(data.paySentVol ?? 0);

        // --- Entradas (Recibido) ---
        const received = data.payReceivedCount ?? 0;
        if (ui.receivedCount) ui.receivedCount.textContent = received.toString();
        if (ui.receivedVol) ui.receivedVol.textContent = fUSDT(data.payReceivedVol ?? 0);

        // --- Total Operaciones (Suma) ---
        if (ui.totalOps) {
            ui.totalOps.textContent = (sent + received).toString();
        }
    }

    if (sheetLink) {
        sheetLink.href = buildSheetLink(kpis.config?.googleSheetId, "0");
        sheetLink.style.opacity = kpis.config?.googleSheetId ? "1" : "0.3";
    }
};