import { fUSDT, buildSheetLink } from './utils.js';

export const updateP2PSection = (kpis) => {
    const container = document.getElementById('wallet-p2p-logic');
    if (!container) return;
    const data = kpis.operations; 
    const mainValue = document.getElementById('p2p-balance-total');
    const labels = container.querySelectorAll('span.font-mono');
    const sheetLink = document.getElementById('link-p2p-sheet');

    if (data && kpis.wallets) {
        if (mainValue) mainValue.textContent = fUSDT(kpis.wallets.balanceP2P);
        if (labels.length >= 4) {
            labels[0].textContent = data.buys?.count ?? "0";
            labels[1].textContent = fUSDT(data.buys?.totalUSDT ?? 0);
            labels[2].textContent = data.sells?.count ?? "0";
            labels[3].textContent = fUSDT(data.sells?.totalUSDT ?? 0);
        }
    }
    if (sheetLink) {
        sheetLink.href = buildSheetLink(kpis.config?.googleSheetId);
        sheetLink.style.opacity = kpis.config?.googleSheetId ? "1" : "0.3";
    }
};