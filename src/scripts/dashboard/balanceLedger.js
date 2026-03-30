const CARACAS_TZ = 'America/Caracas';
const LEDGER_CHANNELS = Object.freeze(['RED', 'P2P', 'PAY']);
const LEDGER_FILTER_OPTIONS = Object.freeze(['ALL', ...LEDGER_CHANNELS]);
const LEDGER_CHANNEL_SET = new Set(LEDGER_CHANNELS);

const state = {
    apiBase: '',
    token: '',
    range: {},
    kpis: {},
    syncKey: '',
    page: 1,
    limit: 12,
    total: 0,
    totalPages: 0,
    loadedOnce: false,
    needsRefresh: true,
    initialized: false,
    requestSeq: 0,
    abortController: null,
    onAuthError: null,
    searchTerm: '',
    typeFilter: 'ALL',
    currentTransfers: [],
    pageNetByPage: new Map(),
    bankData: [],
    closingBalance: null,
};

const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatNumber = (value, decimals = 2, locale = 'es-VE') => Number(value || 0).toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
});

const formatUsd = (value) => `$${formatNumber(value, 2, 'en-US')}`;
const toFiniteNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};
const normalizeTextToken = (value) => String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
const WRAPPED_NOTE_PATTERN = /[\(\{]\s*([^\)\}]+?)\s*[\)\}]/s;
const PLAIN_NOTE_PATTERN = /^\s*([^()\{\}\n]+?)\s*$/s;
const PROMISE_ACTIVATION_MAX_USDT = 1.0;

const normalizeTxType = (tx = {}) => {
    const rawType = String(tx?.type || '').toUpperCase().trim();
    if (!rawType) {
        const tradeType = String(tx?.tradeType || '').toUpperCase().trim();
        if (tradeType === 'BUY') return 'P2P_BUY';
        if (tradeType === 'SELL') return 'P2P_SELL';
        return '';
    }

    if (rawType === 'P2P_BUY' || rawType === 'P2P_SELL') return rawType;

    // Some ledger rows arrive as generic P2P with a tradeType field (BUY/SELL).
    if (rawType === 'P2P' || rawType === 'P2P_TRADE' || rawType === 'P2P_ORDER') {
        const tradeType = String(tx?.tradeType || '').toUpperCase().trim();
        if (tradeType === 'BUY') return 'P2P_BUY';
        if (tradeType === 'SELL') return 'P2P_SELL';
    }

    return rawType;
};

const isSettlementTransfer = (tx = {}) => {
    const excludedReason = String(tx?.excludedReason || '').trim().toUpperCase();
    if (excludedReason === 'INTER_OPERATOR_SETTLEMENT') return true;

    const note = normalizeTextToken(tx?.notes || '');
    if (!note) return false;
    return /\bliq\b/.test(note) || /\bliquidacion\b/.test(note) || /\bliquidar\b/.test(note);
};

const getCategory = (type) => {
    if (!type) return 'OTRO';
    if (type === 'DISPERSOR_PENDING') return 'PARSEO';
    if (type.startsWith('P2P_')) return 'P2P';
    if (type.startsWith('PAY_')) return 'PAY';
    if (type === 'DEPOSIT' || type === 'WITHDRAWAL' || type === 'DIVIDEND') return 'RED';
    if (type === 'INTERNAL_TRANSFER') return 'SWITCH';
    return 'OTRO';
};

const isLedgerChannelAllowed = (tx = {}) => {
    const category = getCategory(String(tx?.type || '').toUpperCase());
    if (state.typeFilter !== 'ALL') {
        return category === state.typeFilter;
    }
    return LEDGER_CHANNEL_SET.has(category);
};

const getRequestedChannels = () => state.typeFilter === 'ALL'
    ? [...LEDGER_CHANNELS]
    : [state.typeFilter];

const getDirection = (type) => {
    switch (String(type || '').toUpperCase()) {
        case 'P2P_BUY':
        case 'PAY_RECEIVED':
        case 'DEPOSIT':
        case 'DIVIDEND':
            return 1;
        case 'P2P_SELL':
        case 'PAY_SENT':
        case 'WITHDRAWAL':
            return -1;
        default:
            return 0;
    }
};

const getSignedAmount = (tx = {}) => {
    const type = normalizeTxType(tx);
    const status = String(tx?.status || '').toUpperCase();
    const asset = String(tx?.asset || '').toUpperCase();
    const pm = String(tx?.paymentMethod || '').toUpperCase();
    const walletFrom = String(tx?.walletFrom || '').toUpperCase();
    const walletTo = String(tx?.walletTo || '').toUpperCase();
    const amount = toFiniteNumber(tx?.amount);

    if (!amount) return 0;
    if (status && status !== 'SUCCESS') return 0;

    // Balance corrido del modulo: solo USDT.
    if (asset && asset !== 'USDT') return 0;

    let delta = 0;

    switch (type) {
        case 'P2P_BUY':
        case 'PAY_RECEIVED':
        case 'DEPOSIT':
        case 'DIVIDEND':
            delta += amount;
            break;
        case 'P2P_SELL':
        case 'PAY_SENT':
        case 'WITHDRAWAL':
            delta -= amount;
            break;
        case 'CONVERT':
        case 'SPOT_TRADE':
            if (pm === 'CONVERT_IN' || pm === 'SPOT_SELL') delta += amount;
            else if (pm === 'CONVERT_OUT' || pm === 'SPOT_BUY') delta -= amount;
            break;
        case 'INTERNAL_TRANSFER': {
            const monitored = new Set(['MAIN', 'FUNDING', 'SPOT']);
            const fromMonitored = monitored.has(walletFrom);
            const toMonitored = monitored.has(walletTo);
            if (fromMonitored && !toMonitored) delta -= amount;
            else if (!fromMonitored && toMonitored) delta += amount;
            break;
        }
        default:
            break;
    }

    const fee = toFiniteNumber(tx?.fee);
    const feeCurrency = String(tx?.feeCurrency || '').toUpperCase();
    if (fee > 0 && (!feeCurrency || feeCurrency === 'USDT')) {
        delta -= fee;
    }

    return delta;
};

const getLedgerAnchorBalance = (kpis = {}) => {
    const payloadClosingBalance = Number(state.closingBalance);
    const candidates = [
        kpis?.metrics?.totalBalance,
        kpis?.currentBalance,
        kpis?.audit?.realBalance,
        kpis?.metrics?.balance,
        kpis?.summary?.balance,
    ];
    const verifiedWalletBalance = candidates.reduce((found, candidate) => {
        if (Number.isFinite(found)) return found;
        const numeric = Number(candidate);
        return Number.isFinite(numeric) ? numeric : found;
    }, Number.NaN);
    const todayKey = new Intl.DateTimeFormat('en-CA', {
        timeZone: CARACAS_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date());
    const rangeFrom = sanitizeDateValue(state.range?.from);
    const rangeTo = sanitizeDateValue(state.range?.to);
    const isLiveRange = !rangeTo || rangeTo === todayKey || (!rangeFrom && !rangeTo);

    if (isLiveRange && Number.isFinite(verifiedWalletBalance)) {
        return verifiedWalletBalance;
    }

    if (Number.isFinite(payloadClosingBalance)) {
        return payloadClosingBalance;
    }

    const premiumLedgerBalance = Number(kpis?.premiumLedgerBalance);
    if (Number.isFinite(premiumLedgerBalance)) {
        return premiumLedgerBalance;
    }

    const wallets = kpis?.wallets || {};
    const isolatedWalletsSum = Number(wallets.balanceP2P || 0)
        + Number(wallets.balancePay || 0);

    if (Number.isFinite(isolatedWalletsSum)) {
        return isolatedWalletsSum;
    }

    if (Number.isFinite(verifiedWalletBalance)) {
        return verifiedWalletBalance;
    }

    const walletsSum = Number(wallets.balanceP2P || 0)
        + Number(wallets.balancePay || 0);

    return Number.isFinite(walletsSum) ? walletsSum : 0;
};

const getKnownNetBeforePage = (page) => {
    if (page <= 1) return 0;

    let netBefore = 0;
    for (let i = 1; i < page; i += 1) {
        if (!state.pageNetByPage.has(i)) return null;
        netBefore += Number(state.pageNetByPage.get(i) || 0);
    }

    return netBefore;
};

const getCategoryTone = (category) => {
    switch (category) {
        case 'P2P':
            return 'text-[#f7c948]';
        case 'PAY':
            return 'text-sky-300';
        case 'LIQUID':
            return 'text-rose-300';
        case 'RED':
            return 'text-violet-300';
        case 'SWITCH':
            return 'text-emerald-300';
        case 'PARSEO':
            return 'text-amber-500';
        default:
            return 'text-white/55';
    }
};

const getCategoryChipClass = (category) => {
    switch (category) {
        case 'P2P':
            return 'ledger-chip ledger-chip-p2p';
        case 'PAY':
            return 'ledger-chip ledger-chip-pay';
        case 'LIQUID':
            return 'ledger-chip ledger-chip-liquid';
        case 'RED':
            return 'ledger-chip ledger-chip-red';
        case 'SWITCH':
            return 'ledger-chip ledger-chip-switch';
        case 'PARSEO':
            return 'ledger-chip ledger-chip-parseo';
        default:
            return 'ledger-chip ledger-chip-neutral';
    }
};

const getRowToneClass = (category) => {
    switch (category) {
        case 'P2P':
            return 'ledger-row-p2p';
        case 'PAY':
            return 'ledger-row-pay';
        case 'LIQUID':
            return 'ledger-row-liquid';
        case 'PARSEO':
            return 'ledger-row-parseo';
        default:
            return 'ledger-row-neutral';
    }
};

const formatPostingDate = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
        timeZone: CARACAS_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
};

const formatRate = (rate) => {
    const n = Number(rate || 0);
    return n > 0 ? `RATE ${formatNumber(n, 2)}` : '';
};

const formatFeeMeta = (tx) => {
    const fee = toFiniteNumber(tx?.fee);
    if (fee <= 0) return '';
    return `FEE ${formatUsd(fee)}`;
};

const parseStructuredNote = (note) => {
    const raw = String(note ?? '').trim();
    if (!raw) return null;

    const wrapped = raw.match(WRAPPED_NOTE_PATTERN);
    const plain = wrapped ? null : raw.match(PLAIN_NOTE_PATTERN);
    const payload = wrapped?.[1]?.trim() ?? plain?.[1]?.trim();
    if (!payload) return null;

    const parts = payload
        .split(/[;:]/)
        .map((part) => part.trim())
        .filter(Boolean);

    if (parts.length < 2) return null;
    return { raw, parts };
};

const parseFlexibleNumber = (value) => {
    const cleaned = String(value ?? '').replace(/[^\d.,]/g, '');
    if (!cleaned) return 0;

    let normalized = cleaned;
    if (cleaned.includes(',') && cleaned.includes('.')) {
        normalized = cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')
            ? cleaned.replace(/\./g, '').replace(',', '.')
            : cleaned.replace(/,/g, '');
    } else if (cleaned.includes(',')) {
        normalized = cleaned.replace(',', '.');
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
};

const hasPromiseHint = (token) => {
    const s = String(token ?? '').toLowerCase();
    return s.includes('$') || /\b(usdt|usd|promesa|promise|prom)\b/.test(s);
};

const getPromiseMeta = (tx = {}) => {
    if (tx?.syntheticPromiseMeta) return tx.syntheticPromiseMeta;
    const type = String(tx?.type || '').toUpperCase();
    if (type !== 'PAY_SENT' && type !== 'PAY_RECEIVED') return null;

    const structured = parseStructuredNote(tx?.notes);
    if (!structured) return null;

    // Standard 3-part format: (BANK; RATE; PROMISE_USDT)
    // 2-part promise format:  (BANK; $PROMISE_USDT) — rate inferred from tx
    let promiseUsdt = parseFlexibleNumber(structured.parts[2]);
    let exchangeRate;

    if (promiseUsdt > 0) {
        const noteRate = parseFlexibleNumber(structured.parts[1]);
        exchangeRate = noteRate > 0 ? noteRate : getTxRate(tx);
    } else if (structured.parts.length === 2 && hasPromiseHint(structured.parts[1])) {
        promiseUsdt = parseFlexibleNumber(structured.parts[1]);
        exchangeRate = getTxRate(tx);
    }

    if (promiseUsdt <= 0) return null;
    if (!exchangeRate || exchangeRate <= 0) return null;

    const txAmountUsdt = Math.abs(Number(tx?.amount || 0));
    const txAmountFiat = resolveFiatAmount(tx);
    const promisedFiat = promiseUsdt * exchangeRate;
    const isReceiver = type === 'PAY_RECEIVED';

    // Convencion operativa: las promesas se activan con un micro-monto (0.01 USDT).
    // Si PAY_RECEIVED trae un monto mayor, no se considera parte del flujo de promesa.
    if (isReceiver && txAmountUsdt > PROMISE_ACTIVATION_MAX_USDT) {
        return null;
    }

    // PAY_RECEIVED se usa como activador de promesa (ej: 0.01 con nota),
    // no como abono real que deba descontar del pendiente de la promesa.
    const actualUsdt = isReceiver ? 0 : txAmountUsdt;
    const actualFiat = isReceiver ? 0 : txAmountFiat;
    const pendingUsdt = Math.max(0, promiseUsdt - actualUsdt);
    const pendingFiat = Math.max(0, promisedFiat - actualFiat);

    return {
        rawNote: structured.raw,
        exchangeRate,
        promiseUsdt,
        promisedFiat,
        actualUsdt,
        actualFiat,
        pendingUsdt,
        pendingFiat,
        isReceiver,
    };
};

const getFiatLabel = (tx = {}) => {
    const fiatCurrency = String(tx?.fiatCurrency || '').trim().toUpperCase();
    if (fiatCurrency) return fiatCurrency;

    const type = String(tx?.type || '').toUpperCase();
    const hasFiatSignal = Number(tx?.fiatAmount || 0) > 0 || Number(tx?.exchangeRate || 0) > 0;
    if ((type === 'PAY_SENT' || type === 'PAY_RECEIVED') && hasFiatSignal) {
        return 'VES';
    }

    return 'FIAT';
};

const maskCounterpartyName = (value) => {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    return raw;
};

const buildDescriptionTop = (tx) => {
    if (tx?.counterpartyName) return maskCounterpartyName(tx.counterpartyName);
    return tx?.notes || tx?.paymentMethod || 'Movimiento sin detalle';
};

const buildDescriptionMeta = (tx, topLine = '') => {
    const parts = [];
    const rateText = formatRate(tx?.exchangeRate);
    const feeText = formatFeeMeta(tx);
    const status = String(tx?.status || '').toUpperCase();
    const asset = String(tx?.asset || '').toUpperCase();
    const fiatCurrency = String(tx?.fiatCurrency || '').toUpperCase();
    const promiseMeta = getPromiseMeta(tx);
    const orderNumber = String(tx?.orderNumber || '').trim();

    // Keep sender/receiver identity only in the top line to avoid redundancy.
    if (asset) parts.push(asset);
    if (fiatCurrency) parts.push(fiatCurrency);
    if (feeText) parts.push(feeText);
    if (rateText) parts.push(rateText);
    if (orderNumber) parts.push(`ORD ${orderNumber}`);
    if (tx?.tradeType) parts.push(`TRADE ${tx.tradeType}`);
    if (tx?.counterpartyId && tx?.counterpartyName !== topLine) {
        parts.push(`ID ${tx.counterpartyId}`);
    }
    if (tx?.walletFrom || tx?.walletTo) {
        parts.push(`${tx.walletFrom || '?'}->${tx.walletTo || '?'}`);
    }
    if (status && status !== 'SUCCESS') parts.push(`STATUS ${status}`);
    if (tx?.notes && tx?.notes !== topLine && tx.notes !== promiseMeta?.rawNote) parts.push(tx.notes);
    return parts;
};

const getTxRate = (tx) => {
    const directRate = Number(tx?.exchangeRate || 0);
    if (directRate > 0) return directRate;

    const amount = Math.abs(Number(tx?.amount || 0));
    const fiatAmount = Math.abs(Number(tx?.fiatAmount || 0));
    if (amount > 0 && fiatAmount > 0) return fiatAmount / amount;

    return 0;
};

const resolveFiatAmount = (tx) => {
    const fiatAmount = Math.abs(Number(tx?.fiatAmount || 0));
    if (fiatAmount > 0) return fiatAmount;

    const amount = Math.abs(Number(tx?.amount || 0));
    if (amount <= 0) return 0;

    const rate = getTxRate(tx);
    if (rate > 0) return amount * rate;

    // Ultimo recurso: mostrar el monto base como FIAT para evitar huecos de datos en UI.
    return amount;
};

const formatFiat = (tx) => {
    const type = String(tx?.type || '').toUpperCase();
    if ((type === 'PAY_SENT' || type === 'PAY_RECEIVED') && !getPromiseMeta(tx)) {
        return '';
    }

    const fiatResolved = resolveFiatAmount(tx);
    return `${formatNumber(fiatResolved, 2)} ${getFiatLabel(tx)}`;
};

const formatAmount = (tx) => {
    if (tx?.type === 'DISPERSOR_PENDING') return 'INFO';
    const type = normalizeTxType(tx);
    const direction = getDirection(type);
    const amount = Number(tx?.amount || 0);
    const sign = direction < 0 ? '-' : direction > 0 ? '+' : '';

    // Display net amount for P2P buys when fee is in USDT.
    const fee = toFiniteNumber(tx?.fee);
    const feeCurrency = String(tx?.feeCurrency || '').toUpperCase();
    const effectiveFee = fee > 0 && (!feeCurrency || feeCurrency === 'USDT') ? fee : 0;
    const absAmount = Math.abs(amount);
    const displayBase = (type === 'P2P_BUY' && direction > 0)
        ? Math.max(0, absAmount - effectiveFee)
        : (type === 'P2P_SELL' && direction < 0)
            ? (absAmount + effectiveFee)
            : absAmount;

    return `${sign}${formatUsd(displayBase)}`;
};

const formatPromiseUsdt = (value) => `${formatNumber(Math.abs(Number(value || 0)), 2, 'en-US')} USDT`;

const formatPromiseFiat = (value, tx) => `${formatNumber(Math.abs(Number(value || 0)), 2)} ${getFiatLabel(tx)}`;

const renderReceiversDetail = (receivers = []) => {
    if (!receivers.length) return '';
    const sorted = [...receivers].sort((a, b) => Number(b?.pendingUsdt || 0) - Number(a?.pendingUsdt || 0));
    const rows = sorted.map((r) => {
        const alias = escapeHtml(r.receiverOperatorAlias || r.receiverLabel || 'Desconocido');
        const promised = Number(r.promisedUsdt || 0);
        const pending = Number(r.pendingUsdt || 0);
        const recovered = Number(r.recoveredUsdtLocal || 0);
        const coverage = Number(r.localCoveragePercent || 0);
        const active = Number(r.activePromises || 0);
        const pendingFiat = Number(r.pendingFiat || 0);
        const isFulfilled = pending < 0.01;
        const barPct = promised > 0 ? Math.min(100, ((promised - pending) / promised) * 100) : 0;
        const statusClass = isFulfilled ? 'dispersor-fulfilled' : pending > promised * 0.5 ? 'dispersor-critical' : 'dispersor-partial';
        return `
            <div class="dispersor-receiver-row ${statusClass}">
                <div class="dispersor-receiver-identity">
                    <span class="dispersor-receiver-avatar">${escapeHtml(alias.charAt(0).toUpperCase())}</span>
                    <div class="dispersor-receiver-info">
                        <span class="dispersor-receiver-name">${alias}</span>
                        <span class="dispersor-receiver-meta">${active} promesa${active !== 1 ? 's' : ''} activa${active !== 1 ? 's' : ''}</span>
                    </div>
                </div>
                <div class="dispersor-receiver-amounts">
                    <div class="dispersor-receiver-line">
                        <span class="dispersor-receiver-label">Prometido</span>
                        <span class="dispersor-receiver-value">${formatNumber(promised, 2, 'en-US')} USDT</span>
                    </div>
                    <div class="dispersor-receiver-line">
                        <span class="dispersor-receiver-label">Recuperado</span>
                        <span class="dispersor-receiver-value dispersor-value-recovered">${formatNumber(recovered, 2, 'en-US')} USDT</span>
                    </div>
                    <div class="dispersor-receiver-line">
                        <span class="dispersor-receiver-label">Pendiente</span>
                        <span class="dispersor-receiver-value ${isFulfilled ? 'dispersor-value-ok' : 'dispersor-value-pending'}">${isFulfilled ? 'Cubierto' : `${formatNumber(pending, 2, 'en-US')} USDT`}</span>
                    </div>
                    <div class="dispersor-receiver-bar-wrap">
                        <div class="dispersor-receiver-bar" style="width:${barPct.toFixed(1)}%"></div>
                    </div>
                </div>
            </div>`;
    }).join('');
    return `<div class="dispersor-receivers-panel" id="dispersor-receivers-panel" style="display:none">
        <div class="dispersor-receivers-header">
            <span class="dispersor-receivers-title">Desglose por dispersor</span>
            <span class="dispersor-receivers-count">${sorted.length} dispersor${sorted.length !== 1 ? 'es' : ''}</span>
        </div>
        <div class="dispersor-receivers-list">${rows}</div>
    </div>`;
};

const renderMetricCard = ({ label, value, sub = '', tone = '' }) => `
    <div class="ledger-metric-card ${tone}">
        <span class="ledger-metric-label">${escapeHtml(label)}</span>
        <span class="ledger-metric-value">${escapeHtml(value)}</span>
        <span class="ledger-metric-sub">${escapeHtml(sub)}</span>
    </div>
`;

const renderPromiseColumnMeta = (tx) => {
    const promiseMeta = getPromiseMeta(tx);
    if (!promiseMeta) {
        return renderMetricCard({
            label: 'Promesa',
            value: '--',
            sub: 'Sin promesa activa',
            tone: 'ledger-metric-muted'
        });
    }

    const isInternalCoverage = promiseMeta.isReceiver
        && Boolean(tx?.isInternalCounterparty || tx?.internalCounterpartyAlias);

    if (String(tx?.type || '').toUpperCase() === 'DISPERSOR_PENDING') {
        const localSummary = promiseMeta.actualUsdt > 0.009
            ? `Local ${formatPromiseUsdt(promiseMeta.actualUsdt)}`
            : 'Sin cobertura local';
        const pendingSummary = promiseMeta.pendingUsdt > 0.009
            ? `Pendiente ${formatPromiseUsdt(promiseMeta.pendingUsdt)}`
            : 'Cobertura completa';

        return renderMetricCard({
            label: 'Promesa total',
            value: formatPromiseUsdt(promiseMeta.promiseUsdt),
            sub: `${localSummary} | ${pendingSummary}`,
            tone: 'ledger-metric-promise'
        });
    }

    if (isInternalCoverage) {
        const internalAlias = String(tx?.internalCounterpartyAlias || tx?.counterpartyName || '').trim();
        const coverageSummary = promiseMeta.pendingUsdt > 0.009
            ? `Pendiente ${formatPromiseUsdt(promiseMeta.pendingUsdt)}`
            : 'Cobertura registrada';
        const actorSummary = internalAlias ? `Equipo ${internalAlias}` : 'Equipo interno';

        return renderMetricCard({
            label: 'Cobertura interna',
            value: formatPromiseUsdt(promiseMeta.promiseUsdt),
            sub: `${actorSummary} | ${coverageSummary}`,
            tone: 'ledger-metric-warning'
        });
    }

    const promiseLabel = promiseMeta.isReceiver ? 'Promesa recibida' : 'Promesa';
    const pendingSummary = promiseMeta.isReceiver
        ? (promiseMeta.pendingUsdt > 0.009
            ? `Pendiente ${formatPromiseUsdt(promiseMeta.pendingUsdt)}`
            : 'Promesa cubierta')
        : formatPromiseFiat(promiseMeta.promisedFiat, tx);

    return renderMetricCard({
        label: promiseLabel,
        value: formatPromiseUsdt(promiseMeta.promiseUsdt),
        sub: pendingSummary,
        tone: promiseMeta.isReceiver ? 'ledger-metric-warning' : 'ledger-metric-promise'
    });
};

const getElements = () => ({
    panel: document.getElementById('balance-ledger-panel'),
    body: document.getElementById('balance-ledger-body'),
    count: document.getElementById('balance-ledger-count'),
    results: document.getElementById('balance-ledger-results'),
    pageIndicator: document.getElementById('balance-ledger-page-indicator'),
    prevBtn: document.getElementById('balance-ledger-prev'),
    nextBtn: document.getElementById('balance-ledger-next'),
    scroll: document.getElementById('balance-ledger-scroll'),
    searchInput: document.getElementById('balance-ledger-search'),
    typeFilters: Array.from(document.querySelectorAll('[data-ledger-type]')),
});

const sanitizeDateValue = (value) => {
    const trimmed = String(value ?? '').trim();
    return trimmed || undefined;
};

const isSameRange = (a = {}, b = {}) => sanitizeDateValue(a?.from) === sanitizeDateValue(b?.from)
    && sanitizeDateValue(a?.to) === sanitizeDateValue(b?.to);

const buildTransfersUrl = (apiBase, range = {}, page = 1, limit = 12, includeChannels = true) => {
    const params = new URLSearchParams();
    const from = sanitizeDateValue(range?.from);
    const to = sanitizeDateValue(range?.to);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    params.set('page', String(page));
    params.set('limit', String(limit));
    if (includeChannels) {
        params.set('channels', getRequestedChannels().join(','));
    }
    params.set('_ts', String(Date.now()));
    return `${String(apiBase || '').replace(/\/+$/, '')}/api/transfers?${params.toString()}`;
};

const updatePaginationUI = () => {
    const { results, pageIndicator, prevBtn, nextBtn } = getElements();
    if (results) results.textContent = `${state.total} Resultados`;
    if (pageIndicator) pageIndicator.textContent = `Pagina ${state.totalPages ? state.page : 0} / ${state.totalPages}`;
    if (prevBtn) prevBtn.disabled = state.page <= 1 || state.totalPages === 0;
    if (nextBtn) nextBtn.disabled = state.page >= state.totalPages || state.totalPages === 0;
};

const updateTypeFilterUI = () => {
    const { typeFilters } = getElements();
    typeFilters.forEach((button) => {
        const buttonType = String(button?.dataset?.ledgerType || '').toUpperCase();
        button.classList.toggle('is-active', buttonType === state.typeFilter);
        button.setAttribute('aria-pressed', buttonType === state.typeFilter ? 'true' : 'false');
    });
};

const renderPlaceholder = (message, toneClass = 'text-white') => {
    const { body } = getElements();
    if (!body) return;
    body.innerHTML = `
        <div class="px-4 py-10 text-center text-[15px] font-medium ${toneClass} md:px-6">
            ${escapeHtml(message)}
        </div>
    `;
};

const renderLoading = () => {
    const { count } = getElements();
    if (count) count.textContent = `Cargando pagina ${state.page}...`;
    renderPlaceholder('Cargando historial...');
};

const renderError = (message) => {
    const { count } = getElements();
    if (count) count.textContent = 'No se pudo cargar el historial';
    state.total = 0;
    state.totalPages = 0;
    state.closingBalance = null;
    updatePaginationUI();
    renderPlaceholder(message, 'text-rose-300');
};

const renderEmpty = () => {
    const { count } = getElements();
    if (count) count.textContent = 'Sin movimientos en el rango actual';
    state.total = 0;
    state.totalPages = 0;
    state.currentTransfers = [];
    updatePaginationUI();
    renderPlaceholder('Sin movimientos para el rango seleccionado.');
};

const matchesSearch = (tx, searchTerm) => {
    const needle = String(searchTerm || '').trim().toLowerCase();
    if (!needle) return true;

    const haystack = [
        tx?.counterpartyName,
        tx?.paymentMethod,
        tx?.notes,
        tx?.orderNumber,
        tx?.txHash,
        tx?.binanceRawId,
        tx?.type,
        tx?.fiatCurrency,
        formatRate(tx?.exchangeRate),
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

    return haystack.includes(needle);
};

const buildRowsWithBalance = (transfers = []) => {
    let rows = Array.isArray(transfers) ? [...transfers] : [];
    
    if (state.page === 1) {
        const dispersor = state.kpis?.judge?.dispersor || state.kpis?.dispersor;
        const pendingUsdt = Number(dispersor?.pendingUsdt || 0);
        const promisedUsdt = Number(dispersor?.promisedUsdt || 0);
        const activePromises = Number(dispersor?.activePromises || 0);
        
        if (promisedUsdt > 0 || activePromises > 0) {
            const pendingFiat = Number(dispersor?.pendingFiat || 0);
            const recoveredUsdt = Number(dispersor?.recoveredUsdtLocal || 0);
            const recoveredFiat = Number(dispersor?.recoveredFiatLocal || 0);
            const promisedFiat = Number(dispersor?.promisedFiat || 0);
            
            const syntheticTx = {
                id: 'synthetic-dispersor',
                timestamp: Date.now(),
                type: 'DISPERSOR_PENDING',
                amount: 0,
                asset: 'USDT',
                fiatAmount: 0,
                fiatCurrency: 'VES',
                status: 'PENDING',
                counterpartyName: 'Cobertura local consolidada',
                notes: 'Parseo 2.0 integrado al balance general.',
                paymentMethod: 'BALANCE GENERAL',
                syntheticPromiseMeta: {
                    isReceiver: true,
                    promiseUsdt: promisedUsdt,
                    promisedFiat: promisedFiat > 0 ? promisedFiat : (pendingFiat + recoveredFiat),
                    actualUsdt: recoveredUsdt,
                    actualFiat: recoveredFiat,
                    pendingUsdt: pendingUsdt,
                    pendingFiat: pendingFiat,
                    receivers: Array.isArray(dispersor?.receivers) ? dispersor.receivers : []
                }
            };
            rows.unshift(syntheticTx);
        }
    }
    rows = rows.filter((tx) => isLedgerChannelAllowed(tx));

    const pageNet = rows.reduce((sum, tx) => sum + getSignedAmount(tx), 0);
    state.pageNetByPage.set(state.page, pageNet);

    const anchorBalance = getLedgerAnchorBalance(state.kpis);
    const knownNetBefore = getKnownNetBeforePage(state.page);
    let runningBalance = anchorBalance - Number(knownNetBefore || 0);

    return rows.map((tx) => {
        const row = {
            tx,
            balance: runningBalance,
        };
        runningBalance -= getSignedAmount(tx);
        return row;
    });
};

const normalizeBankKey = (value) => {
    const raw = String(value || '').toLowerCase().trim();
    if (!raw) return '';
    if (raw.includes('pago') || raw.includes('movil')) return '';
    if (raw.includes('bbva') || raw.includes('provincial')) return 'provincial';
    if (raw.includes('mercantil')) return 'mercantil';
    if (raw.includes('banesco')) return 'banesco';
    if (raw.includes('bancamiga')) return 'bancamiga';
    if (raw === 'bank' || raw.includes('fintech')) return 'bank';
    if (raw.includes('bnc')) return 'bnc';
    return raw.replace(/\s+/g, '');
};

const matchTxToBank = (tx) => {
    const txBankKey = normalizeBankKey(tx?.bankName || tx?.bank || tx?.paymentMethod);
    if (!txBankKey || !state.bankData.length) return null;

    return state.bankData.find((bank) => {
        const bankKey = normalizeBankKey(bank?.bank || bank?.bankName);
        if (!bankKey) return false;
        return bankKey === txBankKey || txBankKey.includes(bankKey) || bankKey.includes(txBankKey);
    }) || null;
};

const getBankPromiseRate = (bank = {}) => {
    const promisedUsdt = Number(bank?.rangePromisedUsdt || 0);
    const promisedFiat = Number(bank?.rangePromisedFiat || 0);
    if (promisedUsdt <= 0 || promisedFiat <= 0) return 0;
    return promisedFiat / promisedUsdt;
};

const getWeightedRateFromBanks = (rateCandidates = [], weightCandidates = []) => {
    if (!Array.isArray(state.bankData) || state.bankData.length === 0) return 0;

    let weightedSum = 0;
    let totalWeight = 0;

    state.bankData.forEach((bank) => {
        const rate = rateCandidates
            .map((key) => Number(bank?.[key] || 0))
            .find((value) => value > 0) || 0;

        if (rate <= 0) return;

        const weight = weightCandidates
            .map((key) => Number(bank?.[key] || 0))
            .find((value) => value > 0) || 1;

        weightedSum += rate * weight;
        totalWeight += weight;
    });

    if (totalWeight <= 0) return 0;
    return weightedSum / totalWeight;
};

const getWeightedSellReferenceRateFromBanks = () => {
    if (!Array.isArray(state.bankData) || state.bankData.length === 0) return 0;

    let weightedSum = 0;
    let totalWeight = 0;

    state.bankData.forEach((bank) => {
        const rate = [
            Number(bank?.lastSellRate || 0),
            Number(bank?.sellRate || 0),
            Number(bank?.avgSellRate || 0),
            Number(bank?.weightedAvgSellRate || 0),
            Number(bank?.ceilingRate || 0),
            getBankPromiseRate(bank),
        ].find((value) => value > 0) || 0;

        if (rate <= 0) return;

        const weight = [
            Number(bank?.sellVolUSDT || 0),
            Number(bank?.realizedVolumeUSDT || 0),
            Number(bank?.spreadSellUsdt || 0),
            Number(bank?.rangePromisedUsdt || 0),
        ].find((value) => value > 0) || 1;

        weightedSum += rate * weight;
        totalWeight += weight;
    });

    if (totalWeight <= 0) return 0;
    return weightedSum / totalWeight;
};

// Weighted average rate from the current page's transactions (buy or sell).
const getPageAvgRate = (typesToMatch) => {
    if (!state.currentTransfers?.length) return 0;
    let weightedSum = 0;
    let totalAmount = 0;

    for (const tx of state.currentTransfers) {
        const type = normalizeTxType(tx);
        if (!typesToMatch.includes(type)) continue;

        const rate = getTxRate(tx);
        if (rate <= 0) continue;

        const amount = Math.abs(Number(tx?.amount || 0));
        if (amount <= 0) continue;

        weightedSum += rate * amount;
        totalAmount += amount;
    }

    return totalAmount > 0 ? weightedSum / totalAmount : 0;
};

const getFallbackBuyReferenceRate = () => {
    const directCandidates = [
        state.kpis?.operations?.weightedAvgBuyRate,
        state.kpis?.rates?.buyRate,
        state.kpis?.rates?.buy,
        state.kpis?.summary?.minBuyRate,
    ];

    for (const candidate of directCandidates) {
        const n = Number(candidate || 0);
        if (n > 0) return n;
    }

    // Compute from the current page's actual buy transactions.
    const pageRate = getPageAvgRate(['P2P_BUY']);
    if (pageRate > 0) return pageRate;

    return getWeightedRateFromBanks(
        ['weightedAvgBuyRate', 'avgBuyRate', 'buyRate'],
        ['buyVolUSDT', 'realizedVolumeUSDT']
    );
};

const getFallbackSellReferenceRate = () => {
    const directCandidates = [
        state.kpis?.bankSummary?.referenceSellRate,
        state.kpis?.bankSummary?.generalSellRate,
        state.kpis?.operations?.weightedAvgSellRate,
        state.kpis?.rates?.sellRate,
        state.kpis?.rates?.sell,
        state.kpis?.bankSummary?.generalCeilingRate,
    ];

    for (const candidate of directCandidates) {
        const n = Number(candidate || 0);
        if (n > 0) return n;
    }

    // Compute from the current page's actual sell transactions.
    const pageRate = getPageAvgRate(['P2P_SELL']);
    if (pageRate > 0) return pageRate;

    const bankRate = getWeightedSellReferenceRateFromBanks();
    if (bankRate > 0) return bankRate;

    // breakEvenRate as absolute last resort for sell reference is acceptable
    // (underestimates buy spread rather than inverting sell spread).
    return Number(state.kpis?.critical?.breakEvenRate || 0);
};

const getFallbackSpreadPercent = () => {
    const candidates = [
        state.kpis?.bankSummary?.spreadPercent,
        state.kpis?.critical?.globalMarginPercent,
        state.kpis?.metrics?.globalMarginPct,
    ];

    for (const candidate of candidates) {
        const n = Number(candidate || 0);
        if (n !== 0 && Number.isFinite(n)) return n;
    }

    return 0;
};

const computeTxSpread = (tx = {}) => {
    const type = normalizeTxType(tx);
    if (type !== 'P2P_SELL' && type !== 'P2P_BUY') return 0;
    if (type === 'P2P_SELL') return 0;

    const txRate = getTxRate(tx);
    if (txRate <= 0) return 0;

    const amount = Math.abs(Number(tx?.amount || 0));
    if (amount <= 0) return 0;

    // Fee is shown in the row (FEE ...). Used to infer Cc (buy commission rate) when in USDT.
    const fee = toFiniteNumber(tx?.fee);
    const feeCurrency = String(tx?.feeCurrency || '').toUpperCase();
    const effectiveFee = fee > 0 && (!feeCurrency || feeCurrency === 'USDT') ? fee : 0;

    const ves = resolveFiatAmount(tx) || amount * txRate;

    const bank = matchTxToBank(tx);
    if (type === 'P2P_SELL') {
        // Reference buy rate priority:
        // 1. Page avg of P2P_BUY rates (same timeframe — most accurate)
        // 2. Bank-level weighted buy rate from bankInsights
        // 3. Global fallback (period average)
        const pageBuyRate = getPageAvgRate(['P2P_BUY']);
        const avgBuyRate = pageBuyRate > 0
            ? pageBuyRate
            : Number(bank?.weightedAvgBuyRate || bank?.avgBuyRate || bank?.buyRate || 0) || getFallbackBuyReferenceRate();
        if (avgBuyRate <= 0) return 0;

        // Spread only (no commissions): (USDT recovered at buy ref rate) − (USDT sold)
        const grossBuyRef = ves / avgBuyRate;
        return grossBuyRef - amount;
    }

    // Reference sell rate priority:
    // 1. Page avg of P2P_SELL rates (same timeframe — most accurate)
    // 2. Bank-level sell rate from bankInsights
    // 3. Global fallback (period average)
    const pageSellRate = getPageAvgRate(['P2P_SELL']);
    const referenceSellRate = pageSellRate > 0
        ? pageSellRate
        : Number(
            bank?.lastSellRate
            || bank?.sellRate
            || bank?.avgSellRate
            || bank?.weightedAvgSellRate
            || bank?.ceilingRate
            || getBankPromiseRate(bank)
            || 0
        ) || getFallbackSellReferenceRate();

    if (referenceSellRate <= 0) {
        return 0;
    }

    // Spread (net) per formula:
    // Rendimiento = (VES / tasaCompra × (1 − Cc)) − (VES / (tasaVenta × (1 − Cv)))
    //
    // Cc: from the order fee when it's in USDT (fee/amount). Fallback to maker rate.
    // Cv: maker rate from config (fallback to Cc if that's all we have).
    const configMakerRate = Number(state.kpis?.config?.verificationPercent || 0) / 100;
    const cc = effectiveFee > 0 && amount > 0 ? (effectiveFee / amount) : (configMakerRate > 0 ? configMakerRate : 0);
    const cv = configMakerRate > 0 ? configMakerRate : cc;

    const buyGrossUsdt = ves / txRate;
    const buyNetUsdt = buyGrossUsdt * (1 - cc);

    const sellDen = referenceSellRate * (1 - cv);
    if (sellDen <= 0) return 0;
    const sellEffectiveUsdt = ves / sellDen;

    return buyNetUsdt - sellEffectiveUsdt;
};

// Iterates transfers oldest-first and accumulates P2P spreads per cycle.
// A cycle ends at each LIQUID (settlement) row; it's "complete" on this page
// if a DISPERSOR_PENDING row was seen since the previous LIQUID.
// Returns Map<tx, { sum: number, complete: boolean }>.
const computeCycleSpreads = (transfers) => {
    const result = new Map();
    let cycleSpread = 0;
    let hasDispersador = false;

    for (let i = transfers.length - 1; i >= 0; i--) {
        const tx = transfers[i];
        if (isSettlementTransfer(tx)) {
            result.set(tx, { sum: cycleSpread, complete: hasDispersador });
            cycleSpread = 0;
            hasDispersador = false;
        } else {
            if (String(tx?.type || '').toUpperCase() === 'DISPERSOR_PENDING') {
                hasDispersador = true;
            }
            cycleSpread += computeTxSpread(tx);
        }
    }
    return result;
};

const renderRow = (tx, rowBalance, cycleData = undefined) => {
    const isSettlement = isSettlementTransfer(tx);
    const category = isSettlement ? 'LIQUID' : getCategory(tx.type);
    const signedAmount = getSignedAmount(tx);
    const amountTone = signedAmount < 0 ? 'ledger-amount-negative' : 'ledger-amount-positive';
    const balanceTone = rowBalance < 0 ? 'ledger-balance-negative' : 'ledger-balance-neutral';
    const rowTone = getRowToneClass(category);
    const typePillTone = getCategoryChipClass(category);
    const topRaw = buildDescriptionTop(tx);
    const top = escapeHtml(topRaw);
    const meta = buildDescriptionMeta(tx, topRaw);
    const metaHtml = meta.map((line) => `<span class="ledger-meta-chip">${escapeHtml(line)}</span>`).join('');

    let spreadMetric;
    if (isSettlement && cycleData) {
        const { sum, complete } = cycleData;
        const cycleTone = sum > 0 ? 'ledger-metric-positive' : sum < 0 ? 'ledger-metric-negative' : 'ledger-metric-muted';
        spreadMetric = renderMetricCard({
            label: 'Ciclo',
            value: sum !== 0 ? `${sum > 0 ? '+' : ''}${formatUsd(sum)}` : '--',
            sub: complete ? 'Spread neto del ciclo' : 'Acumulado en página',
            tone: sum !== 0 ? cycleTone : 'ledger-metric-muted',
        });
    } else {
        const spreadVal = computeTxSpread(tx);
        const spreadTone = spreadVal > 0
            ? 'ledger-metric-positive'
            : spreadVal < 0
                ? 'ledger-metric-negative'
                : 'ledger-metric-muted';
        spreadMetric = renderMetricCard({
            label: 'Spread',
            value: spreadVal !== 0 ? `${spreadVal > 0 ? '+' : '-'}${formatUsd(Math.abs(spreadVal))}` : '--',
            sub: spreadVal !== 0 ? '' : 'Sin spread calculable',
            tone: spreadTone
        });
    }
    const balanceMetric = renderMetricCard({
        label: 'Balance',
        value: `${rowBalance < 0 ? '-' : ''}${formatUsd(Math.abs(rowBalance))}`,
        sub: rowBalance < 0 ? 'Balance comprometido' : 'Balance disponible',
        tone: rowBalance < 0 ? 'ledger-metric-negative' : 'ledger-metric-balance'
    });

    // PROMESA column: for LIQUID rows show inferred capital (liq − cycle spread);
    // for all others show the normal promise meta.
    let promiseMetric;
    if (isSettlement && cycleData) {
        const liqAmount = Math.abs(Number(tx?.amount || 0));
        const inferredCapital = liqAmount - cycleData.sum;
        promiseMetric = renderMetricCard({
            label: 'Capital',
            value: inferredCapital > 0 ? formatUsd(inferredCapital) : '--',
            sub: cycleData.complete ? 'Liq. − spread del ciclo' : 'Estimado (pág. parcial)',
            tone: 'ledger-metric-promise',
        });
    } else {
        promiseMetric = renderPromiseColumnMeta(tx);
    }

    const methodText = tx?.paymentMethod ? escapeHtml(String(tx.paymentMethod).toUpperCase()) : '';
    const directionLabel = signedAmount < 0 ? 'Salida' : 'Entrada';
    const fiatText = formatFiat(tx);
    const fiatHtml = fiatText ? `<div class="ledger-mobile-sub">${escapeHtml(fiatText)}</div>` : '';
    const fiatDesktopHtml = fiatText ? `<div class="ledger-amount-sub">${escapeHtml(fiatText)}</div>` : '';

    const isDispersorPending = String(tx?.type || '').toUpperCase() === 'DISPERSOR_PENDING';
    const receivers = isDispersorPending ? (tx?.syntheticPromiseMeta?.receivers || []) : [];
    const hasReceivers = receivers.length > 0;
    const toggleBtnHtml = hasReceivers
        ? `<button class="dispersor-toggle-btn" data-dispersor-toggle title="Ver desglose por dispersor">
            <svg class="dispersor-toggle-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            <span>${receivers.length} dispersor${receivers.length !== 1 ? 'es' : ''}</span>
           </button>`
        : '';
    const receiversHtml = hasReceivers ? renderReceiversDetail(receivers) : '';

    return `
        <article class="ledger-row ${rowTone}${isDispersorPending ? ' ledger-row-dispersor-pending' : ''}">
            <div class="ledger-mobile-card">
                <div class="ledger-mobile-header">
                    <div class="ledger-mobile-badge-stack">
                        <div class="${typePillTone}">${category}</div>
                        <div class="ledger-mobile-date">${escapeHtml(formatPostingDate(tx.timestamp))}</div>
                    </div>
                    <div class="ledger-mobile-amount-block">
                        <div class="ledger-mobile-amount ${amountTone}">${formatAmount(tx)}</div>
                        ${fiatHtml}
                    </div>
                </div>

                <div class="ledger-mobile-title">${top}</div>
                <div class="ledger-mobile-kicker-row">
                    <div class="ledger-mobile-kicker-text">${directionLabel}${methodText ? ` | ${methodText}` : ''}</div>
                    ${toggleBtnHtml}
                </div>

                <div class="ledger-mobile-meta">
                    ${metaHtml || '<span class="ledger-meta-chip ledger-meta-chip-muted">Sin metadata extra</span>'}
                </div>

                <div class="ledger-mobile-metrics">
                    ${promiseMetric}
                    ${balanceMetric}
                    ${spreadMetric}
                </div>
            </div>

            <div class="ledger-desktop-row">
                <div class="ledger-date-col">
                    <div class="ledger-date-main">${escapeHtml(formatPostingDate(tx.timestamp))}</div>
                    <div class="ledger-date-sub">${directionLabel}</div>
                </div>
                <div class="ledger-description-col">
                    <div class="ledger-title-row">
                        <div class="ledger-title">${top}</div>
                        ${toggleBtnHtml}
                    </div>
                    <div class="ledger-subtitle">${methodText || 'Operacion del ledger'}</div>
                    <div class="ledger-meta-strip">
                        ${metaHtml || '<span class="ledger-meta-chip ledger-meta-chip-muted">Sin metadata extra</span>'}
                    </div>
                </div>
                <div class="ledger-type-col">
                    <span class="${typePillTone}">${category}</span>
                </div>
                <div class="ledger-amount-col">
                    <div class="ledger-amount-main ${amountTone}">${formatAmount(tx)}</div>
                    ${fiatDesktopHtml}
                </div>
                <div class="ledger-metric-col">
                    ${promiseMetric}
                </div>
                <div class="ledger-metric-col">
                    ${balanceMetric}
                </div>
                <div class="ledger-metric-col">
                    ${spreadMetric}
                </div>
            </div>
            ${receiversHtml}
        </article>
    `;
};

const renderTransfers = (transfers = []) => {
    const { body, count, scroll } = getElements();
    if (!body) return;

    const allTransfers = Array.isArray(transfers) ? transfers : [];
    const scopedTransfers = allTransfers.filter((tx) => isLedgerChannelAllowed(tx));
    state.currentTransfers = scopedTransfers;

    if (scopedTransfers.length === 0) {
        renderEmpty();
        return;
    }

    const rowsWithBalance = buildRowsWithBalance(scopedTransfers);
    const cycleSpreads = computeCycleSpreads(scopedTransfers);
    const filteredRows = rowsWithBalance.filter(({ tx }) => matchesSearch(tx, state.searchTerm));

    if (count) {
        const filterLabel = state.typeFilter === 'ALL' ? '' : ` | ${state.typeFilter}`;
        const suffix = state.searchTerm ? ` | ${filteredRows.length} visibles` : '';
        count.textContent = `Mostrando ${scopedTransfers.length} movimiento${scopedTransfers.length === 1 ? '' : 's'} de ${state.total}${filterLabel}${suffix}`;
    }

    if (filteredRows.length === 0) {
        body.innerHTML = `
            <div class="px-4 py-10 text-center text-[14px] font-medium text-white md:px-6">
                No hay coincidencias en esta pagina.
            </div>
        `;
        updatePaginationUI();
        if (scroll) scroll.scrollTop = 0;
        return;
    }

    body.innerHTML = filteredRows.map(({ tx, balance }) => renderRow(tx, balance, cycleSpreads.get(tx))).join('');

    // Wire dispersor toggle buttons
    body.querySelectorAll('[data-dispersor-toggle]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const article = btn.closest('.ledger-row-dispersor-pending');
            if (!article) return;
            const panel = article.querySelector('.dispersor-receivers-panel');
            if (!panel) return;
            const isOpen = panel.style.display !== 'none';
            panel.style.display = isOpen ? 'none' : 'block';
            btn.classList.toggle('dispersor-toggle-open', !isOpen);
        });
    });

    updatePaginationUI();
    if (scroll) scroll.scrollTop = 0;
};

const fetchTransfersPage = async (page = 1, options = {}) => {
    if (!state.apiBase || !state.token) return;
    const showLoading = options?.showLoading !== false;
    const preserveOnError = options?.preserveOnError === true;

    if (state.abortController) {
        state.abortController.abort();
    }

    state.page = page;
    state.abortController = new AbortController();
    const requestSeq = ++state.requestSeq;
    if (showLoading) {
        renderLoading();
        updatePaginationUI();
    }

    try {
        let res = await fetch(buildTransfersUrl(state.apiBase, state.range, page, state.limit, true), {
            headers: {
                'Authorization': `Bearer ${state.token}`
            },
            cache: 'no-store',
            signal: state.abortController.signal
        });

        if (!res.ok && res.status !== 401 && res.status !== 403) {
            const fallbackRes = await fetch(buildTransfersUrl(state.apiBase, state.range, page, state.limit, false), {
                headers: {
                    'Authorization': `Bearer ${state.token}`
                },
                cache: 'no-store',
                signal: state.abortController.signal
            });
            if (fallbackRes.ok) {
                res = fallbackRes;
            }
        }

        if (!res.ok) {
            if (res.status === 401 || res.status === 403) {
                state.onAuthError?.();
                return;
            }
            let detail = '';
            try {
                detail = await res.text();
            } catch {
                detail = '';
            }
            throw new Error(`HTTP ${res.status}${detail ? ` - ${detail.slice(0, 160)}` : ''}`);
        }

        const payload = await res.json();
        if (requestSeq !== state.requestSeq) return;

        const pagination = payload?.pagination || {};
        state.total = Number(pagination.total || 0);
        state.totalPages = Number(pagination.totalPages || 0);
        state.page = Number(pagination.page || page);
        const payloadClosingBalance = Number(payload?.closingBalance);
        state.closingBalance = Number.isFinite(payloadClosingBalance) ? payloadClosingBalance : null;
        state.loadedOnce = true;
        state.needsRefresh = false;

        renderTransfers(Array.isArray(payload?.transfers) ? payload.transfers : []);
    } catch (error) {
        if (error?.name === 'AbortError') return;
        console.warn('No fue posible cargar el historial de balance:', error);
        if (!preserveOnError) {
            renderError('No fue posible cargar el historial. Intenta de nuevo.');
        }
    } finally {
        if (requestSeq === state.requestSeq) {
            state.abortController = null;
        }
    }
};

const bindEventsOnce = () => {
    if (state.initialized) return;
    state.initialized = true;

    const { prevBtn, nextBtn, searchInput, typeFilters } = getElements();

    prevBtn?.addEventListener('click', () => {
        if (state.page <= 1) return;
        void fetchTransfersPage(state.page - 1);
    });

    nextBtn?.addEventListener('click', () => {
        if (state.page >= state.totalPages) return;
        void fetchTransfersPage(state.page + 1);
    });

    searchInput?.addEventListener('input', (event) => {
        state.searchTerm = String(event?.target?.value || '').trim();
        renderTransfers(state.currentTransfers);
    });

    typeFilters.forEach((button) => {
        button.addEventListener('click', () => {
            const nextType = String(button?.dataset?.ledgerType || 'ALL').toUpperCase();
            if (!LEDGER_FILTER_OPTIONS.includes(nextType) || nextType === state.typeFilter) {
                return;
            }
            state.typeFilter = nextType;
            state.pageNetByPage.clear();
            state.closingBalance = null;
            state.total = 0;
            state.totalPages = 0;
            updateTypeFilterUI();
            updatePaginationUI();
            renderPlaceholder('Filtrando movimientos...');
            void fetchTransfersPage(1);
        });
    });
};

export const updateBalanceLedgerUI = (kpis = {}, context = {}) => {
    bindEventsOnce();

    const nextRange = {
        from: sanitizeDateValue(context?.range?.from),
        to: sanitizeDateValue(context?.range?.to),
    };
    const nextSyncKey = String(kpis?.reportDate || '').trim();
    const rangeChanged = !isSameRange(state.range, nextRange);
    const apiChanged = state.apiBase !== String(context?.apiBase || '').trim();
    const tokenChanged = state.token !== String(context?.token || '').trim();
    const syncChanged = Boolean(nextSyncKey) && state.syncKey !== nextSyncKey;

    state.kpis = kpis || {};
    state.apiBase = String(context?.apiBase || '').trim();
    state.token = String(context?.token || '').trim();
    state.range = nextRange;
    state.syncKey = nextSyncKey;
    state.onAuthError = typeof context?.onAuthError === 'function' ? context.onAuthError : null;
    state.bankData = Array.isArray(context?.bankData) ? context.bankData : [];

    const { searchInput } = getElements();
    if (searchInput && searchInput.value !== state.searchTerm) {
        searchInput.value = state.searchTerm;
    }
    updateTypeFilterUI();

    if (!state.loadedOnce) {
        state.pageNetByPage.clear();
        state.closingBalance = null;
        state.needsRefresh = true;
        state.total = 0;
        state.totalPages = 0;
        updatePaginationUI();
        renderPlaceholder('Cargando historial...');
        void fetchTransfersPage(1);
        return;
    }

    if (rangeChanged || apiChanged || tokenChanged) {
        state.pageNetByPage.clear();
        state.closingBalance = null;
        state.needsRefresh = true;
        state.total = 0;
        state.totalPages = 0;
        updatePaginationUI();
        renderPlaceholder('Actualizando historial...');
        void fetchTransfersPage(1);
        return;
    }

    if (syncChanged) {
        void fetchTransfersPage(state.page || 1, {
            showLoading: false,
            preserveOnError: true,
        });
        return;
    }

    if (state.currentTransfers.length > 0) {
        renderTransfers(state.currentTransfers);
    }
};
