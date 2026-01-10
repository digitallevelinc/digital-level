import { fUSDT, buildSheetLink } from './utils.js';

export const updatePaySection = (kpis) => {
    const container = document.getElementById('wallet-pay');
    if (!container) return;
    const data = kpis.wallets?.pay || kpis.wallets;
    const mainValue = document.getElementById('pay-balance-total');
    const labels = container.querySelectorAll('span.font-mono');
    const sheetLink = document.getElementById('link-pay-detail');

    if (data && (data.balancePay !== undefined)) {
        if (mainValue) mainValue.textContent = fUSDT(data.balancePay);
        if (labels.length >= 4) {
            labels[0].textContent = data.payReceivedCount ?? "0";
            labels[1].textContent = fUSDT(data.payReceivedVol ?? 0);
            labels[2].textContent = data.paySentCount ?? "0";
            labels[3].textContent = fUSDT(data.paySentVol ?? 0);
        }
    }
    if (sheetLink) {
        sheetLink.href = buildSheetLink(kpis.config?.googleSheetId, "0");
        sheetLink.style.opacity = kpis.config?.googleSheetId ? "1" : "0.3";
    }
};