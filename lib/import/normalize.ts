import { cleanText } from "./cashbox";

/** Arabic-aware normalization for fuzzy matching of names. */
export function normalizeArabic(v: unknown): string {
  return cleanText(v)
    .normalize("NFC")
    .replace(/[ً-ْـ]/g, "") // harakat + tatweel
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/^(ال)/, "")
    .replace(/\s+(ال)/g, " ")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Cashbox project file → canonical project name. */
export const CASHBOX_PROJECTS: Record<string, string> = {
  "مشروع الجنوب.xlsx": "الجنوب",
  "أسواق الحسون.xlsx": "أسواق الحسون",
  "الشقق.xlsx": "الشقق السكنية",
  "بيت ممدوح.xlsx": "بيت ممدوح",
  "مشروع المسجد.xlsx": "المسجد (يحتاج تحديد)",
};

export const PROJECT_SEED: { name: string; aliases: string[]; sort: number }[] = [
  { name: "الجنوب", aliases: ["سنتر الجنوب", "مشروع الجنوب", "الجنوب سنتر"], sort: 1 },
  { name: "أسواق الحسون", aliases: ["السوبر ماركت", "بيت السوبر ماركت", "اسواق الحسون", "الحسون سنتر", "السوبرماركت"], sort: 2 },
  { name: "الشقق السكنية", aliases: ["الشقق", "مشروع الشقق", "الشقق السكنيه"], sort: 3 },
  { name: "بيت ممدوح", aliases: ["بيت الوالد", "بيت أبو محمد", "بيت ابو محمد", "البيت"], sort: 4 },
  { name: "استراحة أبو محمد", aliases: ["الاستراحة", "استراحة ابو محمد", "استراحة بيت ممدوح", "الاستراحه"], sort: 5 },
  { name: "مسجد الوالد القديم", aliases: ["المسجد القديم"], sort: 6 },
  { name: "مسجد السلامة", aliases: ["جامع السلامة", "مسجد السلامه", "جامع السلامه"], sort: 7 },
  { name: "مسجد الوالد الجديد", aliases: ["الجامع", "المسجد الجديد", "مسجد الوالد"], sort: 8 },
  { name: "المسجد (يحتاج تحديد)", aliases: ["المسجد"], sort: 99 },
];

export function resolveProjectByAlias(raw: string, projects: { id: number; name: string; aliases: string[] }[]): number | null {
  const n = normalizeArabic(raw.replace(/^مشروع\s*/, ""));
  if (!n) return null;
  for (const p of projects) {
    if (normalizeArabic(p.name) === n) return p.id;
    if (p.aliases.some((a) => normalizeArabic(a) === n)) return p.id;
  }
  return null;
}

const WORK_WORDS = /اعمال|أعمال|حساب|مشروع|تركيب|دهان|بلاط|عزل|حفر|دفان|خرسان|رخام|حجر|جبس|تليس|تلييس|مليس|سباك|حداد|نجار|بناء|تشوين|تكييف|تكيف|دكت|ابوكسي|سقال|زجاج|ايجار|إيجار|رمل|تكسير|تنظيف|ديكور|بلدور|كلادنج|اسمنت|جبسن|انتر|صبة|كمر|سور|خزان|فواتير|رخصة|هنجر|سندوتش|صبيز|تربة|مواقف|طابون|خشب|مكاتب|ابواب|أبواب|قبة|ساتر|عظم|عضم|سلالم|بلك|كراسي|قطرة|نافورة|تكميلات|شالية|حمامات|بوابات|رخصه|طباعة|كهرب/;
const SUPPLIER_WORDS = /سمنتكس|خرسانة|الخرسانه|شركة|شركه|مؤسسة|مؤسسه|فواتير|الفوزان|أفلاء|افلاء|صناعات|مكتب|ضوء وقطرة|جي آر سي|الحبيب|زجاج|رخصة/;
const RENTAL_WORDS = /ايجار|إيجار|تأجير|سقالات|معدات/;

/** Ordered keyword → canonical work type. First match wins. */
const WORK_TYPE_RULES: [RegExp, string][] = [
  [/رخصة|رخصه|مكتب هندسي/, "رخص ومكاتب هندسية"],
  [/حفر/, "حفر"],
  [/دفان|تربة|احلال|إحلال/, "دفان وتربة"],
  [/خرسان|سمنتكس|صبيز|صبة قواعد|صبة توسعة|أفلاء|افلاء|الفوزان|كمر مقلوب/, "خرسانة"],
  [/صبة مروحة|صبة المروحة/, "صبة مروحة"],
  [/هنجر|حديد الزامل|سندوتش|ساندوتش/, "هناجر وساندوتش بانل"],
  [/بلك|بناء|عظم|عضم|سور|سلالم|سلم|رامبات/, "بناء وعظم"],
  [/تليس|تلييس|مليس|لياسة/, "تلييس"],
  [/عزل|رغوي/, "عزل"],
  [/سباك/, "سباكة"],
  [/كهرب|إنارة|اناره|انارة/, "كهرباء"],
  [/تكييف|تكيف|مكيف|دكت|مكائن/, "تكييف"],
  [/جبسن بورد|جبس بورد|اسمنت بورد|أسمنت بورد|تقفيل/, "جبس بورد وأسمنت بورد"],
  [/جبس/, "جبس"],
  [/رخام|جلاية|جلي/, "رخام"],
  [/حجر|كلادنج|جي آر سي|جي ار سي/, "حجر وواجهات"],
  [/بلاط|مبلط|سيراميك/, "بلاط"],
  [/انترلوك|انتر لوك|انتر لك|بلدور|أرصفة|ارصفة|مواقف/, "بلدورات وإنترلوك"],
  [/اسفلت|أسفلت/, "أسفلت"],
  [/ابوكسي|إبوكسي|دهان ابوكسي/, "أبوكسي"],
  [/دهان|بوية|بويه/, "دهان"],
  [/حداد|حديد|أبواب حديد|ابواب حديد|قبة|ساتر|شنكو|درابزين/, "حدادة"],
  [/نجار|خشب|دولاب|أبواب|ابواب/, "نجارة وأبواب"],
  [/زجاج|المونيوم|ألمنيوم|الومنيوم|درايش|شبابيك/, "زجاج وألمنيوم"],
  [/سقال|شدة معدنية/, "سقالات"],
  [/تشوين|رمل|بطحاء|اسمنت|أسمنت|طبلية/, "تشوين ومواد"],
  [/ديكور|قرميد/, "ديكور"],
  [/تكسير|ترميم|هدم/, "تكسير وترميم"],
  [/تنظيف|نظافة/, "نظافة"],
  [/طباعة|طابون|رفوف|جندلة/, "تجهيزات"],
  [/ايجار|إيجار|تأجير|معدات/, "إيجار ومعدات"],
  [/زيارات|إشراف|اشراف/, "زيارات وإشراف"],
];

export function canonicalWorkType(...texts: string[]): string {
  const hay = texts.join(" ");
  for (const [re, name] of WORK_TYPE_RULES) if (re.test(hay)) return name;
  return "أخرى";
}

export type HeadingParse = { party: string; workType: string; category: "contractor" | "supplier" | "equipment" | "rental" | "other"; needsReview: boolean; note: string };

/** Split a cashbox heading like "حساب أعمال حفر أرض الشقق / سلطان المشيطي" into party + work type. */
export function parseHeading(headingRaw: string, sheet: string, projectName: string): HeadingParse {
  const heading = cleanText(headingRaw).replace(/^\.\s*/, "");
  const sheetParty = cleanText(sheet).replace(/\(.*?\)/g, "").trim();
  const parts = heading.split(/\s*[\/ـ]{1,4}\s*/).map((p) => p.trim()).filter(Boolean);
  let party = "";
  let work = "";
  let note = "";
  let needsReview = false;

  const PROJECT_WORDS = /السوبر ماركت|السوبرماركت|الشقق|الجنوب|المسجد|بيت ممدوح|أسواق|اسواق|الحسون|الاستراحة|استراحة|البيت|الشالية/;
  const stripAccount = (p: string) => p.replace(/^حساب\s+/, "").trim();
  const isWorkLike = (p: string) => WORK_WORDS.test(stripAccount(p)) || PROJECT_WORDS.test(p);
  const nSheet = normalizeArabic(sheetParty);
  const containsSheet = (p: string) => nSheet.length >= 3 && normalizeArabic(p).includes(nSheet);
  if (parts.length >= 2) {
    const workLike = parts.map(isWorkLike);
    let partyIdx = workLike.filter((w) => !w).length === 1 ? workLike.findIndex((w) => !w) : -1;
    if (partyIdx < 0) partyIdx = parts.findIndex(containsSheet); // ambiguous → the part naming the sheet is the party
    if (partyIdx >= 0) {
      party = stripAccount(parts[partyIdx]);
      work = parts.filter((_, i) => i !== partyIdx).join(" - ");
    } else {
      party = sheetParty;
      work = heading;
      note = "لم يُحدد المقاول من العنوان";
      needsReview = true;
    }
  } else if (parts.length === 1) {
    const p = parts[0];
    if (isWorkLike(p) || p.length < 3) { party = sheetParty; work = p.length < 3 ? "" : p; }
    else { party = p; work = ""; }
  } else {
    party = sheetParty; work = ""; needsReview = true; note = "عنوان فارغ";
  }
  // strip filler from the work type
  work = work
    .replace(/^حساب\s*/g, "").replace(/\s*حساب\s*/g, " ")
    .replace(/\(\s*ج\s*\)/g, "").replace(/\bمشروع\b\s*\S+/g, "")
    .replace(new RegExp(projectName.replace(/[()]/g, "\\$&"), "g"), "")
    .replace(/\b(أعمال|اعمال)\b/g, "").replace(/\s+/g, " ").trim()
    .replace(/^[-\s]+|[-\s]+$/g, "");
  party = party.replace(/^(حساب|المقاول|المهندس|شركة|شركه)\s+/g, "").replace(/\s+/g, " ").trim() || sheetParty;
  if (!party) { party = "غير معروف"; needsReview = true; }
  // canonical category (prefer the work part, then the whole heading, then the sheet name)
  work = canonicalWorkType(work, heading, sheet);

  const who = `${party} ${sheetParty}`;
  let category: HeadingParse["category"] = "contractor";
  if (RENTAL_WORDS.test(work)) category = "rental";
  else if (SUPPLIER_WORDS.test(who) || /^(الخرسانة|سمنتكس|جي آر سي)$/.test(sheetParty)) category = "supplier";
  return { party, workType: work, category, needsReview, note };
}
