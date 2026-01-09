import { fUSDT, buildSheetLink } from './utils.js';

export const updateSwitchSection = (kpis) => {
    const container = document.getElementById('wallet-switch');
    if (!container) return;
    const data = kpis.wallets?.switch;
    const mainValue = container.querySelector('h3');
    const labels = container.querySelectorAll('span.font-mono');
    const sheetLink = document.getElementById('link-switch-sheet');

    if (data && Object.keys(data).length > 0) {
        if (mainValue) mainValue.textContent = fUSDT(data.balanceSwitch);
        if (labels.length >= 5) {
            labels[0].textContent = data.totalOperations ?? "0";
            labels[1].textContent = data.countIn ?? "0";
            labels[2].textContent = fUSDT(data.totalIn);
            labels[3].textContent = data.countOut ?? "0";
            labels[4].textContent = fUSDT(data.totalOut);
        }
    }
    if (sheetLink) {
        sheetLink.href = buildSheetLink(kpis.config?.googleSheetId, "1474172895");
        sheetLink.style.opacity = kpis.config?.googleSheetId ? "1" : "0.3";
    }
};