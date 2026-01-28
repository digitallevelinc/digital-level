import { fUSDT, buildSheetLink } from './utils.js';

export const updatePaySection = (kpis) => {
    const container = document.getElementById('wallet-pay');
    if (!container) return;

    // Soporte para estructura anidada o plana
    const wallets = kpis.wallets || {};
    // Priorizamos el objeto anidado si existe para detalles, sino el root wallet
    const data = wallets.pay || {};

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

    // Balance principal
    const mainBalance = data.balancePay ?? wallets.balancePay ?? 0;

    if (mainValue) mainValue.textContent = fUSDT(mainBalance);

    // --- Salidas (Enviado) ---
    const sent = data.paySentCount ?? 0;
    const sentVol = data.paySentVol ?? 0;

    if (ui.sentCount) ui.sentCount.textContent = sent.toString();
    if (ui.sentVol) ui.sentVol.textContent = fUSDT(sentVol);

    // --- Entradas (Recibido) ---
    const received = data.payReceivedCount ?? 0;
    const receivedVol = data.payReceivedVol ?? 0;

    if (ui.receivedCount) ui.receivedCount.textContent = received.toString();
    if (ui.receivedVol) ui.receivedVol.textContent = fUSDT(receivedVol);

    // --- Total Operaciones ---
    if (ui.totalOps) {
        const total = data.totalOperations ?? (Number(sent) + Number(received));
        ui.totalOps.textContent = total.toString();
    }
    if (sheetLink) {
        sheetLink.href = buildSheetLink(kpis.config?.googleSheetId, "0");
        sheetLink.style.opacity = kpis.config?.googleSheetId ? "1" : "0.3";
    }
};