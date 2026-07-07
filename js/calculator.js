/*
 * Giving gap calculator — calculation engine.
 *
 * Compares the after-tax cost of selling appreciated publicly traded shares
 * and donating the cash versus donating the shares in kind.
 *
 * All rates are hard-coded from the EY combined federal and provincial
 * personal tax rate cards (proposals and news releases to January 15, 2026).
 * Single source of truth; nothing is fetched at runtime. Annual refresh is
 * by hand (Practice Ops) when Adam drops the new EY cards into the Research
 * Library. The version stamp in the widget footer makes staleness visible.
 *
 * Loads as a plain <script> in the browser (exposes window.GivingGap) and
 * via require() in Node for the unit tests.
 */
(function (global) {
  'use strict';

  var PROVINCES = [
    { code: 'AB', name: 'Alberta' },
    { code: 'BC', name: 'British Columbia' },
    { code: 'MB', name: 'Manitoba' },
    { code: 'NB', name: 'New Brunswick' },
    { code: 'NL', name: 'Newfoundland and Labrador' },
    { code: 'NT', name: 'Northwest Territories' },
    { code: 'NS', name: 'Nova Scotia' },
    { code: 'NU', name: 'Nunavut' },
    { code: 'ON', name: 'Ontario' },
    { code: 'PE', name: 'Prince Edward Island' },
    { code: 'QC', name: 'Quebec' },
    { code: 'SK', name: 'Saskatchewan' },
    { code: 'YT', name: 'Yukon' }
  ];

  /*
   * Combined federal + provincial marginal rate on ordinary income, in
   * PERCENT. Each row is [from, rate]; the rate applies from `from` until
   * the next threshold. Transcribed exactly from the EY cards. Apparent
   * quirks are correct per EY — DO NOT "fix" them:
   *   - MB's top rate is lower than the bracket below it (basic personal
   *     amount clawback ends at $400,001);
   *   - BC, NB, NL, NS, ON, PE have non-monotonic low/mid brackets
   *     (low-income reductions and surtax interactions);
   *   - NU's thresholds at 181,440 differ by $1 from other provinces;
   *   - QC rows are the sum of EY's federal (abated) and Quebec tables.
   */
  var BRACKETS = {
    AB: [[0, 0], [16453, 14.00], [22770, 22.00], [58524, 28.50], [61201, 30.50], [117046, 36.00], [154260, 38.00], [181441, 41.29], [185112, 42.29], [246814, 43.29], [258483, 47.00], [370221, 48.00]],
    BC: [[0, 0], [16453, 14.00], [24581, 19.06], [25571, 22.62], [41723, 19.06], [50364, 21.70], [58524, 28.20], [100729, 31.00], [115649, 32.79], [117046, 38.29], [140431, 40.70], [181441, 43.99], [190406, 46.09], [258483, 49.80], [265546, 53.50]],
    MB: [[0, 0], [15781, 10.80], [16453, 24.80], [47001, 26.75], [58524, 33.25], [100001, 37.90], [117046, 43.40], [181441, 46.69], [200001, 47.55], [258483, 51.25], [400001, 50.40]],
    NB: [[0, 0], [16453, 14.00], [22359, 26.40], [49593, 23.40], [52334, 28.00], [58524, 34.50], [104667, 36.50], [117046, 42.00], [181441, 45.29], [193862, 48.79], [258483, 52.50]],
    NL: [[0, 0], [16453, 14.00], [22775, 22.70], [24192, 38.70], [30492, 22.70], [44679, 28.50], [58524, 35.00], [89355, 36.30], [117046, 41.80], [159529, 43.80], [181441, 47.09], [223341, 49.09], [258483, 52.80], [285320, 53.80], [570639, 54.30], [1141276, 54.80]],
    NS: [[0, 0], [15221, 13.79], [16453, 27.79], [21001, 22.79], [30996, 28.95], [58524, 35.45], [61992, 37.17], [97418, 38.00], [117046, 43.50], [157125, 47.00], [181441, 50.29], [258483, 54.00]],
    NT: [[0, 0], [16453, 14.00], [18199, 19.90], [53004, 22.60], [58524, 29.10], [106010, 32.70], [117046, 38.20], [172347, 40.05], [181441, 43.34], [258483, 47.05]],
    NU: [[0, 0], [16453, 14.00], [19660, 18.00], [55802, 21.00], [58524, 27.50], [111603, 29.50], [117046, 35.00], [181440, 40.79], [258483, 44.50]],
    ON: [[0, 0], [16453, 14.00], [18931, 24.10], [24871, 19.05], [53892, 23.15], [58524, 29.65], [94902, 31.48], [107786, 33.89], [111811, 37.91], [117046, 43.41], [150001, 44.97], [181441, 48.26], [220001, 49.82], [258483, 53.53]],
    PE: [[0, 0], [16453, 14.00], [18685, 23.50], [23001, 28.50], [30001, 23.50], [33929, 27.47], [58524, 33.97], [65821, 37.10], [106891, 38.12], [117046, 43.62], [142251, 45.00], [181441, 48.29], [258483, 52.00]],
    QC: [[0, 0], [16453, 11.69], [18953, 25.69], [54346, 30.69], [58524, 36.12], [108681, 41.12], [117046, 45.71], [132246, 47.46], [181441, 50.21], [258483, 53.31]],
    SK: [[0, 0], [16453, 14.00], [20382, 24.50], [54533, 26.50], [58524, 33.00], [117046, 38.50], [155806, 40.50], [181441, 43.79], [258483, 47.50]],
    YT: [[0, 0], [16453, 20.40], [58524, 29.50], [117046, 36.90], [181441, 42.23], [258483, 45.80], [500001, 48.00]]
  };

  /*
   * Donation tax credit rates in PERCENT, from the same EY cards.
   * Federal (all provinces except QC): 14.00% on the first $200; remainder
   * 29.00%, or 33.00% where taxable income exceeds $258,482. Quebec uses its
   * own abated federal rates below instead of the standard federal ones.
   * Yes, Alberta's first-$200 rate really is 60%. It is not a typo.
   */
  var FED_CREDIT = { first200: 14.00, remainder: 29.00, remainderHigh: 33.00, highThreshold: 258483 };

  var PROV_CREDITS = {
    AB: { first200: 60.00, remainder: 21.00 },
    BC: { first200: 5.06, remainder: 16.80, remainderHigh: 20.50, highThreshold: 265546 },
    MB: { first200: 10.80, remainder: 17.40 },
    NB: { first200: 9.40, remainder: 17.95 },
    NL: { first200: 8.70, remainder: 21.80 },
    NS: { first200: 8.79, remainder: 21.00 },
    NT: { first200: 5.90, remainder: 14.05 },
    NU: { first200: 4.00, remainder: 11.50 },
    ON: { first200: 7.88, remainder: 17.41 },
    PE: { first200: 9.50, remainder: 19.00 },
    QC: {
      fedFirst200: 11.69, fedRemainder: 24.22, fedRemainderHigh: 27.56, fedHighThreshold: 258483,
      first200: 20.00, remainder: 24.00, remainderHigh: 25.75, highThreshold: 132246
    },
    SK: { first200: 10.50, remainder: 14.50 },
    YT: { first200: 6.40, remainder: 12.80 }
  };

  var RATES_AS_OF = 'Tax rates as of January 15, 2026 (EY).';

  var CAPITAL_GAINS_INCLUSION = 0.50;

  /*
   * Bracket where income falls: the rate applies from `from` until the next
   * threshold, so exactly $150,000 in ON reads the 117,046 bracket (43.41%).
   */
  function marginalRate(income, province) {
    var brackets = BRACKETS[province] || BRACKETS.ON;
    var rate = 0;
    for (var i = 0; i < brackets.length; i++) {
      if (income >= brackets[i][0]) rate = brackets[i][1];
    }
    return rate / 100;
  }

  /* Donation credit on a receipt of `fmv`, identical in both scenarios. */
  function donationCredit(fmv, income, province) {
    var c = PROV_CREDITS[province] || PROV_CREDITS.ON;
    var first = Math.min(200, fmv);
    var rest = Math.max(0, fmv - 200);

    var fedFirst, fedRem;
    if (c.fedFirst200 !== undefined) {
      // Quebec: federal credit already reduced by the 16.5% federal abatement.
      fedFirst = c.fedFirst200;
      fedRem = income >= c.fedHighThreshold ? c.fedRemainderHigh : c.fedRemainder;
    } else {
      fedFirst = FED_CREDIT.first200;
      fedRem = income >= FED_CREDIT.highThreshold ? FED_CREDIT.remainderHigh : FED_CREDIT.remainder;
    }

    var provRem = (c.remainderHigh !== undefined && income >= c.highThreshold)
      ? c.remainderHigh
      : c.remainder;

    return (first * (fedFirst + c.first200) + rest * (fedRem + provRem)) / 100;
  }

  /*
   * The comparison. Both scenarios give the charity the same fair market
   * value and produce the same donation receipt; the only difference is the
   * capital gains tax triggered by selling first.
   *
   * Simplification (disclosed in the widget disclaimer): income is treated
   * as taxable income and the gain is not stacked on top of it when
   * determining the marginal rate.
   */
  function compute(input) {
    var province = BRACKETS[input.province] ? input.province : 'ON';
    var income = Math.max(0, Number(input.income) || 0);
    var fmv = Math.max(0, Number(input.worth) || 0);
    var acb = Math.max(0, Number(input.paid) || 0);

    var mRate = marginalRate(income, province);
    var gain = Math.max(0, fmv - acb);
    var capTax = gain * CAPITAL_GAINS_INCLUSION * mRate;
    var credit = donationCredit(fmv, income, province);

    return {
      receipt: fmv,
      credit: credit,
      capTax: capTax,
      costA: fmv - credit + capTax,  // sell the shares, donate the cash
      costB: fmv - credit,           // donate the shares directly
      savings: capTax,
      hasGain: gain > 0,
      marginalRate: mRate
    };
  }

  var GivingGap = {
    PROVINCES: PROVINCES,
    BRACKETS: BRACKETS,
    FED_CREDIT: FED_CREDIT,
    PROV_CREDITS: PROV_CREDITS,
    RATES_AS_OF: RATES_AS_OF,
    marginalRate: marginalRate,
    donationCredit: donationCredit,
    compute: compute
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = GivingGap;
  } else {
    global.GivingGap = GivingGap;
  }
})(typeof window !== 'undefined' ? window : this);
