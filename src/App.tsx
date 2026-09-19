import { useEffect, useMemo, useRef, useState } from "react";
import {
  applyOutcome,
  clearHistory,
  deliberate,
  DeliberationRecord,
  getHistory,
  MAGI_PROFILES,
  Phase,
  resetLearning,
} from "./engine";

const JP: Record<string, string> = {
  APPROVE: "承認",
  REJECT: "否決",
  ABSTAIN: "保留",
  UNRESOLVED: "未決",
};

function formatClock(date: Date) {
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function CorePanel({
  id,
  phase,
  result,
  revealed,
  tick,
}: {
  id: "MELCHIOR" | "BALTHASAR" | "CASPAR";
  phase: Phase;
  result?: DeliberationRecord["results"][number];
  revealed: boolean;
  tick: number;
}) {
  const profile = MAGI_PROFILES.find((p) => p.id === id)!;
  const activity = result?.spikeSeries[tick % (result.spikeSeries.length || 1)] ?? 0;
  const activityPercent = Math.min(100, Math.round((activity / 22) * 100));
  const status =
    phase === "IDLE"
      ? "STANDBY"
      : phase === "ENCODING"
        ? "RECEIVING"
        : revealed && result
          ? result.decision
          : "DELIBERATING";

  return (
    <section className={`core-panel core-${profile.color} ${revealed ? "is-revealed" : ""}`}>
      <div className="core-corner">{profile.number}</div>
      <div className="core-kicker">{profile.number} // {profile.id}</div>
      <div className="core-title">{profile.title}</div>
      <div className={`core-status ${revealed ? "decision-status" : ""}`}>
        {revealed && result ? JP[result.decision] : status}
      </div>

      <div className="meter-label">
        <span>NEURAL ACTIVITY</span>
        <span>{revealed && result ? Math.round(result.activity * 100) : activityPercent}%</span>
      </div>
      <div className="meter"><i style={{ width: `${revealed && result ? Math.max(8, Math.round(result.activity * 100)) : activityPercent}%` }} /></div>

      <div className="core-readout">
        <span>MBON +</span><b>{result ? result.positive.toFixed(3) : "0.000"}</b>
        <span>MBON −</span><b>{result ? result.negative.toFixed(3) : "0.000"}</b>
      </div>

      {revealed && result && (
        <div className="strength">
          <span>DECISION STRENGTH</span>
          <strong>{result.decisionStrength.toFixed(1)}</strong>
        </div>
      )}
    </section>
  );
}

function NeuralGrid({ record }: { record: DeliberationRecord }) {
  const [activeCore, setActiveCore] = useState<"MELCHIOR" | "BALTHASAR" | "CASPAR">("MELCHIOR");
  const result = record.results.find((r) => r.core === activeCore)!;
  return (
    <div className="neural-box">
      <div className="section-head">
        <span>NEURAL ACTIVITY MAP</span>
        <div className="scope-tabs">
          {MAGI_PROFILES.map((p) => (
            <button
              key={p.id}
              onClick={() => setActiveCore(p.id)}
              className={activeCore === p.id ? "active" : ""}
            >
              {p.number}
            </button>
          ))}
        </div>
      </div>
      <div className="neuron-grid">
        {result.neuronActivity.map((value, i) => (
          <i
            key={i}
            className={value > 0.7 ? "hot" : value > 0.2 ? "warm" : ""}
            style={{ opacity: 0.18 + value * 0.82 }}
            title={`KC-${String(i).padStart(3, "0")} / ${Math.round(value * 100)}`}
          />
        ))}
      </div>
      <div className="neural-footer">
        <span>KC-LIKE POPULATION // 72 NODES</span>
        <span>CONNECTOME MODE // CELL-TYPE</span>
      </div>
    </div>
  );
}

function ObservationPanel({ record }: { record: DeliberationRecord }) {
  return (
    <div className="observation-box">
      <div className="section-head">
        <span>CANONICAL OBSERVATION</span>
        <small>{record.observation.version}</small>
      </div>
      <div className="observation-list">
        {record.observation.labels.map((label, i) => (
          <div className="observation-row" key={label}>
            <span>{label}</span>
            <div><i style={{ width: `${record.observation.values[i] * 100}%` }} /></div>
            <b>{record.observation.values[i].toFixed(2)}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

function HistoryStrip({ history }: { history: DeliberationRecord[] }) {
  if (!history.length) return <div className="history-empty">NO PREVIOUS RESOLUTIONS</div>;
  return (
    <div className="history-strip">
      {history.slice(0, 5).map((item) => (
        <div key={item.id} className="history-item">
          <b>#{item.id.slice(-4)}</b>
          <span>{item.query}</span>
          <em className={`history-${item.consensus.toLowerCase()}`}>{JP[item.consensus]}</em>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [booted, setBooted] = useState(false);
  const [clock, setClock] = useState(new Date());
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<Phase>("IDLE");
  const [record, setRecord] = useState<DeliberationRecord | null>(null);
  const [revealed, setRevealed] = useState<string[]>([]);
  const [details, setDetails] = useState(false);
  const [tick, setTick] = useState(0);
  const [history, setHistory] = useState<DeliberationRecord[]>(() => getHistory());
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const bootTimer = window.setTimeout(() => setBooted(true), 1200);
    const clockTimer = window.setInterval(() => setClock(new Date()), 1000);
    return () => {
      window.clearTimeout(bootTimer);
      window.clearInterval(clockTimer);
    };
  }, []);

  useEffect(() => {
    if (phase !== "DELIBERATING") return;
    const t = window.setInterval(() => setTick((v) => v + 1), 115);
    return () => window.clearInterval(t);
  }, [phase]);

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  const begin = async () => {
    const normalized = query.trim();
    if (!normalized || phase !== "IDLE") return;
    clearTimers();
    setDetails(false);
    setFeedbackOpen(false);
    setRecord(null);
    setRevealed([]);
    setPhase("ENCODING");

    const t1 = window.setTimeout(async () => {
      const next = await deliberate(normalized);
      setRecord(next);
      setPhase("DELIBERATING");

      const ordered = [...next.results].sort((a, b) => a.settleTick - b.settleTick);
      ordered.forEach((result, index) => {
        const timer = window.setTimeout(() => {
          setRevealed((prev) => [...prev, result.core]);
        }, 700 + index * 620);
        timers.current.push(timer);
      });

      const finish = window.setTimeout(() => {
        setPhase("RESULT");
        setHistory(getHistory());
      }, 700 + ordered.length * 620 + 380);
      timers.current.push(finish);
    }, 720);
    timers.current.push(t1);
  };

  const newQuery = () => {
    clearTimers();
    setPhase("IDLE");
    setRecord(null);
    setRevealed([]);
    setDetails(false);
    setFeedbackOpen(false);
    setQuery("");
  };

  const resultLabel = record ? JP[record.consensus] : "";
  const consensusClass = record ? record.consensus.toLowerCase() : "";
  const canBegin = query.trim().length > 1 && phase === "IDLE";

  const eventLines = useMemo(() => {
    if (!record) {
      return [
        "SYS // NEURAL ENGINE READY",
        "SYS // LOCAL PERCEPTION ONLINE",
        "SYS // ALL MAGI CORES STANDBY",
      ];
    }
    const lines = [
      "EVT // QUERY RECEIVED",
      `EVT // ${record.observation.version.toUpperCase()} OBSERVATION GENERATED`,
      "EVT // NEURAL STIMULUS BROADCAST",
      ...record.results.map((r) => `EVT // ${r.core} ${r.decision} // STRENGTH ${r.decisionStrength.toFixed(1)}`),
    ];
    if (phase === "RESULT") lines.push(`EVT // CONSENSUS ${record.consensus}`);
    return lines;
  }, [record, phase]);

  const submitFeedback = (outcome: "SUCCESS" | "FAILURE", followed: boolean) => {
    if (!record) return;
    applyOutcome(record, followed, outcome);
    setFeedbackOpen(false);
  };

  return (
    <main className={`app phase-${phase.toLowerCase()}`}>
      <div className="scanlines" />
      {!booted && (
        <div className="boot-screen">
          <div className="boot-mark">M.A.G.I.</div>
          <div>MAGI SYSTEM INITIALIZATION</div>
          <div className="boot-lines">
            <span>NEURAL ENGINE.............OK</span>
            <span>SYNAPTIC MATRIX...........OK</span>
            <span>PERCEPTION PROVIDER.......LOCAL</span>
            <span>CONNECTOME MODE............CELL-TYPE</span>
          </div>
        </div>
      )}

      <header className="topbar">
        <div className="brand">
          <b>M.A.G.I.</b>
          <span>BIO-LOGICAL DECISION COMPUTER</span>
        </div>
        <div className="system-tags">
          <span>LOCAL PERCEPTION</span>
          <span>CELL-TYPE // BROWSER SNN</span>
          <span className="online">ALL CORE ONLINE</span>
        </div>
        <div className="clock">
          <small>JST / SYSTEM CLOCK</small>
          <b>{formatClock(clock)}</b>
        </div>
      </header>

      <section className="console">
        <div className="rail rail-left">
          <div className="vertical-title">PROJECT MAGI</div>
          <div className="rail-number">03</div>
          <div className="rail-copy">INDEPENDENT<br/>NEURAL CORES<br/>MAJORITY 2/3</div>
        </div>

        <div className="main-console">
          <div className="query-banner">
            <span>審議事項</span>
            <b>{record?.query || (phase === "IDLE" ? "入力待機" : query)}</b>
            <em>{phase === "IDLE" ? "AWAITING QUERY" : phase}</em>
          </div>

          <div className="magi-stage">
            <svg className="link-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <path d="M50 12 L21 70 L79 70 Z" />
              <circle cx="50" cy="52" r="6" />
            </svg>

            <div className="core-slot balthasar">
              <CorePanel id="BALTHASAR" phase={phase} result={record?.results.find((r) => r.core === "BALTHASAR")} revealed={revealed.includes("BALTHASAR")} tick={tick}/>
            </div>
            <div className="core-slot caspar">
              <CorePanel id="CASPAR" phase={phase} result={record?.results.find((r) => r.core === "CASPAR")} revealed={revealed.includes("CASPAR")} tick={tick}/>
            </div>

            <div className={`consensus-node ${phase === "RESULT" ? "resolved" : ""} ${consensusClass}`}>
              <small>{phase === "IDLE" ? "SYSTEM READY" : phase === "RESULT" ? "MAGI RESOLUTION" : "POLLING MAGI"}</small>
              <b>{phase === "RESULT" && record ? resultLabel : "MAGI"}</b>
              {phase === "RESULT" && record && (
                <>
                  <strong>
                    {record.consensus === "UNRESOLVED"
                      ? "—"
                      : `${record.results.filter((r) => r.decision === record.consensus).length} / 3`}
                  </strong>
                  {record.unanimous && record.consensus !== "UNRESOLVED" && <em>UNANIMOUS</em>}
                </>
              )}
            </div>

            <div className="core-slot melchior">
              <CorePanel id="MELCHIOR" phase={phase} result={record?.results.find((r) => r.core === "MELCHIOR")} revealed={revealed.includes("MELCHIOR")} tick={tick}/>
            </div>
          </div>

          {phase === "IDLE" && (
            <div className="query-console">
              <div className="input-label"><span>QUERY INPUT</span><small>自然言語で審議事項を入力</small></div>
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="例：この研究プロジェクトに20万円使うべきか？"
                maxLength={600}
              />
              <button className="deliberate-button" onClick={begin} disabled={!canBegin}>
                <span>審議開始</span>
                <small>BEGIN DELIBERATION</small>
              </button>
            </div>
          )}

          {phase === "ENCODING" && (
            <div className="process-banner">
              <b>INPUT ENCODING</b>
              <div className="loading-track"><i /></div>
              <span>LOCAL PERCEPTION → CANONICAL OBSERVATION → NEURAL ENCODER</span>
            </div>
          )}

          {phase === "DELIBERATING" && (
            <div className="process-banner danger">
              <b>POLLING MAGI</b>
              <div className="loading-track"><i /></div>
              <span>THREE INDEPENDENT NEURAL CORES DELIBERATING</span>
            </div>
          )}

          {phase === "RESULT" && record && (
            <div className="resolution-actions">
              {record.dissent && (
                <div className="dissent">
                  <span>DISSENT DETECTED</span>
                  <b>{record.dissent} // {JP[record.results.find((r) => r.core === record.dissent)!.decision]}</b>
                </div>
              )}
              <div className="action-buttons">
                <button onClick={() => setDetails((v) => !v)}>{details ? "詳細を閉じる" : "詳細を見る"}</button>
                <button onClick={() => setFeedbackOpen((v) => !v)}>結果を記録</button>
                <button className="primary" onClick={newQuery}>新しい審議</button>
              </div>
            </div>
          )}

          {feedbackOpen && record && record.consensus !== "UNRESOLVED" && (
            <div className="feedback-panel">
              <div>
                <b>OUTCOME REGISTER</b>
                <span>実際に採った行動と、その結果を学習信号として記録します。</span>
              </div>
              <div className="feedback-grid">
                <button onClick={() => submitFeedback("SUCCESS", true)}>決議どおり実行 / 成功</button>
                <button onClick={() => submitFeedback("FAILURE", true)}>決議どおり実行 / 失敗</button>
                <button onClick={() => submitFeedback("SUCCESS", false)}>決議と逆を実行 / 成功</button>
                <button onClick={() => submitFeedback("FAILURE", false)}>決議と逆を実行 / 失敗</button>
              </div>
            </div>
          )}

          {details && record && (
            <div className="details-grid">
              <ObservationPanel record={record}/>
              <NeuralGrid record={record}/>
            </div>
          )}

          <div className="history-head">
            <span>RECENT RESOLUTIONS</span>
            <button onClick={() => { clearHistory(); setHistory([]); }}>CLEAR LOG</button>
          </div>
          <HistoryStrip history={history}/>
        </div>

        <aside className="rail rail-right">
          <div className="event-title">EVENT STREAM</div>
          <div className="event-log">
            {eventLines.map((line, i) => <span key={i}>{line}</span>)}
          </div>
          <div className="system-block">
            <b>PERCEPTION</b><span>LOCAL</span>
            <b>JEV</b><span>STANDBY</span>
            <b>CONNECTOME</b><span>CELL-TYPE</span>
            <b>LEARNING</b><span>LOCAL STORAGE</span>
          </div>
          <button className="reset-button" onClick={() => { resetLearning(); clearHistory(); setHistory([]); }}>
            RESET LOCAL BRAIN
          </button>
        </aside>
      </section>

      <footer>
        <span>PROJECT MAGI // EXPERIMENTAL BIO-LOGICAL DECISION ARCHITECTURE</span>
        <span>NO EXTERNAL API // JEV ADAPTER RESERVED</span>
      </footer>
    </main>
  );
}
