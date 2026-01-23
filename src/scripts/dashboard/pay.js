import { fUSDT, buildSheetLink } from './utils.js';

export const updatePaySection = (kpis) => {
    const container = document.getElementById('wallet-pay');
    if (!container) return;

    // Soporte para estructura anidada o plana
    const data = kpis.wallets?.pay || kpis.wallets || {};
    const mainValue = document.getElementById('pay-balance-total');
    const sheetLink = document.getElementById('link-pay-detail');

    // Debug para ver qué llega a Pay
    // console.log("Pay Data Source:", data);

    const ui = {
        sentCount: document.getElementById('pay-sent-count'),
        sentVol: document.getElementById('pay-sent-vol'),
        receivedCount: document.getElementById('pay-received-count'),
        receivedVol: document.getElementById('pay-received-vol'),
        totalOps: document.getElementById('pay-total-ops') // Nuevo ID
    };

    if (data) {
        // Balance: flat `balancePay` o nested `balancePay`
        const balance = data.balancePay !== undefined ? data.balancePay : (data.balance ?? 0);
        if (mainValue) mainValue.textContent = fUSDT(balance);

        // --- Salidas (Enviado) ---
        // Claves planas probables: paySentCount, paySentVol
        const sent = data.paySentCount ?? data.sentCount ?? 0;
        const sentVol = data.paySentVol ?? data.sentVol ?? 0;

        if (ui.sentCount) ui.sentCount.textContent = sent.toString();
        if (ui.sentVol) ui.sentVol.textContent = fUSDT(sentVol);

        // --- Entradas (Recibido) ---
        // Claves planas probables: payReceivedCount, payReceivedVol
        const received = data.payReceivedCount ?? data.receivedCount ?? 0;
        const receivedVol = data.payReceivedVol ?? data.receivedVol ?? 0;

        if (ui.receivedCount) ui.receivedCount.textContent = received.toString();
        if (ui.receivedVol) ui.receivedVol.textContent = fUSDT(receivedVol);

        // --- Total Operaciones (Suma) ---
        if (ui.totalOps) {
            ui.totalOps.textContent = (Number(sent) + Number(received)).toString();
        }
    }

    if (sheetLink) {
        sheetLink.href = buildSheetLink(kpis.config?.googleSheetId, "0");
        sheetLink.style.opacity = kpis.config?.googleSheetId ? "1" : "0.3";
    }
};