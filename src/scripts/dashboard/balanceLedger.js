const CARACAS_TZ = 'America/Caracas';
const LEDGER_CHANNELS = Object.freeze(['P2P', 'PAY']);
const LEDGER_CHANNEL_SET = new Set(LEDGER_CHANNELS);

const state = {
    apiBase: '',
    token: '',
    range: {},
    kpis: {},
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
    return LEDGER_CHANNEL_SET.has(category);
};

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
    const type = String(tx?.type || '').toUpperCase();
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
    if (Number.isFinite(payloadClosingBalance)) {
        return payloadClosingBalance;
    }

    const wallets = kpis?.wallets || {};
    const isolatedWalletsSum = Number(wallets.balanceP2P || 0)
        + Number(wallets.balancePay || 0);

    if (Number.isFinite(isolatedWalletsSum)) {
        return isolatedWalletsSum;
    }

    const candidates = [
        kpis?.metrics?.totalBalance,
        kpis?.currentBalance,
        kpis?.audit?.realBalance,
        kpis?.metrics?.balance,
        kpis?.summary?.balance,
    ];

    for (const candidate of candidates) {
        const n = Number(candidate);
        if (Number.isFinite(n)) return n;
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
    return fiatCurrency || 'FIAT';
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

    // Keep sender/receiver identity only in the top line to avoid redundancy.
    if (tx?.paymentMethod) parts.push(tx.paymentMethod);
    if (asset) parts.push(asset);
    if (fiatCurrency) parts.push(fiatCurrency);
    if (feeText) parts.push(feeText);
    if (rateText) parts.push(rateText);
    if (tx?.tradeType) parts.push(`TRADE ${tx.tradeType}`);
    if (tx?.orderNumber) parts.push(`ORDER ${tx.orderNumber}`);
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
    const fiatResolved = resolveFiatAmount(tx);
    return `${formatNumber(fiatResolved, 2)} ${getFiatLabel(tx)}`;
};

const formatAmount = (tx) => {
    if (tx?.type === 'DISPERSOR_PENDING') return 'INFO';
    const direction = getDirection(tx?.type);
    const amount = Number(tx?.amount || 0);
    const sign = direction < 0 ? '-' : direction > 0 ? '+' : '';
    return `${sign}${formatUsd(Math.abs(amount))}`;
};

const formatPromiseUsdt = (value) => `${formatNumber(Math.abs(Number(value || 0)), 2, 'en-US')} USDT`;

const formatPromiseFiat = (value, tx) => `${formatNumber(Math.abs(Number(value || 0)), 2)} ${getFiatLabel(tx)}`;

const renderPromiseColumnMeta = (tx) => {
    const promiseMeta = getPromiseMeta(tx);
    if (!promiseMeta) {
        return '<div class="pt-0.5 text-[12px] font-semibold text-white/20">--</div>';
    }

    if (String(tx?.type || '').toUpperCase() === 'DISPERSOR_PENDING') {
        const localTone = promiseMeta.actualUsdt > 0.009 ? 'text-emerald-300/95' : 'text-white/45';
        const pendingTone = promiseMeta.pendingUsdt > 0.009 ? 'text-amber-200/95' : 'text-emerald-300/95';

        return `
            <div class="min-w-0 pt-0.5 text-right">
                <div class="text-[10px] font-black uppercase tracking-[0.12em] text-sky-200">
                    Promesa total
                </div>
                <div class="mt-0.5 text-[13px] font-black leading-none text-white">
                    ${escapeHtml(formatPromiseUsdt(promiseMeta.promiseUsdt))}
                </div>
                <div class="mt-1 text-[11px] font-semibold text-white/72">
                    ${escapeHtml(formatPromiseFiat(promiseMeta.promisedFiat, tx))}
                </div>
                <div class="mt-2 text-[10px] font-black uppercase tracking-[0.12em] ${localTone}">
                    Local
                </div>
                <div class="mt-0.5 text-[12px] font-bold leading-none ${localTone}">
                    ${escapeHtml(formatPromiseUsdt(promiseMeta.actualUsdt))}
                </div>
                <div class="mt-2 text-[10px] font-black uppercase tracking-[0.12em] ${pendingTone}">
                    Pendiente externo
                </div>
                <div class="mt-0.5 text-[12px] font-bold leading-none ${pendingTone}">
                    ${escapeHtml(formatPromiseUsdt(promiseMeta.pendingUsdt))}
                </div>
            </div>
        `;
    }

    const promiseTone = promiseMeta.isReceiver ? 'text-amber-200' : 'text-sky-200';
    const promiseLabel = promiseMeta.isReceiver ? 'Promesa recibida' : 'Promesa';
    const debtLabel = promiseMeta.pendingUsdt > 0.009 ? 'Pendiente' : 'Cubierta';
    const debtTone = promiseMeta.pendingUsdt > 0.009 ? 'text-amber-200/95' : 'text-emerald-300/95';

    return `
        <div class="min-w-0 pt-0.5 text-right">
            <div class="text-[10px] font-black uppercase tracking-[0.12em] ${promiseTone}">
                ${escapeHtml(promiseLabel)}
            </div>
            <div class="mt-0.5 text-[13px] font-black leading-none text-white">
                ${escapeHtml(formatPromiseUsdt(promiseMeta.promiseUsdt))}
            </div>
            <div class="mt-1 text-[11px] font-semibold text-white/72">
                ${escapeHtml(formatPromiseFiat(promiseMeta.promisedFiat, tx))}
            </div>
            ${promiseMeta.isReceiver ? `
                <div class="mt-2 space-y-1">
                    <div class="text-[10px] font-black uppercase tracking-[0.12em] ${debtTone}">
                        ${escapeHtml(debtLabel)}
                    </div>
                    <div class="mt-0.5 text-[12px] font-bold leading-none ${debtTone}">
                        ${escapeHtml(formatPromiseUsdt(promiseMeta.pendingUsdt))}
                    </div>
                    <div class="mt-1 text-[10px] font-semibold text-white/65">
                        ${escapeHtml(formatPromiseFiat(promiseMeta.pendingFiat, tx))}
                    </div>
                </div>
            ` : ''}
        </div>
    `;
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
        params.set('channels', LEDGER_CHANNELS.join(','));
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

const renderPlaceholder = (message, toneClass = 'text-white/45') => {
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
                    pendingFiat: pendingFiat
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

const getFallbackBuyReferenceRate = () => {
    const directCandidates = [
        state.kpis?.operations?.weightedAvgBuyRate,
        state.kpis?.rates?.buyRate,
        state.kpis?.rates?.buy,
        state.kpis?.summary?.minBuyRate,
        state.kpis?.critical?.breakEvenRate,
    ];

    for (const candidate of directCandidates) {
        const n = Number(candidate || 0);
        if (n > 0) return n;
    }

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
        state.kpis?.critical?.breakEvenRate,
    ];

    for (const candidate of directCandidates) {
        const n = Number(candidate || 0);
        if (n > 0) return n;
    }

    return getWeightedRateFromBanks(
        ['lastSellRate', 'sellRate', 'avgSellRate', 'weightedAvgSellRate', 'ceilingRate'],
        ['sellVolUSDT', 'realizedVolumeUSDT', 'spreadSellUsdt']
    );
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
    const type = String(tx?.type || '').toUpperCase();
    if (type !== 'P2P_SELL' && type !== 'P2P_BUY') return 0;

    const txRate = getTxRate(tx);
    if (txRate <= 0) return 0;

    const amount = Math.abs(Number(tx?.amount || 0));
    if (amount <= 0) return 0;

    const bank = matchTxToBank(tx);
    if (type === 'P2P_SELL') {
        const avgBuyRate = Number(bank?.weightedAvgBuyRate || bank?.avgBuyRate || bank?.buyRate || 0) || getFallbackBuyReferenceRate();
        if (avgBuyRate <= 0) {
            const fallbackSpreadPct = getFallbackSpreadPercent();
            if (fallbackSpreadPct === 0) return 0;
            return amount * (fallbackSpreadPct / 100);
        }

        const spreadFiat = (txRate - avgBuyRate) * amount;
        return spreadFiat / txRate;
    }

    const referenceSellRate = Number(
        bank?.lastSellRate
        || bank?.sellRate
        || bank?.avgSellRate
        || bank?.weightedAvgSellRate
        || bank?.ceilingRate
        || 0
    ) || getFallbackSellReferenceRate();

    if (referenceSellRate <= 0) {
        const fallbackSpreadPct = getFallbackSpreadPercent();
        if (fallbackSpreadPct === 0) return 0;
        return amount * (fallbackSpreadPct / 100);
    }

    const spreadFiat = (referenceSellRate - txRate) * amount;
    return spreadFiat / referenceSellRate;
};

const renderRow = (tx, rowBalance) => {
    const isSettlement = isSettlementTransfer(tx);
    const category = isSettlement ? 'LIQUID' : getCategory(tx.type);
    const signedAmount = getSignedAmount(tx);
    const amountTone = signedAmount < 0 ? 'text-red-400' : 'text-white';
    const balanceTone = rowBalance < 0 ? 'text-red-400' : 'text-white';
    const rowTone = isSettlement
        ? 'bg-rose-500/[0.06] ring-1 ring-rose-400/35'
        : '';
    const typePillTone = isSettlement
        ? 'inline-flex items-center rounded-md border border-rose-300/55 bg-rose-400/12 px-2 py-0.5 text-[0.8rem] text-rose-200 shadow-[0_0_0_1px_rgba(251,113,133,0.25)]'
        : '';
    const topRaw = buildDescriptionTop(tx);
    const top = escapeHtml(topRaw);
    const meta = buildDescriptionMeta(tx, topRaw);
    const metaHtml = meta.map((line) => `<span>${escapeHtml(line)}</span>`).join('<span class="text-white/18">|</span>');

    const spreadVal = computeTxSpread(tx);
    const spreadHtml = spreadVal !== 0 
        ? `<div class="pt-0.5 text-[12px] font-bold ${spreadVal > 0 ? 'text-emerald-300' : 'text-red-400'}">${spreadVal > 0 ? '+' : '-'}${formatUsd(Math.abs(spreadVal))}</div>`
        : `<div class="pt-0.5 text-[12px] font-semibold text-white/20">--</div>`;

    const orderText = tx?.orderNumber ? `ORDER ${escapeHtml(tx.orderNumber)}` : '';
    const methodText = tx?.paymentMethod ? escapeHtml(String(tx.paymentMethod).toUpperCase()) : '';

    return `
        <article class="grid gap-2 px-4 py-2 md:px-5 lg:grid-cols-[128px_minmax(260px,1.5fr)_92px_minmax(140px,0.9fr)_minmax(200px,1.1fr)_minmax(140px,0.9fr)_minmax(90px,0.7fr)] lg:items-start ${rowTone}">
            <div class="px-0.5 py-1.5 lg:hidden">
                <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                        <div class="text-[0.8rem] font-black uppercase tracking-[0.12em] ${getCategoryTone(category)} ${typePillTone}">${category}</div>
                        <div class="mt-1 text-[11px] font-semibold text-white/62">${escapeHtml(formatPostingDate(tx.timestamp))}</div>
                    </div>
                    <div class="text-right">
                        <div class="text-[1.35rem] font-black leading-none ${amountTone}">${formatAmount(tx)}</div>
                        <div class="mt-1 text-[11px] font-semibold text-white/65">${escapeHtml(formatFiat(tx))}</div>
                    </div>
                </div>

                <div class="mt-2.5 break-words text-[13px] font-semibold text-white/92">${top}</div>

                <div class="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
                    <div class="text-white/65">Balance</div>
                    <div class="text-right ${balanceTone} font-black">${rowBalance < 0 ? '-' : ''}${formatUsd(Math.abs(rowBalance))}</div>
                    <div class="text-white/65">Spread</div>
                    <div class="text-right ${spreadVal > 0 ? 'text-emerald-300' : spreadVal < 0 ? 'text-red-400' : 'text-white/35'} font-black">
                        ${spreadVal > 0 ? '+' : spreadVal < 0 ? '-' : ''}${spreadVal !== 0 ? formatUsd(Math.abs(spreadVal)) : '--'}
                    </div>
                    ${orderText ? `<div class="text-white/65">Orden</div><div class="text-right text-white/82 font-semibold">${orderText.replace('ORDER ', '')}</div>` : ''}
                    ${methodText ? `<div class="text-white/65">Metodo</div><div class="text-right text-white/82 font-semibold">${methodText}</div>` : ''}
                </div>

                <div class="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-medium text-white/52">${metaHtml || ''}</div>
            </div>

            <div class="hidden lg:contents">
            <div class="pt-0.5 text-[11px] font-semibold text-white/72">${escapeHtml(formatPostingDate(tx.timestamp))}</div>
            <div class="min-w-0">
                <div class="break-words text-[14px] font-semibold text-white">${top}</div>
                <div class="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] font-medium text-white/78">${metaHtml || '<span class="text-white/60">Sin metadata extra</span>'}</div>
            </div>
            <div class="pt-0.5 text-left lg:text-center">
                <span class="text-[0.95rem] font-black uppercase tracking-[0.12em] ${getCategoryTone(category)} ${typePillTone}">${category}</span>
            </div>
            <div class="pt-0.5 text-left lg:text-right">
                <div class="text-[1.15rem] font-black leading-none ${amountTone}">${formatAmount(tx)}</div>
                <div class="mt-0.5 text-[10px] font-semibold text-white/72">${escapeHtml(formatFiat(tx))}</div>
            </div>
            <div class="text-left lg:text-right">
                ${renderPromiseColumnMeta(tx)}
            </div>
            <div class="pt-0.5 text-left lg:text-right">
                <div class="text-[1rem] font-black leading-none ${balanceTone}">${rowBalance < 0 ? '-' : ''}${formatUsd(Math.abs(rowBalance))}</div>
            </div>
            <div class="pt-0.5 text-left lg:text-right">
                ${spreadHtml}
            </div>
            </div>
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
    const filteredRows = rowsWithBalance.filter(({ tx }) => matchesSearch(tx, state.searchTerm));

    if (count) {
        const suffix = state.searchTerm ? ` | ${filteredRows.length} visibles` : '';
        count.textContent = `Mostrando ${scopedTransfers.length} movimiento${scopedTransfers.length === 1 ? '' : 's'} de ${state.total}${suffix}`;
    }

    if (filteredRows.length === 0) {
        body.innerHTML = `
            <div class="px-4 py-10 text-center text-[14px] font-medium text-white/45 md:px-6">
                No hay coincidencias en esta pagina.
            </div>
        `;
        updatePaginationUI();
        if (scroll) scroll.scrollTop = 0;
        return;
    }

    body.innerHTML = filteredRows.map(({ tx, balance }) => renderRow(tx, balance)).join('');
    updatePaginationUI();
    if (scroll) scroll.scrollTop = 0;
};

const fetchTransfersPage = async (page = 1) => {
    if (!state.apiBase || !state.token) return;

    if (state.abortController) {
        state.abortController.abort();
    }

    state.page = page;
    state.abortController = new AbortController();
    const requestSeq = ++state.requestSeq;
    renderLoading();
    updatePaginationUI();

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
        renderError('No fue posible cargar el historial. Intenta de nuevo.');
    } finally {
        if (requestSeq === state.requestSeq) {
            state.abortController = null;
        }
    }
};

const bindEventsOnce = () => {
    if (state.initialized) return;
    state.initialized = true;

    const { prevBtn, nextBtn, searchInput } = getElements();

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
};

export const updateBalanceLedgerUI = (kpis = {}, context = {}) => {
    bindEventsOnce();

    const nextRange = {
        from: sanitizeDateValue(context?.range?.from),
        to: sanitizeDateValue(context?.range?.to),
    };
    const rangeChanged = !isSameRange(state.range, nextRange);
    const apiChanged = state.apiBase !== String(context?.apiBase || '').trim();
    const tokenChanged = state.token !== String(context?.token || '').trim();

    state.kpis = kpis || {};
    state.apiBase = String(context?.apiBase || '').trim();
    state.token = String(context?.token || '').trim();
    state.range = nextRange;
    state.onAuthError = typeof context?.onAuthError === 'function' ? context.onAuthError : null;
    state.bankData = Array.isArray(context?.bankData) ? context.bankData : [];

    const { searchInput } = getElements();
    if (searchInput && searchInput.value !== state.searchTerm) {
        searchInput.value = state.searchTerm;
    }

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

    if (state.currentTransfers.length > 0) {
        renderTransfers(state.currentTransfers);
    }
};
