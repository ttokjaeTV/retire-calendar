// 자녀 증여 엔진 시험 — 기대값은 상속세 및 증여세법(2025-10-01 시행본)으로 손계산.
// rules.js는 페이지의 <script src> 버전을 읽어 위쪽 폴더의 허브 clone → 없으면 고정 주소 순으로 찾는다.
(function loadRules() {
  const fs = require('fs'), path = require('path');
  const page = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');
  const rel = page.match(/rules\/v[\d.]+\/rules\.js/)[0];
  let src = null;
  for (let d = __dirname, i = 0; i < 6 && src === null; i++, d = path.dirname(d)) {
    const f = path.join(d, 'ttokjaetv.github.io', rel);
    if (fs.existsSync(f)) src = fs.readFileSync(f, 'utf8');
  }
  if (src === null) src = require('child_process').execFileSync(process.execPath, ['-e',
    `fetch('https://ttokjaetv.github.io/${rel}').then(r => { if (!r.ok) throw new Error(r.status); return r.text(); }).then(t => process.stdout.write(t))`]).toString();
  const m = { exports: {} };
  new Function('module', 'exports', src)(m, m.exports);
  global.TTOKJAE_RULES = m.exports;
})();
const R = global.TTOKJAE_RULES;
const { rcPensionRate, rcCalendar } = require('./engine.js');
const M = 1e4, E = 1e8;
let fail = 0, n = 0;
const eq = (name, got, want) => { n++; if (got !== want) { fail++; console.log(`✗ ${name}: ${got} (기대 ${want})`); } };

// 연금소득세율(받는 날 만 나이): 70세 미만 5.5%, 80세 미만 4.4%, 그 이상 3.3%
eq('69세 5.5%', rcPensionRate(69, R), 0.055);
eq('70세 4.4%', rcPensionRate(70, R), 0.044);
eq('80세 3.3%', rcPensionRate(80, R), 0.033);

// 기본 예시: 65세, 국민연금 120만, 연금계좌 매달 100만, 국내상장 월배당 1억×4%, 미국 직투 분기(3·6·9·12) 1억×3.5%
const base = { age: 65, nps: 120 * M, pen: { amt: 100 * M, freq: 'm' }, target: 350 * M,
  divs: [{ invest: E, yield: 0.04, pattern: 'm', acct: 'kr' }, { invest: E, yield: 0.035, pattern: 'q36', acct: 'us' }] };
let r = rcCalendar(base, R);
// 연금 100만 − 5.5%(55,000) = 945,000 / 월배당 333,333 − 15.4%(51,333) = 282,000 / SCHD형 875,000 − 15%(131,250) = 743,750
eq('1월 = 120만 + 94.5만 + 28.2만', r.months[0].total, 2427000);
eq('3월 = 1월 + 74.375만', r.months[2].total, 3170750);
eq('1년 합계', r.sum, 2427000 * 12 + 743750 * 4);
eq('가장 적은 달 8개(분기 배당 없는 달)', r.minMonths.length, 8);
eq('목표 350만보다 모든 달 부족', r.shortMonths.length, 12);
eq('연금 연 1,200만 → 1,500만 이하', r.penOver, false);
eq('세전 배당 = 333,333×12 + 875,000×4', r.divGross, 333333 * 12 + 875000 * 4);
eq('금융소득 1,000만 이하 → 건보 반영 안 됨', r.nhisOver, false);
eq('빈 달 채우기: 1·4·7·10월 분기 배당', r.fill, 'q14');
eq('세금 합계', r.taxSum, 55000 * 12 + 51333 * 12 + 131250 * 4);

// 세액공제 받지 않은 원금만 꺼내면 세금 없음
r = rcCalendar({ ...base, pen: { amt: 100 * M, freq: 'm', taxFree: true } }, R);
eq('세금 없는 인출', r.months[0].pen, 100 * M);
// 연 1회 인출 · 연금 연 1,500만 초과 경고
r = rcCalendar({ ...base, pen: { amt: 1600 * M, freq: 'y4' } }, R);
eq('연 1회 4월 인출', r.months[3].pen, 1600 * M - Math.floor(1600 * M * 0.055));
eq('다른 달 인출 없음', r.months[4].pen, 0);
eq('연 1,600만 → 1,500만 초과 경고', r.penOver, true);
// 배당이 커서 금융소득 2천만 초과
r = rcCalendar({ ...base, divs: [{ invest: 6 * E, yield: 0.04, pattern: 'm', acct: 'kr' }] }, R);
eq('세전 2,400만 → 종합과세 경고', r.finOver, true);
eq('건보료 반영 경고', r.nhisOver, true);
// 모든 달이 같으면 채울 달 없음
r = rcCalendar({ age: 65, nps: 100 * M, divs: [] }, R);
eq('고른 달력 → 채울 달 없음', r.fill, null);
eq('평균 = 매달', r.avg, 100 * M);

console.log(fail ? `실패 ${fail}/${n}` : `ALL PASS (${n}개)`);
process.exit(fail ? 1 : 0);
