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
 * calculateLunarPhase
 * ─────────────────────────────────────────────────
 * ข้างขึ้น (waxing) = New Moon → Full Moon (วันที่ 1-15)
 * ข้างแรม (waning) = Full Moon → New Moon (วันที่ 1-14/15)
 */
export function calculateLunarPhase(date: Date): LunarResult {
  const moonAge    = getMoonAge(date);
  const halfMonth  = 29.53058867 / 2;

  let phase: LunarPhase;
  let lunarDay: number;
  let phaseNameTh: string;

  if (moonAge < halfMonth) {
    phase       = 'waxing';
    lunarDay    = Math.floor(moonAge) + 1;
    phaseNameTh = 'ข้างขึ้น';
  } else {
    phase       = 'waning';
    lunarDay    = Math.floor(moonAge - halfMonth) + 1;
    phaseNameTh = 'ข้างแรม';
  }

  lunarDay = Math.min(lunarDay, 15);

  return {
    phase,
    day: lunarDay,
    phaseNameTh,
    description: `${phaseNameTh} ${lunarDay} ค่ำ`,
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
  // หาดัชนีช่วงราศีเกิด (1-12)
  let birthPeriodIndex: number;
  if (lunarPhase === 'waning') {
    birthPeriodIndex = lunarMonth >= 4 ? lunarMonth - 3 : lunarMonth + 9;
  } else {
    birthPeriodIndex = lunarMonth >= 5 ? lunarMonth - 4 : lunarMonth + 8;
  }

  const birthPeriod = ZODIAC_PERIODS[birthPeriodIndex - 1];

  // วันปฏิสนธิ: นับถอยหลังไปอีก 9 เดือน (9 ราศี)
  const conceptionPeriodIndex = ((birthPeriodIndex - 1 - 9 + 12) % 12) + 1;
  const conceptionPeriod = ZODIAC_PERIODS[conceptionPeriodIndex - 1];

  // เดือนปฏิสนธิทางจันทรคติ
  const conceptionMonthNum = ((lunarMonth - 1 - 9 + 12) % 12) + 1;
  const thaiMonthNames: Record<number, string> = {
    1: 'เดือน 1 (เดือนอ้าย)', 2: 'เดือน 2 (เดือนยี่)', 3: 'เดือน 3',
    4: 'เดือน 4', 5: 'เดือน 5', 6: 'เดือน 6',
    7: 'เดือน 7', 8: 'เดือน 8', 9: 'เดือน 9',
    10: 'เดือน 10', 11: 'เดือน 11', 12: 'เดือน 12'
  };

  return {
    birthZodiac: birthPeriod.zodiac,
    birthZodiacElement: birthPeriod.element,
    birthSamutthana: birthPeriod.samutthana,
    birthRakon: birthPeriod.rakon,
    birthElementDesc: `${birthPeriod.element} ${birthPeriod.samutthana} ${birthPeriod.rakon} ${birthPeriod.zodiac}`,

    conceptionLunarMonth: thaiMonthNames[conceptionMonthNum] ?? `เดือน ${conceptionMonthNum}`,
    conceptionZodiac: conceptionPeriod.zodiac,
    conceptionZodiacElement: conceptionPeriod.element,
    conceptionSamutthana: conceptionPeriod.samutthana,
    conceptionRakon: conceptionPeriod.rakon,
    conceptionElementDesc: `${conceptionPeriod.element} ${conceptionPeriod.samutthana} ${conceptionPeriod.rakon} ${conceptionPeriod.zodiac}`,
  };
}
