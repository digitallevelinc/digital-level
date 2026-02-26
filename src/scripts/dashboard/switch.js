// src/scripts/dashboard/switch.js
import { fUSDT, setSheetLinkState } from './utils.js';

export const updateSwitchSection = (kpis) => {
    const container = document.getElementById('wallet-switch');
    if (!container) return;

    const wallets = kpis.wallets || {};
    const data = wallets.switch || {};

    const mainValue = document.getElementById('switch-balance-total');
    const sheetLink = document.getElementById('link-switch-sheet');

    const ui = {
        inCount: document.getElementById('switch-in-count'),
        inVol: document.getElementById('switch-in-vol'),
        outCount: document.getElementById('switch-out-count'),
        outVol: document.getElementById('switch-out-vol'),
        totalOps: document.getElementById('switch-total-ops')
    };

    if (data) {
        const valIn = data.totalIn ?? 0;
        const valOut = data.totalOut ?? 0;
        const countIn = data.countIn ?? 0;
        const countOut = data.countOut ?? 0;

        // Balance desde data o root
        const actualBalance = data.balanceSwitch ?? wallets.balanceSwitch ?? 0;

        if (mainValue) {
            mainValue.textContent = fUSDT(actualBalance);
        }

        // Movimientos
        if (ui.inCount) ui.inCount.textContent = countIn.toString();
        if (ui.inVol) ui.inVol.textContent = fUSDT(valIn);

        if (ui.outCount) ui.outCount.textContent = countOut.toString();
        if (ui.outVol) ui.outVol.textContent = fUSDT(valOut);

        // Total de Operaciones
        if (ui.totalOps) {
            const total = data.totalOperations ?? (Number(countIn) + Number(countOut));
            ui.totalOps.textContent = total.toString();
        }
    }

    if (sheetLink) {
        setSheetLinkState(sheetLink, {
            sheetId: kpis.config?.googleSheetId,
            gid: "1474172895",
            enabledTitle: "Abrir Google Sheet SWITCH"
        });
    }
};
