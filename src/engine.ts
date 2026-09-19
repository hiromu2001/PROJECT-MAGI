export type Decision = "APPROVE" | "REJECT" | "ABSTAIN";
export type CoreId = "MELCHIOR" | "BALTHASAR" | "CASPAR";
export type Phase = "IDLE" | "ENCODING" | "DELIBERATING" | "RESULT";
export type ActionType =
  | "INVESTMENT"
  | "CAREER"
  | "PURCHASE"
  | "RESEARCH"
  | "LAUNCH"
  | "RELATIONSHIP"
  | "TRAVEL"
  | "GENERAL";

export const OBSERVATION_LABELS = [
  "COST MAGNITUDE",
  "REVERSIBILITY",
  "UNCERTAINTY",
  "EVIDENCE STRENGTH",
  "TIME PRESSURE",
  "COMMITMENT LEVEL",
  "NOVELTY",
  "DOWNSIDE SCOPE",
  "UPSIDE SCOPE",
  "PERSONAL IMPACT",
  "SOCIAL IMPACT",
  "INFORMATION COMPLETENESS",
] as const;

const FEATURE_COUNT = OBSERVATION_LABELS.length;
const INPUT_DIM = FEATURE_COUNT * 2;
const KC_COUNT = 96;
const STEPS = 28;
const STORE_KEY = "project-magi-learning-v2";
const HISTORY_KEY = "project-magi-history-v2";

export interface CanonicalObservation {
  provider: "local" | "jev";
  version: string;
  labels: string[];
  values: number[];
  semantic: number[];
  meta: {
    tokenCount: number;
    charCount: number;
    actionType: ActionType;
    detectedAmounts: number[];
  };
}

export interface NeuralStimulus {
  vector: number[];
  provider: string;
  providerVersion: string;
}

export interface PerceptionProvider {
  analyze(text: string): Promise<CanonicalObservation>;
}

export interface CoreProfile {
  id: CoreId;
  number: string;
  title: string;
  color: string;
  learningRate: number;
  noise: number;
  thresholdBias: number;
  inputGain: number[];
  highPositive: number[];
  highNegative: number[];
}

export interface CoreResult {
  core: CoreId;
  decision: Decision;
  decisionStrength: number;
  positive: number;
  negative: number;
  margin: number;
  activity: number;
  stability: number;
  settleTick: number;
  spikeSeries: number[];
  neuronActivity: number[];
  eligibility: number[];
}

export interface DeliberationRecord {
  id: string;
  query: string;
  createdAt: string;
  observation: CanonicalObservation;
  results: CoreResult[];
  consensus: Decision | "UNRESOLVED";
  unanimous: boolean;
  dissent?: CoreId;
  provider: string;
}

interface LearningState {
  posDelta: number[];
  negDelta: number[];
  decisions: number;
}

const clamp = (n: number, min = 0, max = 1) => Math.min(max, Math.max(min, n));

function stableHash(value: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalizeText(raw: string) {
  return raw
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function countTerms(text: string, terms: string[]) {
  return terms.reduce((count, term) => count + (text.includes(term) ? 1 : 0), 0);
}

function detectActionType(text: string): ActionType {
  const rules: Array<[ActionType, string[]]> = [
    ["CAREER", ["転職", "退職", "就職", "会社を辞め", "仕事を辞め", "キャリア"]],
    ["INVESTMENT", ["投資", "出資", "資金投入", "株", "運用"]],
    ["PURCHASE", ["購入", "買う", "買おう", "契約する", "契約し", "申し込"]],
    ["RESEARCH", ["研究", "実験", "検証", "分析", "プロトタイプ"]],
    ["LAUNCH", ["本番", "導入", "公開", "リリース", "移行", "ローンチ"]],
    ["RELATIONSHIP", ["別れる", "付き合う", "結婚", "恋人", "彼女", "彼氏"]],
    ["TRAVEL", ["旅行", "行くべき", "出張", "渡航", "遠出"]],
  ];
  let best: { type: ActionType; score: number } = { type: "GENERAL", score: 0 };
  for (const [type, terms] of rules) {
    const score = countTerms(text, terms);
    if (score > best.score) best = { type, score };
  }
  return best.type;
}

type MoneyHit = { amount: number; index: number };

function extractMoney(text: string): MoneyHit[] {
  const hits: MoneyHit[] = [];
  const re = /(\d+(?:\.\d+)?)\s*(億円|億|万円|万|千円|円)/g;
  for (const match of text.matchAll(re)) {
    const value = Number(match[1]);
    const unit = match[2];
    const multiplier =
      unit.startsWith("億") ? 100_000_000 :
      unit.startsWith("万") ? 10_000 :
      unit === "千円" ? 1_000 : 1;
    hits.push({ amount: value * multiplier, index: match.index ?? 0 });
  }
  return hits;
}

function contextAround(text: string, index: number, radius = 18) {
  return text.slice(Math.max(0, index - radius), Math.min(text.length, index + radius));
}

function inferCostMagnitude(text: string, moneyHits: MoneyHit[]) {
  const spendTerms = ["使", "払", "投資", "購入", "買", "費用", "かか", "必要", "出す", "支出", "予算を使"];
  const budgetTerms = ["貯金", "残高", "手元", "予算", "資金", "所持", "貯蓄"];
  const protectiveTerms = ["会社負担", "支給", "補助", "返済不要", "無料", "タダ", "経費", "助成金"];
  const debtTerms = ["借金", "ローン", "返済", "生活費を削", "全財産"];

  const spend = moneyHits.filter((h) => countTerms(contextAround(text, h.index), spendTerms) > 0);
  const budget = moneyHits.filter((h) => countTerms(contextAround(text, h.index), budgetTerms) > 0);

  let score = 0.12;
  const spendAmount = spend.length ? Math.max(...spend.map((h) => h.amount)) :
    moneyHits.length ? Math.max(...moneyHits.map((h) => h.amount)) : 0;

  if (spendAmount > 0) {
    score = clamp((Math.log10(Math.max(10_000, spendAmount)) - 4) / 3.2);
  }
  if (spendAmount > 0 && budget.length) {
    const available = Math.max(...budget.map((h) => h.amount));
    score = Math.max(score, clamp((spendAmount / Math.max(1, available)) * 1.15));
  }
  score += countTerms(text, debtTerms) * 0.16;
  score -= countTerms(text, protectiveTerms) * 0.22;
  if (text.includes("返金不可")) score += 0.12;
  return clamp(score);
}

function actionBaseline(action: ActionType, values: Partial<Record<ActionType, number>>, fallback: number) {
  return values[action] ?? fallback;
}

export class LocalTextPerceptionProvider implements PerceptionProvider {
  async analyze(raw: string): Promise<CanonicalObservation> {
    const text = normalizeText(raw);
    const tokens = text.split(/[\s、。！？,.!?;:()[\]{}「」『』]+/u).filter(Boolean);
    const actionType = detectActionType(text);
    const moneyHits = extractMoney(text);

    const uncertaintyTerms = ["かも", "不明", "未定", "迷", "わから", "分から", "不確", "未知", "自信がない", "情報がない", "よく知らない"];
    const noEvidenceTerms = ["根拠がない", "データがない", "実績がない", "検証していない", "よくわからない", "情報不足"];
    const evidenceTerms = ["データ", "根拠", "実績", "検証済", "検証した", "比較した", "証拠", "結果が出", "試算", "確認済"];
    const strongEvidenceTerms = ["統計", "再現", "複数回", "実証", "第三者", "ベンチマーク"];
    const reversibleTerms = ["戻せ", "中止でき", "撤回でき", "試験", "お試し", "一時", "段階的", "小さく始め", "やめられ", "返金"];
    const irreversibleTerms = ["戻せない", "撤回できない", "取り返し", "退職", "解約不可", "返金不可", "本番一括", "全額"];
    const urgentTerms = ["今日中", "今すぐ", "至急", "急ぎ", "締切", "期限", "明日まで", "残り", "すぐ決め"];
    const commitmentTerms = ["契約", "退職", "転職", "購入", "採用", "本番", "公開", "移行", "結婚", "ローン"];
    const noveltyTerms = ["新しい", "新規", "初めて", "未経験", "実験", "研究", "試す", "未知", "新技術", "新規事業"];
    const downsideTerms = ["損失", "失敗", "損", "危険", "リスク", "借金", "赤字", "失う", "壊", "炎上", "事故", "悪化", "生活費", "全財産"];
    const severeDownsideTerms = ["致命", "破産", "解雇", "健康被害", "法的", "個人情報", "重大", "取り返し"];
    const protectiveTerms = ["返済不要", "会社負担", "支給", "補助", "無料", "失敗しても問題ない", "いつでも中止", "小額", "少額", "試験運用"];
    const upsideTerms = ["利益", "成長", "改善", "成功", "機会", "チャンス", "学べ", "経験", "効率", "売上", "成果", "価値", "可能性"];
    const strongUpsideTerms = ["大幅", "大きく改善", "高い効果", "有望", "黒字", "収益", "昇給", "成長機会"];
    const personalTerms = ["自分", "私", "俺", "貯金", "生活", "仕事", "転職", "退職", "健康", "恋人", "彼女", "彼氏", "家賃"];
    const socialTerms = ["会社", "チーム", "顧客", "ユーザー", "家族", "社会", "部署", "取引先", "社員", "メンバー"];
    const comparisonTerms = ["比較", "一方", "対して", "より", "メリット", "デメリット", "選択肢", "代替"];

    const charCount = [...text].length;
    const tokenCount = Math.max(1, tokens.length);
    const costMagnitude = inferCostMagnitude(text, moneyHits);

    const reversibleBase = actionBaseline(actionType, {
      CAREER: 0.26,
      PURCHASE: 0.42,
      RESEARCH: 0.68,
      LAUNCH: 0.34,
      RELATIONSHIP: 0.32,
      INVESTMENT: 0.48,
      TRAVEL: 0.72,
    }, 0.56);
    const reversibility = clamp(
      reversibleBase +
      countTerms(text, reversibleTerms) * 0.13 -
      countTerms(text, irreversibleTerms) * 0.18 +
      countTerms(text, protectiveTerms) * 0.07,
    );

    const uncertainty = clamp(
      0.18 +
      countTerms(text, uncertaintyTerms) * 0.15 +
      countTerms(text, noEvidenceTerms) * 0.16 +
      (text.includes("もし") ? 0.05 : 0) +
      (text.includes("たぶん") ? 0.08 : 0) -
      countTerms(text, strongEvidenceTerms) * 0.06,
    );

    const evidenceStrength = clamp(
      0.28 +
      countTerms(text, evidenceTerms) * 0.12 +
      countTerms(text, strongEvidenceTerms) * 0.18 -
      countTerms(text, noEvidenceTerms) * 0.2,
    );

    const timePressure = clamp(
      0.08 +
      countTerms(text, urgentTerms) * 0.2 +
      (/\b\d+\s*(日|時間)以内/.test(text) ? 0.16 : 0),
    );

    const commitmentBase = actionBaseline(actionType, {
      CAREER: 0.72,
      PURCHASE: 0.48,
      RESEARCH: 0.34,
      LAUNCH: 0.67,
      RELATIONSHIP: 0.7,
      INVESTMENT: 0.52,
      TRAVEL: 0.28,
    }, 0.32);
    const commitmentLevel = clamp(
      commitmentBase +
      countTerms(text, commitmentTerms) * 0.08 -
      countTerms(text, reversibleTerms) * 0.08,
    );

    const noveltyBase = actionBaseline(actionType, {
      RESEARCH: 0.66,
      LAUNCH: 0.58,
      CAREER: 0.52,
      INVESTMENT: 0.38,
      PURCHASE: 0.28,
      RELATIONSHIP: 0.35,
      TRAVEL: 0.42,
    }, 0.3);
    const novelty = clamp(noveltyBase + countTerms(text, noveltyTerms) * 0.1);

    const downsideScope = clamp(
      0.12 +
      costMagnitude * 0.32 +
      commitmentLevel * 0.16 +
      countTerms(text, downsideTerms) * 0.09 +
      countTerms(text, severeDownsideTerms) * 0.2 -
      countTerms(text, protectiveTerms) * 0.16,
    );

    const upsideBase = actionBaseline(actionType, {
      RESEARCH: 0.48,
      CAREER: 0.46,
      INVESTMENT: 0.36,
      LAUNCH: 0.44,
      PURCHASE: 0.24,
      RELATIONSHIP: 0.34,
      TRAVEL: 0.36,
    }, 0.28);
    const upsideScope = clamp(
      upsideBase +
      countTerms(text, upsideTerms) * 0.08 +
      countTerms(text, strongUpsideTerms) * 0.17,
    );

    const personalImpact = clamp(
      actionBaseline(actionType, {
        CAREER: 0.82,
        RELATIONSHIP: 0.84,
        INVESTMENT: 0.58,
        PURCHASE: 0.48,
        RESEARCH: 0.4,
        LAUNCH: 0.38,
        TRAVEL: 0.5,
      }, 0.36) +
      countTerms(text, personalTerms) * 0.07,
    );

    const socialImpact = clamp(
      0.18 +
      countTerms(text, socialTerms) * 0.11 +
      (actionType === "LAUNCH" ? 0.18 : 0),
    );

    const textDetail = clamp(charCount / 140);
    const informationCompleteness = clamp(
      0.18 +
      evidenceStrength * 0.5 +
      textDetail * 0.22 +
      countTerms(text, comparisonTerms) * 0.08 -
      uncertainty * 0.28,
    );

    const values = [
      costMagnitude,
      reversibility,
      uncertainty,
      evidenceStrength,
      timePressure,
      commitmentLevel,
      novelty,
      downsideScope,
      upsideScope,
      personalImpact,
      socialImpact,
      informationCompleteness,
    ];

    return {
      provider: "local",
      version: "local-semantic-0.2",
      labels: [...OBSERVATION_LABELS],
      values,
      semantic: [],
      meta: {
        tokenCount,
        charCount,
        actionType,
        detectedAmounts: moneyHits.map((h) => h.amount),
      },
    };
  }
}

/**
 * Future JEV integration boundary.
 * JEV should return the same CanonicalObservation semantics.
 * MAGI / SNN / UI should not need to change.
 */
export class JevPerceptionProvider implements PerceptionProvider {
  async analyze(_text: string): Promise<CanonicalObservation> {
    throw new Error("JEV provider is not configured.");
  }
}

export class NeuralEncoder {
  encode(observation: CanonicalObservation): NeuralStimulus {
    const values = Array.from({ length: FEATURE_COUNT }, (_, i) => clamp(observation.values[i] ?? 0.5));
    const complements = values.map((value) => 1 - value);
    return {
      vector: [...values, ...complements],
      provider: observation.provider,
      providerVersion: observation.version,
    };
  }
}

const profiles: CoreProfile[] = [
  {
    id: "MELCHIOR",
    number: "01",
    title: "ANALYTICAL CORE",
    color: "amber",
    learningRate: 0.012,
    noise: 0.012,
    thresholdBias: 0.035,
    inputGain: [0.9, 1.0, 1.08, 1.28, 0.9, 0.96, 0.88, 1.08, 1.12, 0.9, 0.9, 1.25],
    highPositive: [0.15, 0.9, 0.1, 1.35, 0.25, 0.35, 0.5, 0.05, 1.05, 0.55, 0.45, 1.25],
    highNegative: [1.0, 0.1, 1.3, 0.05, 0.65, 0.8, 0.15, 1.25, 0.1, 0.35, 0.3, 0.05],
  },
  {
    id: "BALTHASAR",
    number: "02",
    title: "SURVIVAL CORE",
    color: "red",
    learningRate: 0.02,
    noise: 0.018,
    thresholdBias: 0.015,
    inputGain: [1.2, 1.14, 1.22, 0.95, 1.12, 1.2, 0.8, 1.3, 0.9, 1.0, 1.05, 0.96],
    highPositive: [0.05, 1.2, 0.05, 0.9, 0.1, 0.15, 0.15, 0.02, 0.55, 0.35, 0.45, 0.85],
    highNegative: [1.35, 0.05, 1.45, 0.08, 1.1, 1.2, 0.3, 1.55, 0.15, 0.55, 0.6, 0.08],
  },
  {
    id: "CASPAR",
    number: "03",
    title: "ADAPTIVE CORE",
    color: "cyan",
    learningRate: 0.027,
    noise: 0.032,
    thresholdBias: -0.015,
    inputGain: [0.88, 1.1, 0.88, 0.94, 0.82, 0.9, 1.3, 0.92, 1.28, 1.08, 0.94, 0.94],
    highPositive: [0.25, 1.15, 0.2, 0.65, 0.25, 0.35, 1.45, 0.05, 1.35, 0.75, 0.55, 0.65],
    highNegative: [0.75, 0.05, 0.85, 0.1, 0.45, 0.65, 0.05, 0.9, 0.05, 0.25, 0.35, 0.12],
  },
];

export const MAGI_PROFILES = profiles;

function emptyState(): LearningState {
  return {
    posDelta: Array.from({ length: KC_COUNT }, () => 0),
    negDelta: Array.from({ length: KC_COUNT }, () => 0),
    decisions: 0,
  };
}

function normalizeState(value: Partial<LearningState> | undefined): LearningState {
  if (!value || value.posDelta?.length !== KC_COUNT || value.negDelta?.length !== KC_COUNT) {
    return emptyState();
  }
  return {
    posDelta: value.posDelta,
    negDelta: value.negDelta,
    decisions: value.decisions ?? 0,
  };
}

function loadStates(): Record<CoreId, LearningState> {
  const fallback = {
    MELCHIOR: emptyState(),
    BALTHASAR: emptyState(),
    CASPAR: emptyState(),
  };
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null");
    if (!parsed) return fallback;
    return {
      MELCHIOR: normalizeState(parsed.MELCHIOR),
      BALTHASAR: normalizeState(parsed.BALTHASAR),
      CASPAR: normalizeState(parsed.CASPAR),
    };
  } catch {
    return fallback;
  }
}

function saveStates(states: Record<CoreId, LearningState>) {
  localStorage.setItem(STORE_KEY, JSON.stringify(states));
}

function buildCommonTopology() {
  const rng = mulberry32(0x4d414749);
  const inputToKC: number[][] = [];
  const readoutMix: number[][] = [];

  for (let k = 0; k < KC_COUNT; k += 1) {
    const weights = Array.from({ length: INPUT_DIM }, () => 0);
    const primaryFeature = k % FEATURE_COUNT;
    const primaryComplement = Math.floor(k / FEATURE_COUNT) % 2 === 1;
    const primaryInput = primaryFeature + (primaryComplement ? FEATURE_COUNT : 0);
    weights[primaryInput] = 0.12 + rng() * 0.07;

    let extra = 0;
    while (extra < 3) {
      const input = Math.floor(rng() * INPUT_DIM);
      if (weights[input] === 0) {
        weights[input] = 0.035 + rng() * 0.055;
        extra += 1;
      }
    }

    const total = weights.reduce((a, b) => a + b, 0) || 1;
    inputToKC.push(weights);
    readoutMix.push(weights.map((w) => w / total));
  }

  return { inputToKC, readoutMix };
}

const COMMON = buildCommonTopology();

function readoutSensitivity(k: number, profile: CoreProfile) {
  let positive = 0;
  let negative = 0;
  const mix = COMMON.readoutMix[k];

  for (let input = 0; input < INPUT_DIM; input += 1) {
    const share = mix[input];
    if (!share) continue;
    const feature = input % FEATURE_COUNT;
    const complement = input >= FEATURE_COUNT;
    const highPos = profile.highPositive[feature];
    const highNeg = profile.highNegative[feature];

    positive += share * (complement ? highNeg : highPos);
    negative += share * (complement ? highPos : highNeg);
  }

  return {
    positive: 0.045 + positive * 0.09,
    negative: 0.045 + negative * 0.09,
  };
}

function runCore(
  stimulus: NeuralStimulus,
  profile: CoreProfile,
  learning: LearningState,
  querySeed: number,
): CoreResult {
  const rng = mulberry32(stableHash(profile.id) ^ querySeed ^ 0x51f15e);
  const v = Array.from({ length: KC_COUNT }, () => 0);
  const spikeCounts = Array.from({ length: KC_COUNT }, () => 0);
  const eligibility = Array.from({ length: KC_COUNT }, () => 0);
  const series: number[] = [];
  const posWindow: number[] = [];
  const negWindow: number[] = [];
  let posTotal = 0;
  let negTotal = 0;
  let settleTick = STEPS;

  const gainedInput = stimulus.vector.map((value, input) => {
    const feature = input % FEATURE_COUNT;
    return clamp(value * (profile.inputGain[feature] ?? 1));
  });

  for (let step = 0; step < STEPS; step += 1) {
    let active = 0;
    let posStep = 0;
    let negStep = 0;
    const pulse = 0.86 + 0.2 * Math.sin((step / STEPS) * Math.PI);

    for (let k = 0; k < KC_COUNT; k += 1) {
      let current = 0;
      const weights = COMMON.inputToKC[k];
      for (let input = 0; input < INPUT_DIM; input += 1) {
        current += gainedInput[input] * weights[input];
      }

      const noise = (rng() - 0.5) * profile.noise;
      v[k] = v[k] * 0.82 + current * pulse + noise;
      const threshold = 0.5 + profile.thresholdBias + (k % 9) * 0.008;

      if (v[k] >= threshold) {
        active += 1;
        spikeCounts[k] += 1;
        eligibility[k] = clamp(eligibility[k] * 0.9 + 0.22);
        v[k] = 0.06;

        const sensitivity = readoutSensitivity(k, profile);
        posStep += Math.max(0.001, sensitivity.positive + learning.posDelta[k]);
        negStep += Math.max(0.001, sensitivity.negative + learning.negDelta[k]);
      } else {
        eligibility[k] *= 0.94;
      }
    }

    posTotal += posStep;
    negTotal += negStep;
    posWindow.push(posStep);
    negWindow.push(negStep);
    series.push(active);

    if (step > 8 && settleTick === STEPS) {
      const recent = posWindow.slice(-4).reduce((a, b) => a + b, 0) -
        negWindow.slice(-4).reduce((a, b) => a + b, 0);
      if (Math.abs(recent) > 0.08) settleTick = step;
    }
  }

  const normalization = Math.max(1, STEPS * 0.72);
  const positive = posTotal / normalization;
  const negative = negTotal / normalization;
  const margin = positive - negative;
  const spikeTotal = spikeCounts.reduce((a, b) => a + b, 0);
  const activity = clamp(spikeTotal / (KC_COUNT * 4.6));

  const margins = posWindow.map((p, i) => p - negWindow[i]);
  const tail = margins.slice(-8);
  const mean = tail.reduce((a, b) => a + b, 0) / Math.max(1, tail.length);
  const variance = tail.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, tail.length);
  const stability = clamp(1 - Math.sqrt(variance) * 2.8);

  let decision: Decision;
  if (activity < 0.018 || Math.abs(margin) < 0.012 || stability < 0.17) {
    decision = "ABSTAIN";
  } else {
    decision = margin >= 0 ? "APPROVE" : "REJECT";
  }

  const marginSignal = clamp(Math.abs(margin) * 3.8);
  const activitySufficiency = clamp(activity / 0.22);
  const decisionStrength = Math.round(
    clamp(marginSignal * 0.58 + stability * 0.27 + activitySufficiency * 0.15) * 1000,
  ) / 10;

  const maxSpike = Math.max(1, ...spikeCounts);
  return {
    core: profile.id,
    decision,
    decisionStrength,
    positive,
    negative,
    margin,
    activity,
    stability,
    settleTick,
    spikeSeries: series,
    neuronActivity: spikeCounts.map((value) => value / maxSpike),
    eligibility,
  };
}

function resolve(results: CoreResult[]): {
  consensus: Decision | "UNRESOLVED";
  unanimous: boolean;
  dissent?: CoreId;
} {
  const approve = results.filter((r) => r.decision === "APPROVE");
  const reject = results.filter((r) => r.decision === "REJECT");
  const abstain = results.filter((r) => r.decision === "ABSTAIN");

  if (approve.length >= 2) {
    return {
      consensus: "APPROVE",
      unanimous: approve.length === 3,
      dissent: reject.length === 1 ? reject[0].core : undefined,
    };
  }
  if (reject.length >= 2) {
    return {
      consensus: "REJECT",
      unanimous: reject.length === 3,
      dissent: approve.length === 1 ? approve[0].core : undefined,
    };
  }
  if (abstain.length === 3) {
    return { consensus: "UNRESOLVED", unanimous: true };
  }
  return { consensus: "UNRESOLVED", unanimous: false };
}

export async function simulateWithoutPersistence(query: string): Promise<DeliberationRecord> {
  const provider = new LocalTextPerceptionProvider();
  const observation = await provider.analyze(query);
  const stimulus = new NeuralEncoder().encode(observation);
  const states: Record<CoreId, LearningState> = {
    MELCHIOR: emptyState(),
    BALTHASAR: emptyState(),
    CASPAR: emptyState(),
  };
  const querySeed = stableHash(query + "|" + observation.version);
  const results = profiles.map((profile) =>
    runCore(stimulus, profile, states[profile.id], querySeed),
  );
  const resolution = resolve(results);

  return {
    id: "simulation",
    query,
    createdAt: new Date(0).toISOString(),
    observation,
    results,
    consensus: resolution.consensus,
    unanimous: resolution.unanimous,
    dissent: resolution.dissent,
    provider: observation.provider,
  };
}

export async function deliberate(query: string): Promise<DeliberationRecord> {
  const provider = new LocalTextPerceptionProvider();
  const observation = await provider.analyze(query);
  const stimulus = new NeuralEncoder().encode(observation);
  const states = loadStates();
  const querySeed = stableHash(query + "|" + observation.version);

  const results = profiles.map((profile) =>
    runCore(stimulus, profile, states[profile.id], querySeed),
  );
  const resolution = resolve(results);

  const record: DeliberationRecord = {
    id: String(Date.now()),
    query,
    createdAt: new Date().toISOString(),
    observation,
    results,
    consensus: resolution.consensus,
    unanimous: resolution.unanimous,
    dissent: resolution.dissent,
    provider: observation.provider,
  };
  saveHistory(record);
  return record;
}

export function applyOutcome(
  record: DeliberationRecord,
  followedConsensus: boolean,
  outcome: "SUCCESS" | "FAILURE",
) {
  if (record.consensus === "UNRESOLVED") return;
  const states = loadStates();
  const executed = followedConsensus
    ? record.consensus
    : record.consensus === "APPROVE"
      ? "REJECT"
      : "APPROVE";
  const correctDecision =
    outcome === "SUCCESS"
      ? executed
      : executed === "APPROVE"
        ? "REJECT"
        : "APPROVE";

  record.results.forEach((result) => {
    if (result.decision === "ABSTAIN") return;
    const profile = profiles.find((p) => p.id === result.core)!;
    const state = states[result.core];
    const reward = result.decision === correctDecision ? 1 : -1;
    const aversiveBoost = result.core === "BALTHASAR" && reward < 0 ? 1.28 : 1;
    const adaptiveBoost = result.core === "CASPAR" ? 1.12 : 1;
    const rate = profile.learningRate * aversiveBoost * adaptiveBoost;

    for (let i = 0; i < KC_COUNT; i += 1) {
      const e = result.eligibility[i];
      if (e < 0.01) continue;
      const delta = rate * reward * e;
      if (result.decision === "APPROVE") {
        state.posDelta[i] = Math.max(-0.065, Math.min(0.065, state.posDelta[i] + delta));
        state.negDelta[i] = Math.max(-0.065, Math.min(0.065, state.negDelta[i] - delta * 0.45));
      } else {
        state.negDelta[i] = Math.max(-0.065, Math.min(0.065, state.negDelta[i] + delta));
        state.posDelta[i] = Math.max(-0.065, Math.min(0.065, state.posDelta[i] - delta * 0.45));
      }
    }
    state.decisions += 1;
  });
  saveStates(states);
}

export function resetLearning() {
  localStorage.removeItem(STORE_KEY);
}

function saveHistory(record: DeliberationRecord) {
  const history = getHistory();
  const compact = [record, ...history.filter((r) => r.id !== record.id)].slice(0, 20);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(compact));
}

export function getHistory(): DeliberationRecord[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function clearHistory() {
  localStorage.removeItem(HISTORY_KEY);
}
