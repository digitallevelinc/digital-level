import assert from 'node:assert/strict';
import test from 'node:test';

import { computeTxSpread } from './balanceLedger.js';

test('includes an explicit BUY fee in the spread cost', () => {
    const result = computeTxSpread(
        {
            type: 'P2P_BUY',
            amount: 199.94,
            asset: 'USDT',
            status: 'SUCCESS',
            paymentMethod: 'Bank',
            fiatAmount: 177_186.83,
            exchangeRate: 886.20,
            fee: 0.34,
            feeCurrency: 'USDT',
            advertisementRole: 'MAKER',
        },
        {
            rate: 891.17,
            role: 'MAKER',
            fee: 0,
            amount: 198.57,
            consumedFiat: 177_186.83,
            interbank: true,
        },
    );

    // (177,186.83 × 0.997) / 891.17 + 0.34 = 198.5684...
    // 199.60 - 198.5684... = 1.0315..., truncated to $1.03.
    assert.equal(Math.trunc(result.val * 100) / 100, 1.03);
    assert.ok(Math.abs(result.details.buyFee - 0.34) < 1e-9);
    assert.ok(Math.abs(result.details.totalFee - 0.34) < 1e-9);
});

test('allocates the fee of a large matched sell to the consumed portion', () => {
    const result = computeTxSpread(
        {
            type: 'P2P_BUY',
            amount: 175.04,
            asset: 'USDT',
            status: 'SUCCESS',
            paymentMethod: 'BancoDeVenezuela',
            fiatAmount: 155_120.448,
            exchangeRate: 886.2,
            fee: 0.30,
            feeCurrency: 'USDT',
            advertisementRole: 'MAKER',
        },
        {
            rate: 891,
            role: 'MAKER',
            fee: 1.49,
            amount: 852.97,
            consumedFiat: 155_120.448,
        },
    );

    assert.equal(Math.trunc(result.val * 100) / 100, 0.03);
    assert.ok(Math.abs(result.details.sellFee - 0.3042) < 0.001);
    assert.ok(Math.abs(result.details.totalFee - 0.6042) < 0.001);
});
