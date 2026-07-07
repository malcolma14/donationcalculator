'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const gg = require('../js/calculator.js');

function close(actual, expected, msg) {
  assert.ok(Math.abs(actual - expected) < 0.005, `${msg}: got ${actual}, want ${expected}`);
}

test('worked example: ON, income $150,000, shares $25,000, cost $10,000', () => {
  const r = gg.compute({ province: 'ON', income: 150000, worth: 25000, paid: 10000 });
  close(r.marginalRate, 0.4341, 'marginal rate');
  close(r.capTax, 3255.75, 'capital gains tax if sold');
  // Well under the 75% ceiling, so both scenarios claim the full credit.
  close(r.creditA, 11553.44, 'donation credit (sell)');
  close(r.creditB, 11553.44, 'donation credit (in kind)');
  close(r.costA, 16702.31, 'cost A (sell, donate cash)');
  close(r.costB, 13446.56, 'cost B (donate shares)');
  close(r.savings, 3255.75, 'savings');
  assert.equal(r.hasGain, true);
  assert.equal(r.cappedA, false);
  assert.equal(r.cappedB, false);
});

test('75% limit: in-kind gift above the ceiling is capped this year', () => {
  // Income $100,000, shares $90,000, cost $10,000. Gain $80,000, taxable
  // half $40,000. In-kind ceiling = 0.75 x 100,000 = $75,000 (gift $90,000
  // exceeds it). Sell-first ceiling = 0.75 x (100,000 + 40,000) = $105,000,
  // so the cash route claims the full $90,000 this year.
  const r = gg.compute({ province: 'ON', income: 100000, worth: 90000, paid: 10000 });
  close(r.marginalRate, 0.3148, 'marginal rate at $100k ON');
  assert.equal(r.cappedB, true);
  assert.equal(r.cappedA, false);
  close(r.ceilingB, 75000, 'in-kind ceiling');
  close(r.ceilingA, 105000, 'sell-first ceiling');
  close(r.deferredB, 15000, 'in-kind amount carried forward');
  close(r.deferredA, 0, 'sell-first carries nothing forward');
  close(r.creditB, (200 * (14 + 7.88) + 74800 * (29 + 17.41)) / 100, 'in-kind credit on $75,000');
  close(r.creditA, (200 * (14 + 7.88) + 89800 * (29 + 17.41)) / 100, 'sell credit on $90,000');
  close(r.capTax, 40000 * 0.3148, 'capital gains tax');
  // Year one, the sell route claims more credit, so the shown saving is less
  // than the full capital gains tax avoided (the gap reverses over the carryforward).
  close(r.savings, r.costA - r.costB, 'savings is the cost difference');
  assert.ok(r.savings > 0 && r.savings < r.capTax, 'savings positive but below capTax when in-kind is capped');
});

test('75% limit: both scenarios capped when the gift dwarfs income', () => {
  const r = gg.compute({ province: 'ON', income: 100000, worth: 300000, paid: 0 });
  assert.equal(r.cappedA, true);
  assert.equal(r.cappedB, true);
  // taxable gain 150,000 -> ceilingA = 0.75 x 250,000 = 187,500; ceilingB = 75,000.
  close(r.ceilingA, 187500, 'sell-first ceiling');
  close(r.ceilingB, 75000, 'in-kind ceiling');
  close(r.claimableA, 187500, 'sell claim capped at ceiling');
  close(r.claimableB, 75000, 'in-kind claim capped at ceiling');
  close(r.savings, r.costA - r.costB, 'savings is the year-one cost difference');
  // Known distortion of the year-one snapshot: when the gift dwarfs income,
  // the sell route can claim so much more credit now that the year-one saving
  // drops below the capital gains tax avoided, and can even go negative. The
  // gap reverses over the five-year carryforward; the widget surfaces this.
  assert.ok(r.savings < r.capTax, 'year-one saving is below the capTax avoided when heavily capped');
});

test('bracket boundary: exactly $150,000 in ON reads 43.41%, $150,001 reads 44.97%', () => {
  close(gg.marginalRate(150000, 'ON'), 0.4341, 'at 150,000');
  close(gg.marginalRate(150001, 'ON'), 0.4497, 'at 150,001');
});

test('federal credit steps to 33% above $258,482', () => {
  // ON remainder rate: 29 + 17.41 below, 33 + 17.41 above.
  const at = gg.donationCredit(10200, 258482, 'ON');
  const above = gg.donationCredit(10200, 258483, 'ON');
  close(at, 200 * 0.2188 + 10000 * 0.4641, 'income 258,482');
  close(above, 200 * 0.2188 + 10000 * 0.5041, 'income 258,483');
});

test('BC uses the higher provincial remainder rate above $265,546', () => {
  const below = gg.donationCredit(10200, 265545, 'BC');
  const at = gg.donationCredit(10200, 265546, 'BC');
  close(below, 200 * (0.14 + 0.0506) + 10000 * (0.33 + 0.1680), 'income 265,545');
  close(at, 200 * (0.14 + 0.0506) + 10000 * (0.33 + 0.2050), 'income 265,546');
});

test('QC uses abated federal rates and its own high thresholds', () => {
  // Income 150,000: fed remainder 24.22 (abated 29%), prov remainder 25.75
  // (income above the 132,246 Quebec high threshold).
  const credit = gg.donationCredit(10200, 150000, 'QC');
  close(credit, 200 * (0.1169 + 0.20) + 10000 * (0.2422 + 0.2575), 'mid income');
  // Income 100,000: prov remainder stays at 24.00.
  const low = gg.donationCredit(10200, 100000, 'QC');
  close(low, 200 * (0.1169 + 0.20) + 10000 * (0.2422 + 0.24), 'below prov threshold');
  // Income 300,000: fed remainder steps to 27.56 (abated 33%).
  const high = gg.donationCredit(10200, 300000, 'QC');
  close(high, 200 * (0.1169 + 0.20) + 10000 * (0.2756 + 0.2575), 'above fed threshold');
});

test('receipts under $200 use only the first-200 rates', () => {
  // AB first-$200 provincial rate really is 60%.
  close(gg.donationCredit(100, 80000, 'AB'), 100 * (0.14 + 0.60), 'AB $100 gift');
});

test('no gain: FMV at or below ACB yields zero capital gains tax and zero savings', () => {
  const flat = gg.compute({ province: 'ON', income: 150000, worth: 10000, paid: 10000 });
  assert.equal(flat.hasGain, false);
  assert.equal(flat.capTax, 0);
  assert.equal(flat.savings, 0);
  const loss = gg.compute({ province: 'ON', income: 150000, worth: 8000, paid: 10000 });
  assert.equal(loss.hasGain, false);
  assert.equal(loss.savings, 0);
  close(loss.costA, loss.costB, 'costs identical with no gain');
});

test('EY quirks are preserved, not "fixed"', () => {
  // MB's top rate is lower than the bracket below it.
  close(gg.marginalRate(500000, 'MB'), 0.5040, 'MB above 400,001');
  close(gg.marginalRate(300000, 'MB'), 0.5125, 'MB 258,483-400,000');
  // BC's non-monotonic low brackets.
  close(gg.marginalRate(30000, 'BC'), 0.2262, 'BC 25,571 bracket');
  close(gg.marginalRate(45000, 'BC'), 0.1906, 'BC 41,723 bracket dips');
  // NU's 181,440 threshold differs by $1.
  close(gg.marginalRate(181440, 'NU'), 0.4079, 'NU at 181,440');
  close(gg.marginalRate(181440, 'SK'), 0.4050, 'SK still below its 181,441 threshold');
  close(gg.marginalRate(181441, 'SK'), 0.4379, 'SK steps up at 181,441');
});

test('all 13 provinces and territories have brackets and credit rates', () => {
  assert.equal(gg.PROVINCES.length, 13);
  for (const p of gg.PROVINCES) {
    assert.ok(gg.BRACKETS[p.code], `brackets for ${p.code}`);
    assert.ok(gg.PROV_CREDITS[p.code], `credits for ${p.code}`);
    const r = gg.compute({ province: p.code, income: 120000, worth: 50000, paid: 20000 });
    assert.ok(r.savings > 0, `${p.code} shows savings on an appreciated gift`);
    assert.ok(r.costB < r.costA, `${p.code} in-kind gift costs less`);
  }
});

test('defensive input handling', () => {
  const r = gg.compute({ province: 'XX', income: NaN, worth: -5, paid: undefined });
  assert.equal(r.receipt, 0);
  assert.equal(r.savings, 0);
  assert.equal(r.hasGain, false);
});
