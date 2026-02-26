import { fUSDT, setSheetLinkState } from './utils.js';

export const updateRedSection = (kpis) => {
    const container = document.getElementById('wallet-red');
    if (!container) return;

    // Estructura JSON: wallets: { red: { ... }, balanceRed: ... }
    const wallets = kpis.wallets || {};
    // Priorizamos el objeto anidado si existe para detalles, sino el root wallet
    const data = wallets.red || {};

    // Balance principal: JSON tiene wallets.balanceRed (root) y wallets.red.balanceRed (nested). Usamos root por consistencia.
    const mainBalance = wallets.balanceRed ?? data.balanceRed ?? 0;
    const mainValue = document.getElementById('red-balance-total');
    const sheetLink = document.getElementById('link-red-sheet');

    // Mapeo por IDs específicos
    const ui = {
        sentCount: document.getElementById('red-sent-count'),
        sentVol: document.getElementById('red-sent-vol'),
        receivedCount: document.getElementById('red-received-count'),
        receivedVol: document.getElementById('red-received-vol'),
        totalOps: document.getElementById('red-total-ops')
    };

    // Validamos si tenemos datos relevantes (balance o operaciones)
    if (data) {
        if (mainValue) mainValue.textContent = fUSDT(mainBalance);

        // Asignación de datos (Salidas/Enviado)
        const countOut = data.countOut ?? 0;
        const volOut = data.totalExpense ?? 0;

        if (ui.sentCount) ui.sentCount.textContent = countOut.toString();
        if (ui.sentVol) ui.sentVol.textContent = fUSDT(volOut);

        // Entradas/Recibido
        const countIn = data.countIn ?? 0;
        const volIn = data.totalIncome ?? 0;

        if (ui.receivedCount) ui.receivedCount.textContent = countIn.toString();
        if (ui.receivedVol) ui.receivedVol.textContent = fUSDT(volIn);

        // Total
        const total = data.totalOperations ?? (Number(countIn) + Number(countOut));
        if (ui.totalOps) ui.totalOps.textContent = total.toString();
    }

    if (sheetLink) {
        setSheetLinkState(sheetLink, {
            sheetId: kpis.config?.googleSheetId,
            enabledTitle: "Abrir Google Sheet RED"
        });
    }
};
