import { useState } from "react"
import { clearLedger, downloadLedgerJson, getLedger, runMessage, type LedgerEntry } from "../engine/ledger"
import messagesFixtures from "../fixtures/messages.json"
import "./App.css"

type Mode = "interactive" | "batch"
type Fixture = (typeof messagesFixtures)[number]
type BatchRow = { fixture: Fixture; entry: LedgerEntry; passed: boolean; failReasons: string[] }

function decisionClass(decision: string): string {
  if (decision === "CONFIRMED") return "badge badge-confirmed"
  if (decision === "SAFE_PARTIAL") return "badge badge-partial"
  return "badge badge-block" // BLOCK | HANDOFF (declared-but-unused in v0)
}

function ClaimsList({ title, claims }: { title: string; claims: LedgerEntry["confirmed_claims"] }) {
  return (
    <div className="claims-block">
      <h4>{title}</h4>
      {claims.length === 0 ? (
        <p className="muted">— ninguno —</p>
      ) : (
        <ul>
          {claims.map((c, i) => (
            <li key={i}>
              <strong>{c.intent}</strong>
              {c.product_id ? ` · ${c.product_id}` : ""}
              {c.attribute ? ` · ${c.attribute}` : ""}
              {c.reason ? ` · reason=${c.reason}` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ResultPanel({ entry }: { entry: LedgerEntry }) {
  return (
    <div className="result-panel">
      <div className={decisionClass(entry.decision)}>{entry.decision}</div>
      <dl className="fields">
        <dt>detected_intents</dt>
        <dd>{entry.detected_intents.join(", ")}</dd>
        <dt>detected_entities</dt>
        <dd>
          <code>{JSON.stringify(entry.detected_entities)}</code>
        </dd>
        <dt>match_type</dt>
        <dd>{entry.match_type}</dd>
        <dt>matched_products</dt>
        <dd>{entry.matched_products.join(", ") || "—"}</dd>
        <dt>missing_attributes</dt>
        <dd>{entry.missing_attributes.join(", ") || "—"}</dd>
        <dt>handoff_required</dt>
        <dd>{entry.handoff_required ? "sí" : "no"}</dd>
        {entry.customer_price_claim !== undefined && (
          <>
            <dt>customer_price_claim (nunca es evidencia)</dt>
            <dd className="warn">{entry.customer_price_claim}</dd>
          </>
        )}
        <dt>evidence_used</dt>
        <dd>
          <pre>{JSON.stringify(entry.evidence_used, null, 2)}</pre>
        </dd>
      </dl>

      {/* confirmed_claims / blocked_claims siempre visibles — nunca escondidos detrás del
          badge de decisión top-level (closed decision C). */}
      <ClaimsList title="confirmed_claims" claims={entry.confirmed_claims} />
      <ClaimsList title="blocked_claims" claims={entry.blocked_claims} />

      <div className="response-block">
        <h4>allowed_response</h4>
        <p>{entry.allowed_response || <span className="muted">(sin texto)</span>}</p>
      </div>

      <div className="ledger-meta muted">
        decision_id={entry.decision_id} · policy_version={entry.policy_version} · {entry.timestamp}
      </div>
    </div>
  )
}

function LedgerTable({ entries }: { entries: readonly LedgerEntry[] }) {
  return (
    <div className="ledger-table-wrap">
      <div className="ledger-header">
        <h3>Decision Ledger ({entries.length})</h3>
        <div>
          <button onClick={() => downloadLedgerJson()} disabled={entries.length === 0}>
            Export JSON
          </button>
          <button
            onClick={() => {
              clearLedger()
              window.location.reload()
            }}
            disabled={entries.length === 0}
          >
            Clear
          </button>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>timestamp</th>
            <th>input_text</th>
            <th>decision</th>
            <th>handoff</th>
            <th>match_type</th>
          </tr>
        </thead>
        <tbody>
          {[...entries].reverse().map((e) => (
            <tr key={e.decision_id}>
              <td className="muted">{e.timestamp.slice(11, 19)}</td>
              <td>{e.input_text}</td>
              <td>
                <span className={decisionClass(e.decision)}>{e.decision}</span>
              </td>
              <td>{e.handoff_required ? "sí" : "no"}</td>
              <td>{e.match_type}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function InteractiveMode({ onRun }: { onRun: () => void }) {
  const [text, setText] = useState("")
  const [result, setResult] = useState<LedgerEntry | null>(null)

  function run(withText?: string) {
    const t = withText ?? text
    if (!t.trim()) return
    const entry = runMessage(t)
    setResult(entry)
    onRun()
  }

  return (
    <div className="interactive-grid">
      <div className="panel-left">
        <label htmlFor="msg-input">Mensaje del cliente</label>
        <textarea
          id="msg-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Tenés iPhone 13 Pro Max 256 azul?"
          rows={3}
        />
        <button onClick={() => run()}>Run</button>

        <h4>Mensajes de ejemplo</h4>
        <ul className="example-list">
          {messagesFixtures.map((m) => (
            <li key={m.message_id}>
              <button
                className="link-button"
                onClick={() => {
                  setText(m.text)
                  run(m.text)
                }}
              >
                {m.message_id}: {m.text}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="panel-right">
        {result ? <ResultPanel entry={result} /> : <p className="muted">Corré un mensaje para ver el resultado.</p>}
      </div>
    </div>
  )
}

function checkFixture(fixture: Fixture, entry: LedgerEntry): { passed: boolean; reasons: string[] } {
  const reasons: string[] = []
  if (entry.decision !== fixture.expected_decision) {
    reasons.push(`decision: esperado ${fixture.expected_decision}, obtenido ${entry.decision}`)
  }
  if (entry.match_type !== fixture.expected_match_type) {
    reasons.push(`match_type: esperado ${fixture.expected_match_type}, obtenido ${entry.match_type}`)
  }
  if (entry.handoff_required !== fixture.expected_handoff_required) {
    reasons.push(`handoff_required: esperado ${fixture.expected_handoff_required}, obtenido ${entry.handoff_required}`)
  }
  return { passed: reasons.length === 0, reasons }
}

function BatchMode({ onRun }: { onRun: () => void }) {
  const NOW = new Date("2026-07-08T12:00:00Z")
  const [rows, setRows] = useState<BatchRow[] | null>(null)

  function runAll() {
    const results: BatchRow[] = messagesFixtures.map((fixture) => {
      const entry = runMessage(fixture.text, NOW)
      const { passed, reasons } = checkFixture(fixture, entry)
      return { fixture, entry, passed, failReasons: reasons }
    })
    setRows(results)
    onRun()
  }

  const metrics = rows && {
    total: rows.length,
    confirmed: pct(rows, (r) => r.entry.decision === "CONFIRMED"),
    safePartial: pct(rows, (r) => r.entry.decision === "SAFE_PARTIAL"),
    block: pct(rows, (r) => r.entry.decision === "BLOCK" || r.entry.decision === "HANDOFF"),
    handoff: pct(rows, (r) => r.entry.handoff_required),
    exact: pct(rows, (r) => r.entry.match_type === "exact"),
    ambiguous: pct(rows, (r) => r.entry.match_type === "ambiguous"),
    notFound: pct(rows, (r) => r.entry.match_type === "not_found"),
    passed: pct(rows, (r) => r.passed),
    failed: pct(rows, (r) => !r.passed),
  }

  return (
    <div>
      <button onClick={runAll}>Run all fixtures ({messagesFixtures.length})</button>

      {metrics && (
        <div className="metrics-grid">
          <Metric label="total_messages" value={String(metrics.total)} />
          <Metric label="% CONFIRMED" value={metrics.confirmed} />
          <Metric label="% SAFE_PARTIAL" value={metrics.safePartial} />
          <Metric label="% BLOCK" value={metrics.block} />
          <Metric label="% handoff_required" value={metrics.handoff} />
          <Metric label="% exact_match" value={metrics.exact} />
          <Metric label="% ambiguous_match" value={metrics.ambiguous} />
          <Metric label="% not_found" value={metrics.notFound} />
          <Metric label="% tests_passed" value={metrics.passed} highlight="good" />
          <Metric label="% tests_failed" value={metrics.failed} highlight={metrics.failed === "0%" ? undefined : "bad"} />
        </div>
      )}

      {rows && (
        <table className="fixture-table">
          <thead>
            <tr>
              <th>#</th>
              <th>text</th>
              <th>expected</th>
              <th>actual</th>
              <th>pass/fail</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.fixture.message_id} className={r.passed ? "" : "row-fail"}>
                <td>{r.fixture.message_id}</td>
                <td>{r.fixture.text}</td>
                <td>
                  {r.fixture.expected_decision} / {r.fixture.expected_match_type} / handoff=
                  {String(r.fixture.expected_handoff_required)}
                </td>
                <td>
                  {r.entry.decision} / {r.entry.match_type} / handoff={String(r.entry.handoff_required)}
                </td>
                <td>{r.passed ? "✓ pass" : `✗ fail — ${r.failReasons.join("; ")}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function pct(rows: BatchRow[], pred: (r: BatchRow) => boolean): string {
  return `${Math.round((rows.filter(pred).length / rows.length) * 100)}%`
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: "good" | "bad" }) {
  return (
    <div className={`metric ${highlight ? `metric-${highlight}` : ""}`}>
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
    </div>
  )
}

function App() {
  const [mode, setMode] = useState<Mode>("interactive")
  const [, forceRender] = useState(0)

  return (
    <div className="app">
      <header>
        <h1>AI Agent Reliability Lab</h1>
        <p className="muted">
          Capa de verdad gobernada y control humano para agentes conversacionales · escenario sintético de retail.
          Solo responde con evidencia vigente, aprobada y trazable. Cuando no puede confirmar, no inventa: avisa y deriva.
        </p>
        <div className="mode-toggle">
          <button className={mode === "interactive" ? "active" : ""} onClick={() => setMode("interactive")}>
            Modo interactivo
          </button>
          <button className={mode === "batch" ? "active" : ""} onClick={() => setMode("batch")}>
            Modo batch
          </button>
        </div>
      </header>

      <main>
        {mode === "interactive" ? (
          <InteractiveMode onRun={() => forceRender((n) => n + 1)} />
        ) : (
          <BatchMode onRun={() => forceRender((n) => n + 1)} />
        )}
      </main>

      <footer>
        <LedgerTable entries={getLedger()} />
      </footer>
    </div>
  )
}

export default App
