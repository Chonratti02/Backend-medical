import { LunarPhase, LunarResult, BodyElement } from '../../models/types';

/**
 * คำนวณ Julian Date Number จาก Date object
 */
function toJulianDate(date: Date): number {
  const year  = date.getFullYear();
  const month = date.getMonth() + 1;
  const day   = date.getDate();

  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;

  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

/**
 * คำนวณวัยของดวงจันทร์ (0 – 29.53 วัน)
 * 0 = New Moon  |  ~14.77 = Full Moon
 */
function getMoonAge(date: Date): number {
  const jd            = toJulianDate(date);
  const knownNewMoon  = 2451549.5;   // 6 January 2000 (JD)
  const synodicMonth  = 29.53058867; // ความยาวเดือนจันทรคติ
  const daysSinceNew  = jd - knownNewMoon;
  return ((daysSinceNew % synodicMonth) + synodicMonth) % synodicMonth;
}

/**
 * รายชื่อปีอธิกวาร (พ.ศ.) ตามประกาศปฏิทินหลวง / ปฏิทิน 100 ปี มาตรฐานพระราชทาน (คัมภีร์สุริยยาตร์)
 * ปีอธิกวารคือปีที่เดือน 7 มี 30 วัน (มีแรม 15 ค่ำ เดือน 7) และมี 355 วัน
 */
export const ATHIKAVAR_BE_YEARS: ReadonlySet<number> = new Set([
  2403, 2408, 2414, 2419, 2424, 2430, 2435, 2441, 2446, 2451, 2457, 2460, 2468, 2472, 2476, 2481, 2486, 2492, 2497,
  2500, 2506, 2513, 2516, 2522, 2530, 2533, 2540, 2543, 2549, 2552, 2559, 2563, 2568, 2573, 2578, 2586, 2589, 2595
]);

const START_Y: [number, number][] = [
  [1901, 0.122733000004352], [1906, 1.91890000045229e-02], [1911, -8.43549999953059e-02],
  [1916, -0.187898999995135], [1921, -0.291442999994964], [1926, 7.44250000052413e-02],
  [1931, -2.91189999945876e-02], [1936, -0.132662999994416], [1941, -0.236206999994245],
  [1946, -0.339750999994074], [1951, -0.443294999993903], [1956, -7.74269999936981e-02],
  [1961, -0.180970999993527], [1966, -0.284514999993356], [1971, -0.388058999993185],
  [1976, -0.491602999993014], [1981, -0.595146999992842], [1986, -0.698690999992671],
  [1991, -0.332822999992466], [1996, -0.436366999992295], [2001, -0.539910999992124],
  [2006, -0.643454999991953], [2011, 0.253001000008218], [2016, 0.149457000008389],
  [2021, -0.484674999991406], [2026, -0.588218999991235], [2031, 0.308237000008937],
  [2036, 0.204693000009108], [2041, 0.101149000009279], [2046, -2.39499999055015e-03],
  [2051, -0.105938999990379], [2056, 0.259929000009826], [2061, 0.156385000009997],
  [2066, 5.28410000101682e-02], [2071, -5.07029999896607e-02], [2076, -0.15424699998949],
  [2081, -0.257790999989318], [2086, 0.108077000010887], [2091, 4.53300001105772e-03],
  [2096, -9.90109999887712e-02], [2101, -0.2025549999886], [2106, -0.306098999988429],
  [2111, -0.409642999988258], [2116, -4.37749999880528e-02], [2121, -0.147318999987882],
  [2126, -0.250862999987711], [2131, -0.354406999987539], [2136, -0.457950999987368],
  [2141, -0.561494999987197], [2146, -0.665038999987026], [2151, -0.299170999986821],
  [2156, -0.40271499998665], [2161, -0.506258999986479], [2166, -0.609802999986308],
  [2171, -0.713346999986137], [2176, 0.183109000014035], [2181, -0.45102299998576],
  [2186, -0.554566999985589], [2191, 0.341889000014582], [2196, 0.238345000014753],
  [2201, 0.134801000014924], [2206, 3.12570000150951e-02], [2211, -7.22869999847338e-02],
  [2216, 0.293581000015471], [2221, 0.190037000015642], [2226, 8.64930000158135e-02],
  [2231, -1.70509999840154e-02], [2236, -0.120594999983844], [2241, -0.224138999983673],
  [2246, 0.141729000016532], [2251, 0.038185000016703], [2256, -6.53589999831259e-02],
  [2261, -0.168902999982955], [2266, -0.272446999982784], [2271, -0.375990999982613],
  [2276, -1.01229999824075e-02], [2281, -0.113666999982236], [2286, -0.217210999982065],
  [2291, -0.320754999981894], [2296, -0.424298999981723], [2301, -0.527842999981552],
  [2306, -0.631386999981381], [2311, -0.265518999981176], [2316, -0.369062999981005],
  [2321, -0.472606999980834], [2326, -0.576150999980662], [2331, -0.679694999980491],
  [2336, 0.21676100001968], [2341, -0.417370999980115], [2346, -0.520914999979944],
  [2351, -0.624458999979773], [2356, 0.271997000020398], [2361, 0.168453000020569],
  [2366, 6.49090000207404e-02], [2371, -3.86349999790885e-02], [2376, 0.327233000021117],
  [2381, 0.223689000021288], [2386, 0.120145000021459], [2391, 1.66010000216299e-02],
  [2396, -0.086942999978199], [2401, -0.190486999978028], [2406, 0.175381000022177],
  [2411, 7.18370000223483e-02], [2416, -3.17069999774806e-02], [2421, -0.135250999977309],
  [2426, -0.238794999977138], [2431, -0.342338999976967], [2436, 2.35290000232378e-02],
  [2441, -8.00149999765911e-02], [2446, -0.18355899997642], [2451, -0.287102999976249],
  [2456, -0.390646999976078]
];

const S_DATES: [number, number, number, number][] = [
  [1902, 1902, 11, 30], [1912, 1912, 12, 8],
  [1922, 1922, 11, 19], [1932, 1932, 11, 27],
  [1942, 1942, 12, 7],  [1952, 1952, 11, 16],
  [1962, 1962, 11, 26], [1972, 1972, 12, 5],
  [1982, 1982, 11, 15], [1992, 1992, 11, 24],
  [2002, 2002, 12, 4],  [2012, 2012, 11, 13],
  [2022, 2022, 11, 23], [2032, 2032, 12, 2],
  [2042, 2042, 12, 12], [2052, 2052, 11, 21],
  [2062, 2062, 12, 1],  [2072, 2072, 12, 9],
  [2082, 2082, 11, 20], [2092, 2092, 11, 28],
  [2102, 2102, 12, 9],  [2112, 2112, 11, 18],
  [2122, 2122, 11, 28], [2132, 2132, 12, 7],
  [2142, 2142, 11, 17], [2152, 2152, 11, 26],
  [2162, 2162, 12, 6],  [2172, 2172, 11, 15],
  [2182, 2182, 11, 25], [2192, 2192, 12, 4],
  [2202, 2202, 12, 15], [2212, 2212, 11, 24],
  [2222, 2222, 12, 4],  [2232, 2232, 12, 12],
  [2242, 2242, 11, 23], [2252, 2252, 12, 1],
  [2262, 2262, 12, 11], [2272, 2272, 11, 20],
  [2282, 2282, 11, 30], [2292, 2292, 12, 9],
  [2302, 2302, 11, 20], [2312, 2312, 11, 29],
  [2322, 2322, 12, 9],  [2332, 2332, 11, 18],
  [2342, 2342, 11, 28], [2352, 2352, 12, 7],
  [2362, 2362, 12, 17], [2372, 2372, 11, 26],
  [2382, 2382, 12, 6],  [2392, 2392, 12, 14],
  [2402, 2402, 11, 25], [2412, 2412, 12, 3],
  [2422, 2422, 12, 13], [2432, 2432, 11, 23],
  [2442, 2442, 12, 2],  [2452, 2452, 12, 11]
];

function xlMod(a: number, b: number): number {
  return a - b * Math.floor(a / b);
}

const devCache = new Map<number, number>();
const athikaVarCache = new Map<number, boolean>();

export function isAthikaMas(iYear: number): boolean {
  const athi = xlMod((iYear - 78) - 0.45222, 2.7118886);
  return athi < 1;
}

function deviation(iYear: number): number {
  if (devCache.has(iYear)) return devCache.get(iYear)!;

  let fYear: number | null = null;
  let fDev = 0.0;
  for (let i = START_Y.length - 1; i >= 0; i--) {
    if (START_Y[i][0] <= iYear) {
      fYear = START_Y[i][0];
      fDev = START_Y[i][1];
      break;
    }
  }
  if (fYear === null) return 0.0;
  if (iYear === fYear) {
    devCache.set(iYear, fDev);
    return fDev;
  }

  let currentDev = fDev;
  for (let y = fYear + 1; y <= iYear; y++) {
    const prev = y - 1;
    let delta = 0;
    if (isAthikaMas(prev)) {
      delta = -0.102356;
    } else if (isAthikaVar(prev)) {
      delta = -0.632944;
    } else {
      delta = 0.367056;
    }
    currentDev += delta;
  }
  devCache.set(iYear, currentDev);
  return currentDev;
}

export function isAthikaVar(iYear: number): boolean {
  if (athikaVarCache.has(iYear)) return athikaVarCache.get(iYear)!;

  const beYear = iYear > 2400 ? iYear : iYear + 543;
  if (beYear >= 2400 && beYear <= 2600) {
    const res = ATHIKAVAR_BE_YEARS.has(beYear);
    athikaVarCache.set(iYear, res);
    return res;
  }

  if (isAthikaMas(iYear)) {
    athikaVarCache.set(iYear, false);
    return false;
  }
  const cutoff = isAthikaMas(iYear + 1) ? 1.69501433191599e-02 : -1.42223099315486e-02;
  const res = deviation(iYear) > cutoff;
  athikaVarCache.set(iYear, res);
  return res;
}

export function lunarDaysInYear(iYear: number): number {
  if (isAthikaMas(iYear)) return 384;
  if (isAthikaVar(iYear)) return 355;
  return 354;
}

export function calcThaiLunar(ceYear: number, ceMonth: number, ceDay: number): {
  phase: 'waxing' | 'waning';
  phaseNameTh: string;
  lunarDay: number;
  lunarMonth: number;
  lunarMonthName: string;
  zodiacYear: string;
  dayOfWeek: string;
} {
  if (!ceYear || isNaN(ceYear)) {
    const now = new Date();
    ceYear = now.getFullYear();
    ceMonth = now.getMonth() + 1;
    ceDay = now.getDate();
  }
  if (ceYear > 2400) {
    ceYear -= 543;
  }

  const cYear = ceYear - 1;
  let beginRow = S_DATES[0];
  for (let i = S_DATES.length - 1; i >= 0; i--) {
    if (S_DATES[i][0] <= cYear) {
      beginRow = S_DATES[i];
      break;
    }
  }

  const currDate = new Date(Date.UTC(beginRow[1], beginRow[2] - 1, beginRow[3]));
  for (let y = currDate.getUTCFullYear() + 1; y < ceYear; y++) {
    const days = lunarDaysInYear(y);
    currDate.setUTCDate(currDate.getUTCDate() + days);
  }

  const endPrevYear = new Date(Date.UTC(currDate.getUTCFullYear(), 11, 31));
  const rDayPrev = Math.round((endPrevYear.getTime() - currDate.getTime()) / 86400000);
  const startThisYear = new Date(Date.UTC(ceYear, 0, 1));
  const targetDate = new Date(Date.UTC(ceYear, ceMonth - 1, ceDay));
  const dayOfYear = Math.round((targetDate.getTime() - startThisYear.getTime()) / 86400000);
  const dayFromOne = rDayPrev + dayOfYear + 1;
  const nbLDay = lunarDaysInYear(ceYear);

  let thS: 'waxing' | 'waning' = 'waxing';
  let phaseNameTh = 'ข้างขึ้น';
  let thM = 0;
  let dofy = dayFromOne;

  if (nbLDay === 354) {
    const months = [29, 30, 29, 30, 29, 30, 29, 30, 29, 30, 29, 30, 29, 30];
    for (let j = 0; j < 14; j++) {
      if (dofy <= months[j]) {
        thM = j + 1;
        break;
      }
      dofy -= months[j];
    }
    if (thM > 12) thM -= 12;
    thS = dofy > 15 ? 'waning' : 'waxing';
    phaseNameTh = dofy > 15 ? 'ข้างแรม' : 'ข้างขึ้น';
    dofy = dofy > 15 ? dofy - 15 : dofy;
  } else if (nbLDay === 355) {
    const months = [29, 30, 29, 30, 29, 30, 30, 30, 29, 30, 29, 30, 29, 30];
    for (let j = 0; j < 14; j++) {
      if (dofy <= months[j]) {
        thM = j + 1;
        break;
      }
      dofy -= months[j];
    }
    if (thM > 12) thM -= 12;
    thS = dofy > 15 ? 'waning' : 'waxing';
    phaseNameTh = dofy > 15 ? 'ข้างแรม' : 'ข้างขึ้น';
    dofy = dofy > 15 ? dofy - 15 : dofy;
  } else if (nbLDay === 384) {
    const months = [29, 30, 29, 30, 29, 30, 29, 30, 30, 29, 30, 29, 30, 29, 30];
    for (let j = 0; j < 15; j++) {
      if (dofy <= months[j]) {
        thM = j + 1;
        break;
      }
      dofy -= months[j];
    }
    if (thM > 13) thM -= 13;
    if (thM === 9) {
      thM = 88;
    } else if ([10, 11, 12, 13].includes(thM)) {
      thM -= 1;
    }
    thS = dofy > 15 ? 'waning' : 'waxing';
    phaseNameTh = dofy > 15 ? 'ข้างแรม' : 'ข้างขึ้น';
    dofy = dofy > 15 ? dofy - 15 : dofy;
  }

  const effectiveZodiacYearCe = thM < 5 ? ceYear - 1 : ceYear;
  const zodiacYears = ['ชวด', 'ฉลู', 'ขาล', 'เถาะ', 'มะโรง', 'มะเส็ง', 'มะเมีย', 'มะแม', 'วอก', 'ระกา', 'จอ', 'กุน'];
  const zIdx = ((effectiveZodiacYearCe - 4) % 12 + 12) % 12;
  const zodiacYear = 'ปี' + zodiacYears[zIdx];

  const thaiDays = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'];
  const localDate = new Date(ceYear, ceMonth - 1, ceDay);
  const dayOfWeek = thaiDays[localDate.getDay()];

  const monthNamesTh: Record<number, string> = {
    1: 'เดือน 1', 2: 'เดือน 2', 3: 'เดือน 3', 4: 'เดือน 4', 5: 'เดือน 5', 6: 'เดือน 6',
    7: 'เดือน 7', 8: 'เดือน 8', 88: 'เดือน 8 สองหน', 9: 'เดือน 9', 10: 'เดือน 10', 11: 'เดือน 11', 12: 'เดือน 12'
  };

  return {
    phase: thS,
    phaseNameTh,
    lunarDay: dofy,
    lunarMonth: thM,
    lunarMonthName: monthNamesTh[thM] || `เดือน ${thM}`,
    zodiacYear,
    dayOfWeek,
  };
}

/**
 * calculateLunarPhase
 * ─────────────────────────────────────────────────
 * คำนวณวันทางจันทรคติไทยแท้ 100% ตามคัมภีร์สุริยยาตร์ / ปฏิทินหลวง 100 ปี
 */
export function calculateLunarPhase(date: Date): LunarResult {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const lunar = calcThaiLunar(y, m, d);
  const moonAge = getMoonAge(date);

  return {
    phase: lunar.phase,
    day: lunar.lunarDay,
    phaseNameTh: lunar.phaseNameTh,
    description: `${lunar.phaseNameTh} ${lunar.lunarDay} ค่ำ`,
    moonAge: parseFloat(moonAge.toFixed(2)),
  };
}

/**
 * คำนวณธาตุเจ้าเรือนตามหลักแพทย์แผนไทย
 */
export function getBodyElement(lunarPhase: LunarPhase, lunarDay: number): BodyElement {
  if (lunarPhase === 'waxing') {
    if (lunarDay <= 7)  return { element: 'ไฟ',     elementEn: 'fire' };
    if (lunarDay <= 11) return { element: 'ลม',     elementEn: 'wind' };
    return                     { element: 'ไฟ-ลม',  elementEn: 'fire-wind' };
  } else {
    if (lunarDay <= 7)  return { element: 'น้ำ',    elementEn: 'water' };
    if (lunarDay <= 11) return { element: 'ดิน',    elementEn: 'earth' };
    return                     { element: 'น้ำ-ดิน', elementEn: 'water-earth' };
  }
}

/**
 * ฐานข้อมูลจักราศีสมุฏฐาน 12 ราศี ตามคัมภีร์แพทย์แผนไทย
 */
export interface ZodiacPeriod {
  periodIndex: number;
  zodiac: string;            // ราศี
  element: string;           // ธาตุ
  samutthana: string;        // สมุฏฐานและสภาวะ
  rakon: string;             // สิ่งระคน
  lunarRangeDesc: string;    // ช่วงเวลาทางจันทรคติ
}

export const ZODIAC_PERIODS: ZodiacPeriod[] = [
  { periodIndex: 1,  zodiac: 'ราศีเมษ',  element: 'ธาตุไฟ', samutthana: 'เตโชสมุฏฐานกำเริบ',   rakon: 'พัทธะปิตตะระคน', lunarRangeDesc: 'แรม 1 ค่ำ เดือน 4 ถึง ขึ้น 15 ค่ำ เดือน 5' },
  { periodIndex: 2,  zodiac: 'ราศีพฤษภ', element: 'ธาตุไฟ', samutthana: 'ปถวีสมุฏฐานกำเริบ',   rakon: 'หทัยวัตถุระคน',   lunarRangeDesc: 'แรม 1 ค่ำ เดือน 5 ถึง ขึ้น 15 ค่ำ เดือน 6' },
  { periodIndex: 3,  zodiac: 'ราศีเมถุน', element: 'ธาตุไฟ', samutthana: 'วาโยสมุฏฐานกำเริบ',   rakon: 'หทัยวาตะระคน',   lunarRangeDesc: 'แรม 1 ค่ำ เดือน 6 ถึง ขึ้น 15 ค่ำ เดือน 7' },
  { periodIndex: 4,  zodiac: 'ราศีกรกฏ', element: 'ธาตุลม', samutthana: 'อาโปสมุฏฐานกำเริบ',   rakon: 'ศอเสมหะระคน',    lunarRangeDesc: 'แรม 1 ค่ำ เดือน 7 ถึง ขึ้น 15 ค่ำ เดือน 8' },
  { periodIndex: 5,  zodiac: 'ราศีสิงห์', element: 'ธาตุลม', samutthana: 'เตโชสมุฏฐานหย่อน',   rakon: 'อพัทธะปิตตะระคน', lunarRangeDesc: 'แรม 1 ค่ำ เดือน 8 ถึง ขึ้น 15 ค่ำ เดือน 9' },
  { periodIndex: 6,  zodiac: 'ราศีกันย์', element: 'ธาตุลม', samutthana: 'ปถวีสมุฏฐานหย่อน',   rakon: 'อุทริยะระคน',     lunarRangeDesc: 'แรม 1 ค่ำ เดือน 9 ถึง ขึ้น 15 ค่ำ เดือน 10' },
  { periodIndex: 7,  zodiac: 'ราศีตุลย์', element: 'ธาตุน้ำ', samutthana: 'วาโยสมุฏฐานหย่อน',   rakon: 'สัตถะกะวาตะระคน', lunarRangeDesc: 'แรม 1 ค่ำ เดือน 10 ถึง ขึ้น 15 ค่ำ เดือน 11' },
  { periodIndex: 8,  zodiac: 'ราศีพิจิก', element: 'ธาตุน้ำ', samutthana: 'อาโปสมุฏฐานหย่อน',   rakon: 'อุระเสมหะระคน',   lunarRangeDesc: 'แรม 1 ค่ำ เดือน 11 ถึง ขึ้น 15 ค่ำ เดือน 12' },
  { periodIndex: 9,  zodiac: 'ราศีธนู',  element: 'ธาตุน้ำ', samutthana: 'เตโชเจ้าสมุฏฐานพิการ', rakon: 'กำเดาระคน',      lunarRangeDesc: 'แรม 1 ค่ำ เดือน 12 ถึง ขึ้น 15 ค่ำ เดือน 1' },
  { periodIndex: 10, zodiac: 'ราศีมังกร', element: 'ธาตุดิน', samutthana: 'ปถวีสมุฏฐานพิการ',   rakon: 'กรีสะระคน',       lunarRangeDesc: 'แรม 1 ค่ำ เดือน 1 ถึง ขึ้น 15 ค่ำ เดือน 2' },
  { periodIndex: 11, zodiac: 'ราศีกุมภ์', element: 'ธาตุดิน', samutthana: 'วาโยสมุฏฐานพิการ',   rakon: 'สุมนาระคน',       lunarRangeDesc: 'แรม 1 ค่ำ เดือน 2 ถึง ขึ้น 15 ค่ำ เดือน 3' },
  { periodIndex: 12, zodiac: 'ราศีมีน',  element: 'ธาตุดิน', samutthana: 'อาโปสมุฏฐานพิการ',   rakon: 'คูถเสมหะระคน',    lunarRangeDesc: 'แรม 1 ค่ำ เดือน 3 ถึง ขึ้น 15 ค่ำ เดือน 4' },
];

export interface ZodiacSamutthanaResult {
  birthZodiac: string;
  birthZodiacElement: string;
  birthSamutthana: string;
  birthRakon: string;
  birthElementDesc: string;

  conceptionLunarMonth: string;
  conceptionZodiac: string;
  conceptionZodiacElement: string;
  conceptionSamutthana: string;
  conceptionRakon: string;
  conceptionElementDesc: string;
}

/**
 * คำนวณจักราศีสมุฏฐานและธาตุปฏิสนธิจากข้อมูลวันเกิดทางจันทรคติ
 * @param lunarPhase 'waxing' (ขึ้น) หรือ 'waning' (แรม)
 * @param lunarMonth เดือนจันทรคติ 1-12
 */
export function calculateZodiacSamutthana(
  lunarPhase: LunarPhase,
  lunarMonth: number
): ZodiacSamutthanaResult {
  const normLunarMonth = lunarMonth === 88 ? 8 : Math.min(Math.max(lunarMonth, 1), 12);

  // หาดัชนีช่วงราศีเกิด (1-12)
  let birthPeriodIndex: number;
  if (lunarPhase === 'waning') {
    birthPeriodIndex = normLunarMonth >= 4 ? normLunarMonth - 3 : normLunarMonth + 9;
  } else {
    birthPeriodIndex = normLunarMonth >= 5 ? normLunarMonth - 4 : normLunarMonth + 8;
  }
  birthPeriodIndex = Math.min(Math.max(birthPeriodIndex, 1), 12);

  const birthPeriod = ZODIAC_PERIODS[birthPeriodIndex - 1];

  // วันปฏิสนธิ: นับถอยหลังไปอีก 9 เดือน (9 เดือนทางจันทรคติ)
  const conceptionMonthNum = ((normLunarMonth - 1 - 9 + 12) % 12) + 1;
  const conceptionPeriodIndex = ((conceptionMonthNum - 5 + 12) % 12) + 1;
  const conceptionPeriod = ZODIAC_PERIODS[conceptionPeriodIndex - 1];

  const thaiMonthNames: Record<number, string> = {
    1: 'มกราคม', 2: 'กุมภาพันธ์', 3: 'มีนาคม',
    4: 'เมษายน', 5: 'พฤษภาคม', 6: 'มิถุนายน',
    7: 'กรกฎาคม', 8: 'สิงหาคม', 9: 'กันยายน',
    10: 'ตุลาคม', 11: 'พฤศจิกายน', 12: 'ธันวาคม'
  };
  const monthName = thaiMonthNames[conceptionMonthNum] || `เดือน ${conceptionMonthNum}`;
  const conceptionLunarMonth = `${monthName}(${conceptionMonthNum})`;

  return {
    birthZodiac: birthPeriod.zodiac,
    birthZodiacElement: birthPeriod.element,
    birthSamutthana: birthPeriod.samutthana,
    birthRakon: birthPeriod.rakon,
    birthElementDesc: `${birthPeriod.element} ${birthPeriod.samutthana} ${birthPeriod.rakon} ${birthPeriod.zodiac}`,

    conceptionLunarMonth: conceptionLunarMonth,
    conceptionZodiac: conceptionPeriod.zodiac,
    conceptionZodiacElement: conceptionPeriod.element,
    conceptionSamutthana: conceptionPeriod.samutthana,
    conceptionRakon: conceptionPeriod.rakon,
    conceptionElementDesc: `${conceptionPeriod.element} ${conceptionPeriod.samutthana} ${conceptionPeriod.rakon} ${conceptionPeriod.zodiac}`,
  };
}
