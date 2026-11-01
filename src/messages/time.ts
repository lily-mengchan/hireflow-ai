/** Shanghai civil time is explicitly UTC+08:00. Unclear dates remain unresolved. */
export function shanghaiInput(date: Date) {
  return new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 16);
}
export function inputToIso(value: string) {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value)) return null;
  const date = new Date(value + ":00+08:00");
  return Number.isFinite(date.getTime()) && shanghaiInput(date) === value ? date.toISOString() : null;
}
function numeric(value: string): number {
  if (/^\d+$/.test(value)) return Number(value);
  const digits: Record<string, number> = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (value.includes("十")) { const [left, right] = value.split("十"); return (left ? digits[left] : 1) * 10 + (right ? digits[right] : 0); }
  return digits[value] ?? NaN;
}
export function resolveMessageTime(text: string | null, messageAt: string): string | null {
  if (!text) return null;
  const explicit = text.match(/\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)/)?.[0];
  if (explicit && Number.isFinite(Date.parse(explicit))) return new Date(explicit).toISOString();
  const hourMatch = text.match(/(凌晨|早上|上午|中午|下午|晚上)?\s*(\d{1,2}|[一二两三四五六七八九十]+)(?:(点|时)(?:(半)|([\d一二两三四五六七八九十]+)分)?|[:：](\d{2}))/);
  if (!hourMatch) return null;
  let hour = numeric(hourMatch[2]);
  const minute = hourMatch[4] ? 30 : hourMatch[5] || hourMatch[6] ? numeric(hourMatch[5] || hourMatch[6]) : 0;
  if (!hourMatch[1] && hour < 12 && !/\d{1,2}[:：]\d\d/.test(hourMatch[0])) return null;
  if (["下午", "晚上"].includes(hourMatch[1]) && hour < 12) hour += 12;
  if (hourMatch[1] === "凌晨" && hour === 12) hour = 0;
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  let day = shanghaiInput(new Date(messageAt)).slice(0, 10);
  const absolute = text.match(/(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})日?/);
  if (absolute) day = `${absolute[1]}-${absolute[2].padStart(2, "0")}-${absolute[3].padStart(2, "0")}`;
  else {
    let offset: number;
    if (/大后天/.test(text)) return null;
    if (/后天/.test(text)) offset = 2;
    else if (/昨天/.test(text)) offset = -1;
    else if (/明天/.test(text)) offset = 1;
    else if (/今天/.test(text)) offset = 0;
    else {
      const week = text.match(/(下周|下星期|本周|这周)[一二三四五六日天]/);
      if (!week) {
        if (!hourMatch[1] || /周|星期|月|日|明|后|昨|前/.test(text)) return null;
        offset = 0; // An explicit daypart alone means the reference date; never roll to tomorrow.
      } else {
        const desired = "一二三四五六日".indexOf(week[0].slice(-1).replace("天", "日"));
        const weekday = (new Date(day + "T00:00:00Z").getUTCDay() + 6) % 7;
        offset = desired - weekday + (/^下/.test(week[1]) ? 7 : 0);
      }
    }
    const shifted = new Date(day + "T00:00:00Z"); shifted.setUTCDate(shifted.getUTCDate() + offset);
    day = shifted.toISOString().slice(0, 10);
  }
  return inputToIso(`${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
}
