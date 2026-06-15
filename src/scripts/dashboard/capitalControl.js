import { fVES, fUSDT } from './utils.js';

/**
 * Actualiza la tarjeta de Control de Capital en el dashboard del operador.
 * @param {Object} kpis - Objeto principal de la API (/api/kpis)
 */
export function updateCapitalControlUI(kpis = {}) {
    const card = document.getElementById('capital-control-card');
    const fiatEl = document.getElementById('capital-control-fiat');
    const usdtEl = document.getElementById('capital-control-usdt');
    const statusEl = document.getElementById('capital-control-status');
    const barConsumed = document.getElementById('capital-control-bar-consumed');
    const barPending = document.getElementById('capital-control-bar-pending');
    const expectedEl = document.getElementById('capital-control-expected');
    const consumedEl = document.getElementById('capital-control-consumed');

    if (!card) return;

    // Preferir capitalControl del backend si existe (nuevo campo)
    const cc = kpis.capitalControl;

    let totalPendingFiat = 0;
    let totalPendingUsdt = 0;
    let totalExpectedFiat = 0;
    let totalConsumedFiat = 0;
    let coveragePercent = 0;
    let status = 'ZERO';

    if (cc) {
        totalPendingFiat = Number(cc.totalPendingFiat || 0);
        totalPendingUsdt = Number(cc.totalPendingUsdtEquivalent || 0);
        totalExpectedFiat = Number(cc.totalExpectedFiat || 0);
        totalConsumedFiat = Number(cc.totalConsumedFiat || 0);
        coveragePercent = Number(cc.coveragePercent || 0);
        status = cc.status || 'ZERO';
    } else {
        // Fallback: calcular desde openVerdicts (compatibilidad con versiones anteriores del backend)
        const openVerdicts = Array.isArray(kpis.judge?.openVerdicts)
            ? kpis.judge.openVerdicts.filter((v) => {
                const s = String(v?.status || '').toUpperCase();
                return s !== 'CLOSED' && s !== 'CANCELLED';
            })
            : [];

        for (const verdict of openVerdicts) {
            const saleRate = Number(verdict?.saleRate || 0);
            const expectedUsdt = Number(verdict?.expectedRebuyUsdt ?? verdict?.saleAmount ?? 0);
            const fallbackFiat = Number(verdict?.fiatReceived || 0);
            const expectedFiat = Number(
                verdict?.expectedRebuyFiat ??
                (expectedUsdt > 0 && saleRate > 0 ? expectedUsdt * saleRate : fallbackFiat)
            );
            const consumedFiat = Number(verdict?.consumedRebuyFiat || 0);
            const remainingFiat = Number(verdict?.remainingFiat);
            const computedRemaining = Number.isFinite(remainingFiat)
                ? remainingFiat
                : Math.max(0, expectedFiat - consumedFiat);

            if (expectedFiat > 0) {
                totalExpectedFiat += expectedFiat;
                totalConsumedFiat += Math.max(0, expectedFiat - computedRemaining);
            }
        }

        totalPendingFiat = Math.max(0, totalExpectedFiat - totalConsumedFiat);
        coveragePercent = totalExpectedFiat > 0 ? (totalConsumedFiat / totalExpectedFiat) * 100 : 0;

        if (totalPendingFiat <= 0) {
            status = 'ZERO';
        } else if (coveragePercent >= 90) {
            status = 'LOW';
        } else if (coveragePercent <= 20) {
            status = 'CRITICAL';
        } else {
            status = 'NORMAL';
        }

        // Usar tasa de venta promedio para convertir a USDT
        const weightedSellRate = kpis.operations?.weightedAvgSellRate || kpis.rates?.sellRate || 0;
        totalPendingUsdt = weightedSellRate > 0 ? totalPendingFiat / weightedSellRate : 0;
    }

    // Actualizar DOM
    if (fiatEl) {
        fiatEl.textContent = fVES(totalPendingFiat);
    }
    if (usdtEl) {
        usdtEl.textContent = totalPendingUsdt > 0 ? `≈ ${fUSDT(totalPendingUsdt)}` : '≈ 0,00 USDT';
    }
    if (statusEl) {
        const statusMap = {
            ZERO: 'COMPLETADO',
            LOW: 'BAJO',
            NORMAL: 'NORMAL',
            CRITICAL: 'CRITICO',
        };
        statusEl.textContent = statusMap[status] || status;
    }

    if (barConsumed) {
        const pct = Math.min(100, Math.max(0, coveragePercent));
        barConsumed.style.width = `${pct}%`;
    }
    if (barPending) {
        const pct = Math.min(100, Math.max(0, 100 - coveragePercent));
        barPending.style.width = `${pct}%`;
    }

    if (expectedEl) {
        expectedEl.textContent = `${fVES(totalExpectedFiat)} Bs.`;
    }
    if (consumedEl) {
        consumedEl.textContent = `${fVES(totalConsumedFiat)} Bs.`;
    }

    // Aplicar clases de estado
    card.classList.remove('is-zero', 'is-critical');
    if (status === 'ZERO') {
        card.classList.add('is-zero');
    } else if (status === 'CRITICAL') {
        card.classList.add('is-critical');
    }
}
