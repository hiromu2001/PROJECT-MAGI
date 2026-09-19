export type Decision = "APPROVE" | "REJECT" | "ABSTAIN";
export type CoreId = "MELCHIOR" | "BALTHASAR" | "CASPAR";
export type Phase = "IDLE" | "ENCODING" | "DELIBERATING" | "RESULT";

export interface CanonicalObservation {
  provider: "local" | "jev";
  version: string;
  labels: string[];
  values: number[];
  semantic: number[];
  meta: {
    tokenCount: number;
    charCount: number;
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
  posScale: number;
  negScale: number;
  thresholdBias: number;
  inputGain: number[];
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

const INPUT_DIM = 24;
const KC_COUNT = 72;
const STEPS = 24;
const STORE_KEY = "project-magi-learning-v1";
const HISTORY_KEY = "project-magi-history-v1";

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

const containsAny = (text: string, words: string[]) =>
  words.reduce((count, word) => count + (text.includes(word) ? 1 : 0), 0);

export class LocalTextPerceptionProvider implements PerceptionProvider {
  async analyze(raw: string): Promise<CanonicalObservation> {
    const text = raw.trim().toLowerCase();
    const tokens = text.split(/[\s、。！？,.!?;:()[\]{}「」『』]+/u).filter(Boolean);
    const numbers = text.match(/[0-9０-９]+(?:\.[0-9]+)?/g) ?? [];

    const uncertaintyWords = ["かも", "不明", "未定", "迷", "わから", "不確", "maybe", "unknown", "uncertain"];
    const noveltyWords = ["新", "初", "試", "実験", "研究", "導入", "novel", "new", "experiment"];
    const evidenceWords = ["データ", "根拠", "実績", "検証", "比較", "証拠", "data", "evidence", "result"];
    const reversibleWords = ["戻", "中止", "撤回", "試験", "一時", "変更", "revert", "cancel", "trial"];
    const resourceWords = ["円", "万円", "億", "費用", "予算", "投資", "時間", "人員", "コスト", "cost", "budget"];
    const timeWords = ["今日", "明日", "今月", "来月", "年", "月", "日", "期限", "予定", "deadline", "week"];
    const commitmentWords = ["契約", "退職", "転職", "購入", "採用", "本番", "公開", "移行", "commit", "launch"];

    const charCount = [...text].length;
    const tokenCount = Math.max(1, tokens.length);
    const numericDensity = clamp(numbers.length / Math.max(1, tokenCount) * 2.4);
    const lengthSignal = clamp(charCount / 180);
    const cues = [
      lengthSignal,
      numericDensity,
      clamp(containsAny(text, uncertaintyWords) / 3),
      clamp(containsAny(text, noveltyWords) / 3),
      clamp(containsAny(text, evidenceWords) / 3),
      clamp(containsAny(text, reversibleWords) / 2),
      clamp(containsAny(text, resourceWords) / 3),
      clamp(containsAny(text, timeWords) / 3),
      clamp(containsAny(text, commitmentWords) / 2),
    ];

    const semantic = Array.from({ length: 15 }, () => 0);
    const sourceTokens = tokens.length ? tokens : [text || "_"];
    sourceTokens.forEach((token, index) => {
      const h = stableHash(token);
      const bucket = h % semantic.length;
      const bucket2 = (h >>> 8) % semantic.length;
      semantic[bucket] += 0.55 + ((h >>> 16) % 100) / 220;
      semantic[bucket2] += 0.2 + (index % 5) * 0.04;
    });
    const maxSemantic = Math.max(1, ...semantic);
    const normalizedSemantic = semantic.map((v) => clamp(v / maxSemantic));

    return {
      provider: "local",
      version: "local-0.1",
      labels: [
        "TEXT LENGTH",
        "NUMERIC DENSITY",
        "UNCERTAINTY CUE",
        "NOVELTY CUE",
        "EVIDENCE CUE",
        "REVERSIBILITY CUE",
        "RESOURCE CUE",
        "TIME CUE",
        "COMMITMENT CUE",
      ],
      values: cues,
      semantic: normalizedSemantic,
      meta: { tokenCount, charCount },
    };
  }
}

/**
 * JEV integration boundary.
 * Implement analyze() once API access is available.
 * Everything below CanonicalObservation should remain unchanged.
 */
export class JevPerceptionProvider implements PerceptionProvider {
  async analyze(_text: string): Promise<CanonicalObservation> {
    throw new Error("JEV provider is not configured.");
  }
}

export class NeuralEncoder {
  encode(observation: CanonicalObservation): NeuralStimulus {
    const combined = [...observation.values, ...observation.semantic];
    const vector = Array.from({ length: INPUT_DIM }, (_, index) =>
      clamp(combined[index] ?? 0),
    );
    return {
      vector,
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
    learningRate: 0.014,
    noise: 0.015,
    posScale: 1.02,
    negScale: 0.98,
    thresholdBias: 0.04,
    inputGain: [0.95, 1.0, 0.96, 0.88, 1.25, 1.02, 0.92, 1.0, 0.96],
  },
  {
    id: "BALTHASAR",
    number: "02",
    title: "SURVIVAL CORE",
    color: "red",
    learningRate: 0.02,
    noise: 0.022,
    posScale: 0.94,
    negScale: 1.1,
    thresholdBias: 0.02,
    inputGain: [0.92, 1.04, 1.2, 0.88, 0.96, 1.12, 1.28, 1.08, 1.22],
  },
  {
    id: "CASPAR",
    number: "03",
    title: "ADAPTIVE CORE",
    color: "cyan",
    learningRate: 0.028,
    noise: 0.045,
    posScale: 1.08,
    negScale: 0.96,
    thresholdBias: -0.02,
    inputGain: [1.0, 0.96, 0.94, 1.3, 0.98, 1.12, 0.92, 0.96, 0.9],
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
      MELCHIOR: { ...emptyState(), ...parsed.MELCHIOR },
      BALTHASAR: { ...emptyState(), ...parsed.BALTHASAR },
      CASPAR: { ...emptyState(), ...parsed.CASPAR },
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
  const inputToKC = Array.from({ length: KC_COUNT }, () =>
    Array.from({ length: INPUT_DIM }, () => {
      const connected = rng() > 0.71;
      return connected ? 0.055 + rng() * 0.085 : 0;
    }),
  );
  const pos = Array.from({ length: KC_COUNT }, () => 0.035 + rng() * 0.095);
  const neg = Array.from({ length: KC_COUNT }, () => 0.035 + rng() * 0.095);
  return { inputToKC, pos, neg };
}

const COMMON = buildCommonTopology();

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

  const gainedInput = stimulus.vector.map((value, i) => {
    const gain = i < profile.inputGain.length ? profile.inputGain[i] : 1;
    return clamp(value * gain);
  });

  for (let step = 0; step < STEPS; step += 1) {
    let active = 0;
    let posStep = 0;
    let negStep = 0;
    const pulse = 0.88 + 0.18 * Math.sin((step / STEPS) * Math.PI);

    for (let k = 0; k < KC_COUNT; k += 1) {
      let current = 0;
      const weights = COMMON.inputToKC[k];
      for (let i = 0; i < INPUT_DIM; i += 1) {
        current += gainedInput[i] * weights[i];
      }
      const noise = (rng() - 0.5) * profile.noise;
      v[k] = v[k] * 0.84 + current * pulse + noise;
      const threshold = 0.58 + profile.thresholdBias + (k % 7) * 0.01;
      if (v[k] >= threshold) {
        active += 1;
        spikeCounts[k] += 1;
        eligibility[k] = clamp(eligibility[k] * 0.9 + 0.23);
        v[k] = 0.08;
        posStep += Math.max(0.001, COMMON.pos[k] * profile.posScale + learning.posDelta[k]);
        negStep += Math.max(0.001, COMMON.neg[k] * profile.negScale + learning.negDelta[k]);
      } else {
        eligibility[k] *= 0.94;
      }
    }

    posTotal += posStep;
    negTotal += negStep;
    posWindow.push(posStep);
    negWindow.push(negStep);
    series.push(active);

    if (step > 7 && settleTick === STEPS) {
      const recent = posWindow.slice(-4).reduce((a, b) => a + b, 0) -
        negWindow.slice(-4).reduce((a, b) => a + b, 0);
      if (Math.abs(recent) > 0.12) settleTick = step;
    }
  }

  const normalization = Math.max(1, STEPS * 0.62);
  const positive = posTotal / normalization;
  const negative = negTotal / normalization;
  const margin = positive - negative;
  const activity = clamp(spikeCounts.reduce((a, b) => a + b, 0) / (KC_COUNT * 4.2));

  const margins = posWindow.map((p, i) => p - negWindow[i]);
  const tail = margins.slice(-8);
  const mean = tail.reduce((a, b) => a + b, 0) / Math.max(1, tail.length);
  const variance = tail.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, tail.length);
  const stability = clamp(1 - Math.sqrt(variance) * 3.2);

  let decision: Decision;
  if (activity < 0.015 || Math.abs(margin) < 0.008 || stability < 0.15) {
    decision = "ABSTAIN";
  } else {
    decision = margin >= 0 ? "APPROVE" : "REJECT";
  }

  const marginSignal = clamp(Math.abs(margin) * 5.2);
  const activitySufficiency = clamp(activity / 0.24);
  const decisionStrength = Math.round(
    clamp(marginSignal * 0.55 + stability * 0.3 + activitySufficiency * 0.15) * 1000,
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
    neuronActivity: spikeCounts.map((v) => v / maxSpike),
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
        state.posDelta[i] = Math.max(-0.06, Math.min(0.06, state.posDelta[i] + delta));
        state.negDelta[i] = Math.max(-0.06, Math.min(0.06, state.negDelta[i] - delta * 0.45));
      } else {
        state.negDelta[i] = Math.max(-0.06, Math.min(0.06, state.negDelta[i] + delta));
        state.posDelta[i] = Math.max(-0.06, Math.min(0.06, state.posDelta[i] - delta * 0.45));
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
