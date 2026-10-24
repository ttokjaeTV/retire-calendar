/* 노후 월급 달력 엔진 — 국민연금 + 연금계좌 인출 + 일반계좌 배당을 1~12월로 나눠 '매달 통장에 들어오는 돈'을 계산한다. 금액 원.
 * 제도 숫자는 rules.js(R.PENSION·R.FIN_INCOME·R.NHIS, v2026.3)에서 읽는다.
 *   국민연금: 사용자가 넣은 월 수령액(실수령) 그대로, 매달
 *   연금계좌 인출: 받는 날 만 나이로 연금소득세(소득세법 제129조①5호의2, 지방세 포함) — 세액공제 받은 원금·운용수익 기준.
 *     세액공제 받지 않은 원금만 꺼내면 세금이 없음(옵션). 연 합계가 R.PENSION.separateLimit 넘으면 경고만.
 *   배당: 일반계좌만(ISA·연금계좌 배당은 계좌 안에 쌓임). 국내상장 15.4%, 미국 직투 15%(현지 원천징수) 떼고 지급월에 나눠 넣음.
 *     금융소득(세전 배당 합계)이 R.FIN_INCOME.threshold 넘으면 종합과세, R.NHIS.finIncomeThreshold 넘으면 건보료 반영 — 경고만.
 */
const RC_PATTERNS = {
  m: { label: '매달', months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
  q36: { label: '분기 3·6·9·12월', months: [3, 6, 9, 12] },
  q14: { label: '분기 1·4·7·10월', months: [1, 4, 7, 10] },
  q25: { label: '분기 2·5·8·11월', months: [2, 5, 8, 11] },
  h: { label: '반기 6·12월', months: [6, 12] },
  y4: { label: '연 1회 4월', months: [4] },
};

function rcPensionRate(age, R) {
  for (const [lim, rate] of R.PENSION.rateByAge) if (age < lim) return rate;
  return 0;
}

/* p = { age, nps, pen: { amt, freq: 'm'|'q36'|…, taxFree }, divs: [{ name, invest, yield, pattern, acct: 'kr'|'us' }], target } */
function rcCalendar(p, R) {
  const M = Array.from({ length: 12 }, (_, i) => ({ m: i + 1, nps: 0, pen: 0, penTax: 0, div: 0, divTax: 0, items: [] }));
  // 국민연금
  if (p.nps > 0) M.forEach(x => { x.nps = p.nps; });
  // 연금계좌 인출
  const pen = p.pen || {}, penMonths = (RC_PATTERNS[pen.freq] || RC_PATTERNS.m).months;
  const penRate = pen.taxFree ? 0 : rcPensionRate(p.age, R);
  let penGross = 0;
  if (pen.amt > 0) penMonths.forEach(m => {
    const tax = Math.floor(pen.amt * penRate);
    M[m - 1].pen += pen.amt - tax; M[m - 1].penTax += tax; penGross += pen.amt;
  });
  // 배당
  let divGross = 0;
  (p.divs || []).forEach((d, k) => {
    if (!(d.invest > 0 && d.yield > 0)) return;
    const pat = RC_PATTERNS[d.pattern] || RC_PATTERNS.m;
    const annual = d.invest * d.yield, gross = Math.round(annual / pat.months.length);
    const rate = d.acct === 'us' ? R.FIN_INCOME.usWithholding : R.FIN_INCOME.withholdingWithLocal;
    const tax = Math.floor(gross * rate);
    pat.months.forEach(m => { M[m - 1].div += gross - tax; M[m - 1].divTax += tax; M[m - 1].items.push({ k, net: gross - tax }); divGross += gross; });
  });
  M.forEach(x => { x.total = x.nps + x.pen + x.div; x.short = p.target > 0 ? Math.max(0, p.target - x.total) : 0; });
  const totals = M.map(x => x.total), sum = totals.reduce((s, v) => s + v, 0);
  const min = Math.min(...totals), max = Math.max(...totals);
  // 가장 적은 달을 채우는 분기 배당 달: 세 분기 패턴 중 지금 합이 가장 작은 쪽
  const fill = ['q14', 'q25', 'q36'].map(k => ({ k, s: RC_PATTERNS[k].months.reduce((a, m) => a + M[m - 1].total, 0) }))
    .sort((a, b) => a.s - b.s)[0];
  return {
    months: M, sum, avg: sum / 12, min, max, minMonths: M.filter(x => x.total === min).map(x => x.m),
    maxMonths: M.filter(x => x.total === max).map(x => x.m),
    shortMonths: M.filter(x => x.short > 0).map(x => x.m), shortSum: M.reduce((s, x) => s + x.short, 0),
    penGross, penRate, penOver: penGross > R.PENSION.separateLimit,
    divGross, finOver: divGross > R.FIN_INCOME.threshold, nhisOver: divGross > R.NHIS.finIncomeThreshold,
    taxSum: M.reduce((s, x) => s + x.penTax + x.divTax, 0),
    fill: max > min ? fill.k : null,
  };
}

if (typeof module !== 'undefined') module.exports = { RC_PATTERNS, rcPensionRate, rcCalendar };
