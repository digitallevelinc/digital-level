import { fUSDT, buildSheetLink } from './utils.js';

export const updateRedSection = (kpis) => {
    const container = document.getElementById('wallet-red');
    if (!container) return;
    const data = kpis.wallets?.red;
    const mainValue = container.querySelector('h3');
    const labels = container.querySelectorAll('span.font-mono');
    const sheetLink = document.getElementById('link-red-sheet');

    if (data && Object.keys(data).length > 0) {
        if (mainValue) mainValue.textContent = fUSDT(data.balanceRed);
        if (labels.length >= 5) {
            labels[0].textContent = data.totalOperations ?? "0";
            labels[1].textContent = data.countIn ?? "0";
            labels[2].textContent = fUSDT(data.totalIncome);
            labels[3].textContent = data.countOut ?? "0";
            labels[4].textContent = fUSDT(data.totalExpense);
        }
    }
    if (sheetLink) {
        sheetLink.href = buildSheetLink(kpis.config?.googleSheetId);
        sheetLink.style.opacity = kpis.config?.googleSheetId ? "1" : "0.3";
    }
};