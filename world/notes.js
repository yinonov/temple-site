// Place notes: what a visitor learns depends on where they stand and what is going on there. Every sourced note says
// where it comes from in its own words and points at fact ids; an imagined note says it is imagined. Notes never look
// like speech bubbles.
// `at` and `radius` (metres) say where a note can be read; `during` limits it to a running routine.
import { zoneOf } from "./places.js";

export const NOTES = [
  {
    id: "altar", at: [-11, -46.8], radius: 16, facts: ["tamid-1-4-firelight", "tamid-1-4-climb", "tamid-2-1-brothers"],
    he: "המזבח. לפי משנה תמיד א, ד, בבוקר נכנס אליו כהן אחד לבדו, בלי נר, לאור האש שעליו. לפי תמיד ב, א, כשירד, רצו אחיו ועלו אחריו.",
    en: "The altar. According to Mishnah Tamid 1:4, at daybreak one priest went up to it alone, with no lamp, by the light of its fire. According to Tamid 2:1, when he came down, his brothers ran and went up after him.",
  },
  {
    id: "lottery", during: ["before-dawn", "before-dawn-festival"], at: [-44, -74.4], radius: 12, facts: ["tamid-1-2-lottery", "yoma-2-1-fingers", "yoma-2-2-race"],
    he: "הפיס. לפי משנה יומא ב, א–ב, פעם רצו הכהנים על הכבש וכשאחד נדחף ונשברה רגלו, תיקנו לחלק את העבודה בגורל. מוציאים אצבע אחת או שתיים, ולא אגודל.",
    en: "The lottery. According to Mishnah Yoma 2:1–2, priests once raced up the ramp; when one was pushed and broke his leg, the work was given out by lot instead. Each holds out one or two fingers, never a thumb.",
  },
  {
    id: "laver", at: [-22.5, -36.5], radius: 7, facts: ["middot-3-6-laver", "tamid-1-4-wheel"],
    he: "הכיור. לפי משנה מידות ג, ו, עמד בין האולם למזבח, משוך לדרום. לפי תמיד א, ד, כששמעו את קול העץ שעשה בן קטין לכיור, אמרו: הגיע עת.",
    en: "The laver. According to Mishnah Middot 3:6, it stood between the porch and the altar, drawn toward the south. According to Tamid 1:4, when they heard the wooden wheel Ben Katin made for it, they said: the time has come.",
  },
  {
    id: "great-gate", at: [-30, -46.8], radius: 10, facts: ["tamid-3-7-bolt", "tamid-3-7-sound"],
    he: "השער הגדול של ההיכל. לפי משנה תמיד ג, ז, הכהן נכנס בפשפש הצפוני, הגיע לשער מבפנים, העביר את הנגר ואת הפותחות ופתחו. כשהוא פתוח אפשר להיכנס להיכל, עד הפרוכת.",
    en: "The great gate of the Sanctuary. According to Mishnah Tamid 3:7, the priest went in by the small northern door, reached the gate from inside, drew the bolt and the latches and opened it. While it stands open you may go into the Sanctuary, as far as the curtain.",
  },
  {
    id: "porch-steps", at: [-25, -46.8], radius: 6, facts: ["tamid-7-2-blessing"],
    he: "מעלות האולם. לפי משנה תמיד ז, ב, כאן עמדו הכהנים וברכו את העם, ובמקדש הרימו ידיהם מעל ראשיהם.",
    en: "The steps of the porch. According to Mishnah Tamid 7:2, the priests stood here to bless the people, and in the Temple they raised their hands above their heads.",
  },
  {
    id: "levites", at: [4, -46.8], radius: 8, facts: ["middot-2-5-steps", "tamid-7-3-trumpets", "tamid-7-3-song"],
    he: "כאן שרים הלוים. לפי משנה מידות ב, ה, חמש עשרה מעלות עולות מעזרת הנשים, ועליהן אמרו הלוים שיר. לפי תמיד ז, ג, שני כהנים תקעו בחצוצרות כסף; הקיש בן ארזא בצלצל, ודברו הלוים בשיר, ועל כל פרק תקעו והשתחוו העם.",
    en: "Where the Levites sing. According to Mishnah Middot 2:5, fifteen steps rise from the women's court, and on them the Levites sang. According to Tamid 7:3, two priests sounded silver trumpets; Ben Arza struck the cymbal and the Levites sang, and at each section the trumpet sounded and the people bowed.",
  },
  {
    id: "priest-garments", during: ["morning-service", "afternoon-service", "day-duty"], at: [-2, -40], radius: 14, facts: ["yoma-7-5-garments"],
    he: "בגדי הכהנים. לפי משנה יומא ז, ה, ההדיוט משמש בארבעה כלים: כתונת, מכנסים, מצנפת ואבנט. הצבעים והגזרה כאן דמיון.",
    en: "The priests' clothes. According to Mishnah Yoma 7:5, an ordinary priest served in four garments: tunic, breeches, turban and sash. The colours and cut here are imagined.",
  },
  {
    id: "nicanor", at: [9, -46.8], radius: 6, facts: ["middot-1-4-gates"],
    he: "שער נקנור. לפי משנה מידות א, ד, לעזרה היו שבעה שערים: שלושה בצפון, שלושה בדרום ואחד במזרח, הוא שער נקנור.",
    en: "The Nicanor gate. According to Mishnah Middot 1:4, the court had seven gates: three on the north, three on the south, and one on the east, the Nicanor gate.",
  },
  {
    id: "hearth", at: [-56, -76], radius: 10, facts: ["middot-1-8-hearth", "middot-1-9-keys"],
    he: "בית המוקד (מיקומו כאן משוער). לפי משנה מידות א, ח–ט, זקני הכהנים ישנו בו ומפתחות העזרה בידם; בערב הרים הכהן טבלת שיש בטבעת, נטל את המפתחות ונעל.",
    en: "The Chamber of the Hearth (placed here by guess). According to Mishnah Middot 1:8–9, the elder priests slept here with the keys of the court; at evening a priest lifted a marble slab by its ring, took the keys and locked up.",
  },
  {
    id: "night-watch", during: "night-watch", at: [0, 0], radius: 200, facts: ["middot-1-1-watch", "middot-1-2-rounds"],
    he: "משמרת הלילה. לפי משנה מידות א, א–ב, כהנים שמרו בשלושה מקומות ולוים בעשרים ואחד, ואיש הר הבית סובב בין המשמרות ואבוקות דולקות לפניו.",
    en: "The night watch. According to Mishnah Middot 1:1–2, priests kept watch in three places and Levites in twenty-one, and the officer of the Temple Mount went round them with torches burning before him.",
  },
  {
    id: "search", during: ["before-dawn", "before-dawn-festival"], at: [-30, -76], radius: 30, facts: ["tamid-1-3-search"],
    he: "לפני השחר. לפי משנה תמיד א, ג, שתי כיתות עם אבוקות בודקות את העזרה לאורך האכסדראות, וכשהן נפגשות אומרות: שלום, הכול שלום.",
    en: "Before dawn. According to Mishnah Tamid 1:3, two groups with torches search the court along the colonnades, and when they meet they say: peace, all is peace.",
  },
  {
    id: "barkai", during: "barkai", at: [5, -46.8], radius: 40, facts: ["tamid-3-2-go", "tamid-3-2-barkai", "tamid-3-2-hebron"],
    he: "האם הגיע הזמן? לפי משנה תמיד ג, ב, הממונה שלח לראות, והרואה קרא ״ברקאי!״. מתיא בן שמואל מוסיף: ״האיר פני כל המזרח עד שבחברון?״ — ״הין!״",
    en: "Is it time? According to Mishnah Tamid 3:2, the superintendent sent someone to look, and the watcher called “Barkai!” (it shines). Matya ben Shmuel adds: “Is the whole east lit, as far as Hebron?” — “Yes!”",
  },
  {
    id: "shabbat-watch", during: "shabbat-watch", at: [-24, -18.5], radius: 20, facts: ["tamid-5-1-watch"],
    he: "שבת: משמר הכהנים מתחלף. לפי משנה תמיד ה, א, בשבת הוסיפו ברכה למשמר היוצא. שעת ההגעה כאן משוערת.",
    en: "Shabbat: the priestly watch changes. According to Mishnah Tamid 5:1, on Shabbat a blessing was added for the departing watch. The time they arrive here is a guess.",
  },
  {
    id: "heichal", at: [-48, -46.8], radius: 11, facts: ["middot-4-7-length", "middot-4-1-gold"],
    he: "ההיכל. לפי משנה מידות ד, ז, תוכו ארבעים אמה, אחריו אמה טרקסין ואחריה עשרים אמה בית קודש הקודשים. לפי מידות ד, א, פתחו גבוה עשרים אמה ורחב עשר, וכל הבית טוח בזהב.",
    en: "The Sanctuary. According to Mishnah Middot 4:7, it is forty cubits long inside, then a cubit (the amah traksin), then the Holy of Holies, twenty cubits. According to Middot 4:1, its doorway is twenty cubits high and ten wide, and the whole house is overlaid with gold.",
  },
  {
    id: "curtain", at: [-57.5, -46.8], radius: 3.5, facts: ["yoma-5-1-curtains"],
    he: "הפרוכת. לפי משנה יומא ה, א, שתי פרוכות הבדילו בין הקודש לבין קודש הקודשים, וביניהן אמה; רבי יוסי אומר שהייתה שם פרוכת אחת בלבד. כאן הלכנו לפי הדעה הראשונה. מעבר לפרוכת איננו נכנסים ואיננו מראים דבר.",
    en: "The curtain. According to Mishnah Yoma 5:1, two curtains divided the Holy from the Holy of Holies, a cubit apart; Rabbi Yose says there was only one. Here we follow the first view. Beyond the curtain we neither go nor show anything.",
  },
  {
    id: "menorah", at: [-51.5, -43.9], radius: 2.6, facts: ["tamid-3-9-menorah", "tamid-6-1-western-lamp"],
    he: "המנורה. לפי משנה תמיד ג, ט, בבוקר מצא הכהן שתי נרות מזרחיים דולקים; לפני המנורה הייתה אבן ובה שלוש מעלות, ועליה עמד להיטיב את הנרות. לפי תמיד ו, א, השאיר את הנר המערבי דולק, וממנו הדליק את המנורה בין הערביים.",
    en: "The menorah. According to Mishnah Tamid 3:9, in the morning the priest found the two eastern lamps burning; before the menorah was a stone with three steps, and he stood on it to tend the lamps. According to Tamid 6:1, he left the western lamp burning, and from it the menorah was lit toward evening.",
  },
  {
    id: "golden-altar", at: [-50.6, -46.8], radius: 1.8, facts: ["tamid-3-9-inner-altar", "tamid-3-6-teni", "tamid-6-3-incense"],
    he: "המזבח הפנימי. לפי משנה תמיד ג, ט, מי שזכה בדישונו נכנס, נטל את הטני וחפן לתוכו את האפר; לפי תמיד ג, ו, הטני דומה לתרקב גדול של זהב. לפי תמיד ו, ג, המקטיר לא הקטיר עד שאמר לו הממונה ״הקטר״, והעם פרשו.",
    en: "The inner altar. According to Mishnah Tamid 3:9, the priest who won its clearing went in, took the basket and scooped the ashes into it; according to Tamid 3:6, the basket was like a large golden bowl. According to Tamid 6:3, the one burning the incense waited until the superintendent told him “burn!”, and the people drew back.",
  },
  {
    id: "table", at: [-52.2, -49.6], radius: 2.4, facts: ["menachot-11-7-tables"],
    he: "השולחן. לפי משנה מנחות יא, ז, בהיכל עמד שולחן של זהב שעליו לחם הפנים תמיד, ובאולם, על פתח הבית, שני שולחנות: אחד של שיש ואחד של זהב.",
    en: "The table. According to Mishnah Menachot 11:7, inside stood a table of gold with the bread on it always, and in the porch, by the doorway of the house, two tables: one of marble and one of gold.",
  },
  {
    id: "porch-tables", at: [-34.7, -43.4], radius: 2.2, facts: ["menachot-11-7-tables"],
    he: "שני שולחנות באולם. לפי משנה מנחות יא, ז, על שולחן השיש הניחו את לחם הפנים כשהכניסוהו, ועל שולחן הזהב כשהוציאוהו, ״שמעלין בקדש ולא מורידין״.",
    en: "Two tables in the porch. According to Mishnah Menachot 11:7, the bread was set on the marble table as it was brought in and on the golden one as it came out, for in holy things one goes up, never down.",
  },
  {
    id: "shabbat-bread", during: "shabbat-bread", at: [-46, -46.8], radius: 16, facts: ["menachot-11-7-shabbat"],
    he: "שבת: מחליפים את לחם הפנים. לפי משנה מנחות יא, ז, ארבעה כהנים נכנסים, שניים ובידם שני הסדרים ושניים ובידם שני הבזיכים, וארבעה מקדימים לפניהם ליטול את הישנים. השעה כאן משוערת.",
    en: "Shabbat: the bread of the table is changed. According to Mishnah Menachot 11:7, four priests go in, two carrying the two rows and two the two cups of frankincense, and four go ahead of them to take the old away. The hour here is a guess.",
  },
  // Festivals.
  ...["before-dawn-festival", "festival-crowd"].map((during) => ({
    id: during, during, at: [-11, -46.8], radius: 50, facts: ["yoma-1-8-hours"],
    he: "לילה של רגל. לפי משנה יומא א, ח, בכל יום תרמו את המזבח בקריאת הגבר, וברגלים כבר מן האשמורה הראשונה; ועוד לפני שקרא הגבר הייתה העזרה מלאה מישראל.",
    en: "A festival night. According to Mishnah Yoma 1:8, the altar was cleared each day at cockcrow, but on the pilgrim festivals from the first watch of the night; and before the cock crowed the court was already full of Israel.",
  })),
  {
    id: "sukkot-willows", during: "sukkot-day", at: [-11, -46.8], radius: 18, facts: ["sukkah-4-5-willows"],
    he: "סוכות: ערבות סביב המזבח. לפי משנה סוכה ד, ה, הביאו ערבות ממוצא שמתחת לירושלים, זקפו אותן בצדי המזבח וראשיהן כפופים על גבי המזבח.",
    en: "Sukkot: willows round the altar. According to Mishnah Sukkah 4:5, willow branches were brought from Motza below Jerusalem and stood up at the altar's sides, their tops bent over it.",
  },
  ...["sukkot-circuit", "sukkot-seven-circuits"].map((during) => ({
    id: during, during, at: [-11, -38], radius: 30, facts: ["sukkah-4-5-circuit", "sukkah-4-5-farewell"],
    he: "סוכות: מקיפים את המזבח. לפי משנה סוכה ד, ה, בכל יום הקיפו את המזבח פעם אחת, וביום השביעי שבע פעמים, ובצאתם אמרו: ״יופי לך מזבח״. מי שהקיפו כאן הם כהנים, לפי בחירתנו.",
    en: "Sukkot: going round the altar. According to Mishnah Sukkah 4:5, each day they went round the altar once, and on the seventh day seven times, and as they left they said: “Beauty is yours, O altar.” That priests walk it here is our choice.",
  })),
  {
    id: "water-libation", during: "water-libation", at: [-11, -26], radius: 30, facts: ["sukkah-4-9-libation"],
    he: "ניסוך המים. לפי משנה סוכה ד, ט, מילאו צלוחית של זהב מן השילוח, ובשער המים תקעו, הריעו ותקעו; הכהן עלה בכבש, והעם אמרו לו: ״הגבה ידך״.",
    en: "The water libation. According to Mishnah Sukkah 4:9, a golden flask was filled from the Shiloah, and at the Water Gate they sounded a long blast, a trill and a long blast; the priest went up the ramp, and the people told him: “Raise your hand.”",
  },
  {
    id: "water-drawing", during: "water-drawing", at: [40, -46.8], radius: 40, facts: ["sukkah-5-1-joy", "sukkah-5-2-lamps", "sukkah-5-3-light", "sukkah-5-4-dance"],
    he: "שמחת בית השואבה. לפי משנה סוכה ה, ב–ד, בעזרת הנשים עמדו מנורות של זהב, ובראשן ספלים של זהב; חסידים ואנשי מעשה רקדו באבוקות, והלוויים ניגנו על חמש עשרה המעלות. ״ולא היה חצר בירושלים שאינה מאירה מאור בית השואבה״. ולפי ה, א: ״כל מי שלא ראה שמחת בית השואבה, לא ראה שמחה מימיו״.",
    en: "The joy of the water-drawing. According to Mishnah Sukkah 5:2–4, golden lamp stands stood in the women's court with golden bowls on top; the pious danced with torches, and the Levites played on the fifteen steps. No courtyard in Jerusalem was unlit by its light. And according to 5:1, whoever has not seen it has never seen joy.",
  },
  {
    id: "water-drawing-dawn", during: "water-drawing-dawn", at: [40, -46.8], radius: 40, facts: ["sukkah-5-4-faces"],
    he: "קרא הגבר. לפי משנה סוכה ה, ד, שני כהנים עמדו בשער העליון ותקעו, ירדו ותקעו עד השער היוצא למזרח, ושם הפכו פניהם למערב.",
    en: "Cockcrow. According to Mishnah Sukkah 5:4, two priests stood at the upper gate and sounded the trumpets, and went down sounding them to the gate that leads east, where they turned their faces to the west.",
  },
  {
    id: "rosh-hashanah", during: "rosh-hashanah-shofar", at: [-5.5, -46.8], radius: 25, facts: ["rosh-hashanah-3-3-shofar", "rosh-hashanah-4-1-shabbat"],
    he: "ראש השנה. לפי משנה ראש השנה ג, ג, השופר של יעל, פשוט, ופיו מצופה זהב, ושתי חצוצרות מן הצדדים; השופר מאריך והחצוצרות מקצרות. לפי ד, א, גם כשחל בשבת תקעו במקדש. השעה כאן משוערת.",
    en: "Rosh Hashanah. According to Mishnah Rosh Hashanah 3:3, the shofar was an ibex horn, straight, its mouth covered with gold, with two trumpets at its sides; the shofar sounds long and the trumpets short. According to 4:1, even on Shabbat it was sounded in the Temple. The hour here is a guess.",
  },
  {
    id: "first-fruits", during: "first-fruits", at: [0, 20], radius: 60, facts: ["bikkurim-3-3-ox", "bikkurim-3-4-basket", "bikkurim-1-3-atzeret"],
    he: "הבאת הביכורים. לפי משנה ביכורים ג, ג–ד, השור הלך לפניהם, קרניו מצופות זהב ועטרת של זית בראשו, והחליל מכה לפניהם עד הר הבית; שם נטל כל אחד את הסל על כתפו ונכנס עד העזרה, והלוויים דיברו בשיר. לפי א, ג, אין מביאים ביכורים קודם לעצרת; שהתהלוכה כאן ביום החג עצמו, זו בחירתנו.",
    en: "Bringing the first fruits. According to Mishnah Bikkurim 3:3–4, the ox walked before them, its horns covered with gold and a crown of olive on its head, and the flute played before them to the Temple Mount; there each took the basket on his shoulder and went in as far as the court, and the Levites sang. According to 1:3, first fruits are not brought before Shavuot; that the procession comes on the festival itself is our choice.",
  },
  {
    id: "yom-kippur", during: "yom-kippur-day", at: [0, 0], radius: 200, facts: ["yoma-3-4-high-priest", "yoma-7-4-feast"],
    he: "יום הכיפורים. לפי משנה יומא ג, ד, את התמיד הקריב הכהן הגדול בעצמו, והוא נכנס להקטיר את הקטורת ולהיטיב את הנרות; את עבודתו איננו מראים, ולכן המקום שקט היום. לפי יומא ז, ד, לעת ערב נכנס שוב, וכשיצא בשלום מן הקודש עשה יום טוב לאוהביו.",
    en: "Yom Kippur. According to Mishnah Yoma 3:4, the High Priest himself offered the daily offering and went in to burn the incense and tend the lamps; we do not show his service, so the place is quiet today. According to Yoma 7:4, toward evening he went in again, and when he came out safely from the Holy he made a feast for his friends.",
  },
  {
    id: "chanukah", during: "chanukah-day", at: [-56, -76], radius: 26, facts: ["middot-1-6-stones"],
    he: "חנוכה. לפי משנה מידות א, ו, באחת מלשכות בית המוקד, המזרחית הצפונית, גנזו בני חשמונאי את אבני המזבח ששיקצום מלכי יוון. הנרות הדולקים הלילה על החומות הם דמיון שלנו.",
    en: "Chanukah. According to Mishnah Middot 1:6, in one chamber of the Chamber of the Hearth, the north-eastern one, the Hasmoneans stored away the stones of the altar that the Greek kings had defiled. The lamps burning on the walls tonight are our imagination.",
  },
  {
    id: "purim", imagined: true, during: "purim-day", at: [0, 0], radius: 200,
    he: "פורים. מה היה במקדש בפורים לא מסופר במקורות שלפנינו; הקהל הגדול כאן הוא דמיון שלנו.",
    en: "Purim. What the Temple was like on Purim is not told in the sources we use; the larger crowd here is our imagination.",
  },
  {
    id: "rosh-chodesh", imagined: true, during: "rosh-chodesh-day", at: [0, 0], radius: 200,
    he: "ראש חודש. הירח חדש בשמיים. מה שנעשה כאן היום מעבר לכך לא מוצג; הקהל הגדול הוא דמיון שלנו.",
    en: "The new month. The moon is new in the sky. What else was done here today is not shown; the larger crowd is our imagination.",
  },
  {
    id: "womens-court", at: [40, -46.8], radius: 30, facts: ["middot-2-5-womens-court"],
    he: "עזרת הנשים. לפי משנה מידות ב, ה, מאה שלושים וחמש אמה על מאה שלושים וחמש, ולשכה בכל אחת מארבע פינותיה.",
    en: "The women's court. According to Mishnah Middot 2:5, a hundred and thirty-five cubits square, with a chamber in each of its four corners.",
  },
  {
    id: "soreg", at: [80, -46.8], radius: 12, facts: ["middot-2-3-soreg"],
    he: "הסורג והחיל. לפי משנה מידות ב, ג, סורג גבוה עשרה טפחים, ולפנים ממנו החיל, רחב עשר אמות.",
    en: "The lattice and the terrace. According to Mishnah Middot 2:3, a lattice ten handbreadths high, and inside it the terrace, ten cubits wide.",
  },
  {
    id: "east", at: [112, -1.8], radius: 22, facts: ["tamid-3-8-sounds", "tamid-3-8-goats", "yoma-20b-call"],
    he: "מבט מזרחה, אל יריחו. לפי משנה תמיד ג, ח, מיריחו שמעו את קול השער הגדול, המגרפה, גביני הכרוז, החליל, הצלצל, השיר והשופר; ורבי אליעזר בן דגלאי מספר שעיזי בית אביו בהר מכוור התעטשו מריח הקטורת. בתלמוד (יומא כ ע״ב) מסופר שגביני קרא לכהנים, ללוויים ולישראל לעמוד במקומם.",
    en: "Looking east, toward Jericho. According to Mishnah Tamid 3:8, in Jericho they heard the great gate, the magrefa, Gevini the herald, the flute, the cymbal, the song and the shofar; and Rabbi Eliezer ben Diglai tells that his father's goats on Har Mikhvar sneezed from the smell of the incense. The Talmud (Yoma 20b) tells that Gevini called priests, Levites and Israel to their places.",
  },
  {
    id: "pilgrims", imagined: true, at: [0, 60], radius: 125,
    he: "צליינים בהר הבית. מי הם, מאין באו ומה הם עושים כאן — דמיון שלנו, כדי שהמקום יחיה.",
    en: "Pilgrims on the Mount. Who they are, where they come from and what they do here is our imagination, to keep the place alive.",
  },
  {
    id: "afternoon", during: "afternoon-service", at: [-11, -46.8], radius: 45, facts: ["pesachim-5-1-tamid"],
    he: "תמיד של בין הערביים. לפי משנה פסחים ה, א, הוא נשחט בשמונה שעות ומחצה וקרב בתשע ומחצה. השעות כאן הן שעות זמניות, מהנץ החמה עד השקיעה.",
    en: "The afternoon daily offering. According to Mishnah Pesachim 5:1, it was slaughtered at eight and a half hours and offered at nine and a half. The hours here are seasonal hours, from sunrise to sunset.",
  },
  ...["afternoon-pesach-eve", "afternoon-pesach-eve-friday"].map((during) => ({
    id: during, during, at: [-11, -46.8], radius: 45, facts: ["pesachim-5-1-eve"],
    he: "ערב פסח. לפי משנה פסחים ה, א, היום התמיד מוקדם בשעה: נשחט בשבע ומחצה וקרב בשמונה ומחצה, ואם חל ערב פסח בערב שבת, בשש ומחצה ובשבע ומחצה. והפסח אחריו.",
    en: "The eve of Pesach. According to Mishnah Pesachim 5:1, today the daily offering comes an hour early: slaughtered at seven and a half hours and offered at eight and a half, and when the eve falls on a Friday, at six and a half and seven and a half. The Pesach offering follows it.",
  })),
  {
    id: "day", imagined: true, during: "day-duty", at: [-20, -46.8], radius: 40,
    he: "שעות היום. מה עושים הכהנים בין עבודת הבוקר לעבודת הערב מסופר מעט; כאן הם עסוקים בעזרה לפי דמיוננו.",
    en: "The hours of the day. Little is told of what the priests did between the morning and afternoon service; here they are busy about the court as we imagine it.",
  },
];

const inside = (x, z) => zoneOf(x, z) === "heichal";

/** Notes readable at (x, z) at a moment when `routines` are running, nearest first. */
export function notesAt(x, z, routines = []) {
  const running = new Set(routines.map((r) => r.id));
  // A note about the court does not reach into the Sanctuary, nor one about the Sanctuary out into the court.
  const sameSide = (n) => n.radius > 60 || inside(...n.at) === inside(x, z);
  // Closer and more specific first: a note for what is happening here now beats a note about the whole Mount.
  const score = (n) => Math.hypot(n.at[0] - x, n.at[1] - z) / n.radius + (n.radius > 60 ? 0.8 : 0) - (n.during ? 0.25 : 0);
  return NOTES.filter((n) => sameSide(n) && (!n.during || [].concat(n.during).some((d) => running.has(d))) && Math.hypot(n.at[0] - x, n.at[1] - z) <= n.radius)
    .sort((a, b) => score(a) - score(b));
}
