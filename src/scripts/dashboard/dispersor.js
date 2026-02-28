import { fUSDT, fVES } from './utils.js';

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = value;
    }
}

function setWidth(id, percent) {
    const el = document.getElementById(id);
    if (el) {
        el.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    }
}

function setHidden(id, hidden) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.toggle('hidden', hidden);
    }
}

function applyDashboardModeLayout(operatorMode) {
    const profitPanel = document.getElementById('dashboard-profit-panel');
    const dispersorPanel = document.getElementById('dashboard-dispersor-panel');
    const ciclosPanel = document.getElementById('dashboard-ciclos-panel');
    const isLocal = operatorMode === 'LOCAL';

    if (profitPanel) {
        profitPanel.classList.toggle('hidden', false);
        profitPanel.classList.toggle('lg:col-span-7', true);
        profitPanel.classList.remove('lg:col-span-12');
        profitPanel.classList.remove('lg:col-span-5');
    }

    if (dispersorPanel) {
        dispersorPanel.classList.toggle('hidden', isLocal);
        dispersorPanel.classList.toggle('lg:col-span-5', !isLocal);
        dispersorPanel.classList.remove('lg:col-span-12');
        dispersorPanel.classList.remove('lg:col-span-7');
    }

    if (ciclosPanel) {
        ciclosPanel.classList.toggle('lg:col-span-5', isLocal);
        ciclosPanel.classList.toggle('lg:col-span-12', !isLocal);
    }
}

function setBadge(label, tone = 'neutral') {
    const el = document.getElementById('dispersor-status-badge');
    if (!el) return;

    const tones = {
        neutral: 'border-white/10 bg-white/[0.04] text-white/70',
        warning: 'border-amber-500/20 bg-amber-500/10 text-amber-300',
        success: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
        info: 'border-blue-500/20 bg-blue-500/10 text-blue-200'
    };

    el.className = `inline-flex items-center px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-[0.22em] ${tones[tone] || tones.neutral}`;
    el.textContent = label;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function resolveOperatorMode(kpis = {}) {
    const configMode = String(kpis.config?.operatorMode || '').trim().toUpperCase();
    if (configMode === 'PRINCIPAL' || configMode === 'LOCAL' || configMode === 'MIXTO') {
        return configMode;
    }

    try {
        const stored = JSON.parse(localStorage.getItem('user_info') || '{}');
        const storedMode = String(stored.operatorMode || '').trim().toUpperCase();
        if (storedMode === 'PRINCIPAL' || storedMode === 'LOCAL' || storedMode === 'MIXTO') {
            return storedMode;
        }
    } catch (_error) {
        return 'MIXTO';
    }

    return 'MIXTO';
}

function getModeMeta(mode) {
    if (mode === 'PRINCIPAL') {
        return {
            eyebrow: 'Operador Principal / Dispersor',
            coverageLabel: 'Cobertura local del lote principal',
            statusLabel: 'Lectura correcta del principal'
        };
    }

    if (mode === 'LOCAL') {
        return {
            eyebrow: 'Operador Local',
            coverageLabel: 'El seguimiento principal vive en Ciclos Locales',
            statusLabel: 'Lectura correcta del operador local'
        };
    }

    return {
        eyebrow: 'Operador Mixto',
        coverageLabel: 'Cobertura local del lote con dispersion',
        statusLabel: 'Lectura correcta del operador'
    };
}

function renderReceivers(receivers = []) {
    const container = document.getElementById('dispersor-receivers-list');
    if (!container) return;

    if (!Array.isArray(receivers) || receivers.length === 0) {
        container.innerHTML = `
            <div class="py-8 text-center opacity-30">
                <p class="text-[10px] uppercase font-black tracking-[0.22em]">Sin receptores identificados</p>
                <p class="text-[11px] text-white/45 mt-2">La dispersion aparecera aqui cuando Sentinel detecte a quien salio cada lote.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = receivers.map((receiver) => {
        const coverage = Math.max(0, Math.min(100, Number(receiver.localCoveragePercent || 0)));
        const pending = Number(receiver.pendingUsdt || 0);
        const promised = Number(receiver.promisedUsdt || 0);
        const recovered = Number(receiver.recoveredUsdtLocal || 0);
        const activePromises = Number(receiver.activePromises || 0);
        const saleCount = Number(receiver.saleCount || 0);
        const matchType = receiver.matchType || 'unknown';
        const badgeClass = matchType === 'operator'
            ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
            : matchType === 'counterparty'
                ? 'border-blue-500/20 bg-blue-500/10 text-blue-200'
                : 'border-white/10 bg-white/[0.04] text-white/55';
        const badgeText = matchType === 'operator'
            ? 'Operador'
            : matchType === 'counterparty'
                ? 'Contraparte'
                : 'Sin match';

        return `
            <div class="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
                <div class="flex items-start justify-between gap-3 mb-3">
                    <div>
                        <div class="flex items-center gap-2 flex-wrap">
                            <p class="text-sm font-black tracking-tight text-white">${escapeHtml(receiver.receiverLabel || 'Sin receptor')}</p>
                            <span class="inline-flex items-center px-2 py-1 rounded-full border text-[9px] font-black uppercase tracking-[0.18em] ${badgeClass}">
                                ${badgeText}
                            </span>
                        </div>
                        <p class="text-[10px] text-white/40 uppercase font-black tracking-[0.16em] mt-2">
                            ${saleCount} lote${saleCount === 1 ? '' : 's'} | ${activePromises} activo${activePromises === 1 ? '' : 's'}
                        </p>
                    </div>
                    <div class="text-right">
                        <p class="text-lg font-mono font-black text-amber-300 tracking-tight">${coverage.toFixed(1)}%</p>
                        <p class="text-[10px] text-white/35 uppercase font-black tracking-[0.16em] mt-1">Cobertura local</p>
                    </div>
                </div>

                <div class="h-2 rounded-full overflow-hidden bg-white/5 border border-white/5 mb-3">
                    <div class="h-full bg-gradient-to-r from-emerald-500 to-emerald-300 transition-all duration-700" style="width: ${coverage}%"></div>
                </div>

                <div class="grid grid-cols-3 gap-3">
                    <div>
                        <p class="text-[9px] text-white/35 uppercase font-black tracking-[0.18em] mb-1">Promesa</p>
                        <p class="text-[13px] font-mono font-bold text-white">${fUSDT(promised)}</p>
                    </div>
                    <div>
                        <p class="text-[9px] text-white/35 uppercase font-black tracking-[0.18em] mb-1">Local</p>
                        <p class="text-[13px] font-mono font-bold text-emerald-300">${fUSDT(recovered)}</p>
                    </div>
                    <div>
                        <p class="text-[9px] text-white/35 uppercase font-black tracking-[0.18em] mb-1">Pendiente</p>
                        <p class="text-[13px] font-mono font-bold ${pending > 0 ? 'text-amber-300' : 'text-emerald-300'}">${fUSDT(pending)}</p>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function resolveStatus({ promisedUsdt, pendingUsdt, coveragePercent, activePromises }) {
    if (promisedUsdt <= 0.01 && activePromises === 0) {
        return {
            badge: 'Sin dispersion activa',
            tone: 'neutral',
            title: 'Sin promesas dispersas',
            note: 'El operador principal no tiene lotes abiertos bajo parseo 2.0 en este rango.'
        };
    }

    if (pendingUsdt <= 0.01) {
        return {
            badge: 'Cobertura local completa',
            tone: 'success',
            title: 'El lote ya fue absorbido localmente',
            note: 'La promesa activa ya regreso al flujo local. El principal no depende de recompras externas para cerrar este lote.'
        };
    }

    if (coveragePercent < 35) {
        return {
            badge: 'Dependencia externa alta',
            tone: 'warning',
            title: 'La venta abre el ciclo, pero el cierre vive fuera del P2P local',
            note: 'Esta vista separa la cobertura local del pendiente externo para que el principal no lea su ciclo como incompleto por error.'
        };
    }

    if (coveragePercent < 75) {
        return {
            badge: 'Cobertura mixta',
            tone: 'info',
            title: 'Parte del lote regreso localmente y parte sigue distribuida',
            note: 'El principal ya recupero una porcion del lote por P2P local, pero aun mantiene capital corriendo fuera del flujo local.'
        };
    }

    return {
        badge: 'Cobertura local dominante',
        tone: 'success',
        title: 'La mayor parte del lote ya regreso al operador principal',
        note: 'Queda un remanente fuera del P2P local, pero la lectura operativa principal ya esta mayormente cubierta dentro del dashboard.'
    };
}

export function updateDispersorUI(kpis = {}) {
    const dispersor = kpis.judge?.dispersor || kpis.dispersor || {};
    const receivers = Array.isArray(dispersor.receivers) ? dispersor.receivers : [];
    const operatorMode = resolveOperatorMode(kpis);
    const modeMeta = getModeMeta(operatorMode);

    const promisedUsdt = Number(dispersor.promisedUsdt || 0);
    const promisedFiat = Number(dispersor.promisedFiat || 0);
    const recoveredUsdtLocal = Number(dispersor.recoveredUsdtLocal || 0);
    const recoveredFiatLocal = Number(dispersor.recoveredFiatLocal || 0);
    const pendingUsdt = Number(dispersor.pendingUsdt || Math.max(0, promisedUsdt - recoveredUsdtLocal));
    const pendingFiat = Number(dispersor.pendingFiat || Math.max(0, promisedFiat - recoveredFiatLocal));
    const activePromises = Number(dispersor.activePromises || 0);

    const fallbackCoverage = promisedUsdt > 0 ? (recoveredUsdtLocal / promisedUsdt) * 100 : 0;
    const coveragePercent = Math.max(
        0,
        Math.min(100, Number(dispersor.localCoveragePercent ?? fallbackCoverage))
    );

    applyDashboardModeLayout(operatorMode);

    if (operatorMode === 'LOCAL') {
        return;
    }

    setText('dispersor-card-eyebrow', modeMeta.eyebrow);
    setText('dispersor-coverage-label', modeMeta.coverageLabel);
    setText('dispersor-status-label', modeMeta.statusLabel);
    setText('dispersor-coverage-value', `${coveragePercent.toFixed(1)}%`);
    setText('dispersor-promised-usdt', fUSDT(promisedUsdt));
    setText('dispersor-promised-fiat', fVES(promisedFiat));
    setText('dispersor-recovered-usdt', fUSDT(recoveredUsdtLocal));
    setText('dispersor-recovered-fiat', fVES(recoveredFiatLocal));
    setText('dispersor-pending-usdt', fUSDT(pendingUsdt));
    setText('dispersor-pending-fiat', fVES(pendingFiat));
    setText('dispersor-active-promises', activePromises.toString());

    setWidth('dispersor-local-bar', coveragePercent);
    setWidth('dispersor-pending-bar', promisedUsdt > 0 ? (pendingUsdt / promisedUsdt) * 100 : 0);

    const caption = promisedUsdt > 0
        ? `${fUSDT(recoveredUsdtLocal)} local | ${fUSDT(pendingUsdt)} fuera del P2P`
        : 'Esperando promesas activas';
    setText('dispersor-bar-caption', caption);

    const status = resolveStatus({
        promisedUsdt,
        pendingUsdt,
        coveragePercent,
        activePromises
    });

    renderReceivers(receivers);
    setBadge(status.badge, status.tone);
    setText('dispersor-status-title', status.title);
    setText('dispersor-status-note', status.note);
}
