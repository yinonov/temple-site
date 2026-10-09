// Words the page uses, and the clock line: shared by the app and by the text page shown where WebGL is missing.
export const UI = {
  he: { follow: "בעקבות הקול, ליריחו", back: "חזרה להר הבית", heard: "נשמע ביריחו", lang: "English", soundOn: "קול פועל. לחצו להשתקה", soundOff: "קול כבוי. לחצו להפעלה", canvas: "הר הבית, תצוגה תלת־ממדית", plain: "הדפדפן הזה לא מציג את הר הבית בתלת־ממד. כך נראה עכשיו, במילים:", noteRegion: "על המקום שבו אתם עומדים", source: "מן המקורות", imagined: "דמיון", shabbat: "שבת", day: "שעה {n} ביום", night: "משמרת {n} בלילה", weekday: ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"] },
  en: { follow: "Follow the sound to Jericho", back: "Back to the Mount", heard: "Heard in Jericho", lang: "עברית", soundOn: "Sound on. Press to mute", soundOff: "Sound off. Press to turn on", canvas: "The Temple Mount, a 3D view", plain: "This browser cannot show the Mount in 3D. Here is what is going on there now, in words:", noteRegion: "About where you stand", source: "From the sources", imagined: "Imagined", shabbat: "Shabbat", day: "Hour {n} of the day", night: "Watch {n} of the night", weekday: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Shabbat"] },
};
export const FESTIVAL = {
  he: { pesach: "פסח", shavuot: "שבועות", sukkot: "סוכות", "shemini-atzeret": "שמיני עצרת", "rosh-hashanah": "ראש השנה", "yom-kippur": "יום הכיפורים", chanukah: "חנוכה", purim: "פורים", "rosh-chodesh": "ראש חודש" },
  en: { pesach: "Pesach", shavuot: "Shavuot", sukkot: "Sukkot", "shemini-atzeret": "Shemini Atzeret", "rosh-hashanah": "Rosh Hashanah", "yom-kippur": "Yom Kippur", chanukah: "Chanukah", purim: "Purim", "rosh-chodesh": "Rosh Chodesh" },
};
const hebrewNumber = (n) => {
  const ones = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"], tens = ["", "י", "כ", "ל"];
  if (n === 15) return "ט״ו";
  if (n === 16) return "ט״ז";
  const s = tens[Math.floor(n / 10)] + ones[n % 10];
  return s.length > 1 ? `${s.slice(0, -1)}״${s.slice(-1)}` : `${s}׳`;
};


export function clockText(w, lang) {
  const time = new Intl.DateTimeFormat(lang === "he" ? "he-IL" : "en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" }).format(w.t);
  const c = w.calendar;
  const date = lang === "he" ? `${UI.he.weekday[c.weekday]}, ${hebrewNumber(c.day)} ב${c.monthNameHe}` : `${UI.en.weekday[c.weekday]}, ${c.day} ${c.monthName}`;
  const hour = w.time.part === "day" ? UI[lang].day.replace("{n}", Math.floor(w.time.hour) + 1) : UI[lang].night.replace("{n}", w.time.watch);
  const marks = [c.shabbat ? UI[lang].shabbat : null, ...c.festivals.map((f) => FESTIVAL[lang][f.id])].filter(Boolean);
  return `<b>${time}</b> ${lang === "he" ? "בירושלים" : "in Jerusalem"}<br>${date} · ${hour}${marks.map((m) => `<span class="day">${m}</span>`).join("")}`;
}
