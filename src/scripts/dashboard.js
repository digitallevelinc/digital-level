// src/scripts/dashboard.js

// Formateadores de moneda
export const fUSDT = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fVES = (v) => `${Number(v || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} VES`;

/**
 * Inyecta texto de forma segura en contenedores específicos
 */
export const inject = (id, value, isProfit = false) => {
    const container = document.getElementById(id);
    if (!container) return;
    const el = container.querySelector('h3') || container.querySelector('.text-white') || container.querySelector('span');
    if (el) {
        el.textContent = value !== undefined && value !== null ? value : "N/A";
        if (isProfit && value !== "N/A") {
            const num = parseFloat(String(value).replace(/[^0-9.-]+/g, ""));
            el.style.color = num >= 0 ? "#10b981" : "#ef4444";
        }
    }
};

/**
 * Procesa la lógica de la sección RED con los 5 valores específicos
 */
const updateRedSection = (kpis) => {
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
    } else {
        if (mainValue) mainValue.textContent = "N/A";
        labels.forEach(label => { label.textContent = "N/A"; });
    }

    if (sheetLink && kpis.config?.googleSheetId) {
        sheetLink.setAttribute('href', `https://docs.google.com/spreadsheets/d/${kpis.config.googleSheetId}`);
        sheetLink.style.opacity = "1";
        sheetLink.style.color = "#F3BA2F";
    } else if (sheetLink) {
        sheetLink.setAttribute('href', '#');
        sheetLink.style.opacity = "0.3";
    }
};

/**
 * FUNCIÓN PRINCIPAL DE ACTUALIZACIÓN
 */
export async function updateDashboard(API_BASE, token, alias) {
    if (!token) return;

    try {
        const [kpiRes, statsRes] = await Promise.all([
            fetch(`${API_BASE}/api/kpis`, { headers: { 'Authorization': `Bearer ${token}` } }),
            fetch(`${API_BASE}/api/stats`, { headers: { 'Authorization': `Bearer ${token}` } })
        ]);

        if (!kpiRes.ok || !statsRes.ok) throw new Error("Error en respuesta de servidor");

        const kpis = await kpiRes.json();
        const stats = await statsRes.json();

        const aliasEl = document.getElementById('operator-alias');
        if (aliasEl) aliasEl.textContent = alias || kpis.operatorAlias;
        
        const updateEl = document.getElementById('last-update');
        if (updateEl) {
            updateEl.textContent = `ACTUALIZADO: ${new Date().toLocaleTimeString()} (SENTINEL LIVE)`;
            updateEl.style.color = "#6b7280";
        }

        inject('kpi-balance', fUSDT(stats.currentBalance || kpis.critical.balanceTotal));
        inject('kpi-breakeven', fVES(kpis.critical.breakEvenRate));
        inject('kpi-margin', `${kpis.critical.globalMarginPercent.toFixed(2)}%`);
        inject('kpi-profit', fUSDT(kpis.critical.profitTotalUSDT), true);
        inject('kpi-cycle', fUSDT(kpis.critical.currentCycleProfit), true);
        inject('ops-count', kpis.operations.totalOperations);
        inject('ops-rates', `${fVES(kpis.operations.weightedAvgBuyRate)} / ${fVES(kpis.operations.weightedAvgSellRate)}`);
        inject('ops-buys', `${kpis.operations.buys.count} Órdenes`);
        inject('ops-sells', `${kpis.operations.sells.count} Órdenes`);
        inject('ops-fees', fUSDT(kpis.operations.totalFeesPaid));

        inject('wallet-p2p', fUSDT(kpis.wallets.balanceP2P));
        inject('wallet-switch', fUSDT(kpis.wallets.balanceSwitch));
        inject('wallet-pay', fUSDT(kpis.wallets.balancePay));
        inject('wallet-fiat', fVES(kpis.wallets.balanceFiat));

        updateRedSection(kpis);

        const tableBody = document.getElementById('bank-table-body');
        if (tableBody && kpis.bankInsights) {
            tableBody.innerHTML = kpis.bankInsights.map((b) => `
                <tr class="hover:bg-white/[0.02] border-l-4 border-l-gray-700">
                    <td class="px-3 py-4 font-bold text-white">${b.bank}</td>
                    <td class="px-3 py-4 text-center font-mono">${fVES(b.fiatBalance)}</td>
                    <td class="px-3 py-4 text-center font-mono">${fVES(b.avgBuyRate)}</td>
                    <td class="px-3 py-4 text-center font-mono">${fVES(b.avgSellRate)}</td>
                    <td class="px-3 py-4 text-center font-mono">${b.margin.toFixed(2)}%</td>
                    <td class="px-3 py-4 text-center font-bold" style="color: ${b.profit >= 0 ? '#10b981' : '#ef4444'}">${fUSDT(b.profit)}</td>
                </tr>
            `).join('');
        }
    } catch (err) {
        console.error("Error en sincronización:", err);
        const updateEl = document.getElementById('last-update');
        if (updateEl) {
            updateEl.textContent = "⚠️ ERROR DE CONEXIÓN - VALORES EN N/A";
            updateEl.style.color = "#ef4444";
        }
        updateRedSection({});
    }
}

/**
 * NUEVA FUNCIÓN: INICIALIZACIÓN (Llamada desde Astro)
 * Orquestra el login, el logout y el intervalo
 */
export function initDashboard() {
    const API_BASE = "http://144.91.110.204:3003";
    const token = localStorage.getItem('session_token');
    const alias = localStorage.getItem('operator_alias');

    // 1. Configurar Logout (Independiente de la carga de datos)
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.onclick = () => {
            localStorage.clear();
            window.location.href = "/login";
        };
    }

    // 2. Validar sesión
    if (!token) {
        window.location.href = "/login";
        return;
    }

    // 3. Primera carga
    updateDashboard(API_BASE, token, alias);

    // 4. Ciclo de actualización
    const interval = setInterval(() => {
        updateDashboard(API_BASE, token, alias);
    }, 30000);

    // Limpieza de intervalo para Astro
    document.addEventListener('astro:before-preparation', () => clearInterval(interval));
}