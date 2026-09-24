// Классификатор токсичности для расширения. Зависимостей нет, сети нет.
// Повторяет sklearn: TfidfVectorizer(word) + TfidfVectorizer(char_wb) + LogisticRegression.

// sklearn token_pattern = r"(?u)\b\w\w+\b", где \w юникодный.
// В JS \w — только ASCII, поэтому кириллицу задаём через свойства символов.
const WORD_TOKEN = /[\p{L}\p{N}_]{2,}/gu;
const WHITESPACE = /\s+/g;

let MODEL = null;

export async function loadModel(url) {
  MODEL = await (await fetch(url)).json();
  return MODEL;
}

// --- разбор текста на признаки: в точности как в sklearn ---

function wordNgrams(text, [minN, maxN]) {
  const tokens = text.toLowerCase().match(WORD_TOKEN) || [];
  const out = [];
  for (let n = minN; n <= maxN; n++) {
    for (let i = 0; i + n <= tokens.length; i++) out.push(tokens.slice(i, i + n).join(" "));
  }
  return out;
}

function charWbNgrams(text, [minN, maxN]) {
  // sklearn обрамляет каждое слово пробелами и режет n-граммы внутри него
  const doc = text.toLowerCase().replace(WHITESPACE, " ");
  const out = [];
  for (const raw of doc.split(" ")) {
    if (!raw) continue;
    // режем по кодовым точкам, иначе эмодзи разваливается на половинки суррогатной пары
    const w = [...(" " + raw + " ")];
    const len = w.length;
    for (let n = minN; n <= maxN; n++) {
      let offset = 0;
      out.push(w.slice(0, n).join(""));
      while (offset + n < len) { offset++; out.push(w.slice(offset, offset + n).join("")); }
      if (offset === 0) break;          // слово короче n — считаем один раз
    }
  }
  return out;
}

// --- вклад одного блока признаков; каждый блок нормируется по L2 отдельно ---

function blockScore(grams, block) {
  const counts = new Map();
  for (const g of grams) {
    if (Object.hasOwn(block.vocab, g)) counts.set(g, (counts.get(g) || 0) + 1);
  }
  if (counts.size === 0) return 0;

  let norm = 0;
  const values = new Map();
  for (const [g, c] of counts) {
    const tf = block.sublinear ? 1 + Math.log(c) : c;
    const v = tf * block.vocab[g][0];    // × idf
    values.set(g, v);
    norm += v * v;
  }
  norm = Math.sqrt(norm) || 1;

  let s = 0;
  for (const [g, v] of values) s += (v / norm) * block.vocab[g][1];   // × вес логрега
  return s;
}

/** Вероятность того, что комментарий токсичен, от 0 до 1. */
export function toxicProbability(text) {
  if (!MODEL) throw new Error("модель не загружена: сначала loadModel()");
  const t = String(text).replace(WHITESPACE, " ").trim();
  if (!t) return 0;

  const z = MODEL.bias
    + blockScore(wordNgrams(t, MODEL.word.ngram), MODEL.word)
    + blockScore(charWbNgrams(t, MODEL.char.ngram), MODEL.char);

  return 1 / (1 + Math.exp(-z));
}

/** Решение по порогу из модели или заданному вручную. */
export function isToxic(text, threshold = null) {
  return toxicProbability(text) > (threshold ?? MODEL.threshold);
}
