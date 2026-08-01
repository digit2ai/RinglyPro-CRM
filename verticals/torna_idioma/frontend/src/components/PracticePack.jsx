import React, { useState } from 'react';

/**
 * The practice layer inside a lesson.
 *
 * The reading passage above this component is the input; this is where the learner
 * produces. Four tabs, in the order the daily loop runs:
 *
 *   Speak  — the roleplay (and the debate, once the level supports one)
 *   Say    — pronunciation drills, each tagged with the sound it exercises
 *   Words  — target vocabulary, with the Filipino cognate where one exists
 *   Work   — the BPO/occupational track, from Module 7 onward
 *
 * Every Spanish string is tappable and speaks aloud through the browser's own speech
 * synthesis (es-MX preferred). That is deliberate: it costs nothing, needs no key, and
 * works offline, so a learner on Philippine mobile data hears a model before they
 * speak. Where the browser has no Spanish voice we hide the speaker rather than
 * playing an English voice reading Spanish, which teaches the wrong thing.
 */

let cachedVoice;
function spanishVoice() {
  if (cachedVoice !== undefined) return cachedVoice;
  if (typeof window === 'undefined' || !window.speechSynthesis) { cachedVoice = null; return cachedVoice; }
  const voices = window.speechSynthesis.getVoices() || [];
  cachedVoice =
    voices.find(v => /^es-MX/i.test(v.lang)) ||
    voices.find(v => /^es-(419|US|CO|AR|CL|PE)/i.test(v.lang)) ||
    voices.find(v => /^es/i.test(v.lang)) ||
    null;
  return cachedVoice;
}

function speak(text) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  const voice = spanishVoice();
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  if (voice) u.voice = voice;
  u.lang = (voice && voice.lang) || 'es-MX';
  u.rate = 0.9; // a shade under natural — this is a model to copy, not a conversation
  window.speechSynthesis.speak(u);
}

// Voices load asynchronously in most browsers; clear the cache when they arrive.
if (typeof window !== 'undefined' && window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => { cachedVoice = undefined; };
}

function Say({ children, text }) {
  const canSpeak = typeof window !== 'undefined' && !!window.speechSynthesis;
  if (!canSpeak) return <span>{children}</span>;
  return (
    <button type="button" onClick={() => speak(text || children)} style={st.sayBtn} title="Listen">
      {children}<span style={st.speaker} aria-hidden="true">►</span>
    </button>
  );
}

export default function PracticePack({ pack }) {
  const [tab, setTab] = useState('speak');
  if (!pack) return null;

  const hasWork = !!pack.occupational;
  const tabs = [
    { id: 'speak', label: 'Speak' },
    { id: 'say', label: `Say it (${(pack.sentence_mode || []).length})` },
    { id: 'words', label: `Words (${(pack.word_mode || []).length})` },
    ...(hasWork ? [{ id: 'work', label: 'At work' }] : []),
  ];

  return (
    <div style={st.wrap}>
      <div style={st.head}>
        <h2 style={st.title}>Practice</h2>
        {pack.module_theme && <span style={st.theme}>{pack.module_theme}</span>}
      </div>

      <div style={st.tabs}>
        {tabs.map(t => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            style={{ ...st.tab, ...(tab === t.id ? st.tabOn : {}) }}>{t.label}</button>
        ))}
      </div>

      {tab === 'speak' && (
        <div style={st.body}>
          {pack.roleplay && (
            <div style={st.card}>
              <div style={st.cardH}>Roleplay · {pack.roleplay.title}</div>
              <p style={st.sit}>{pack.roleplay.situation}</p>
              <div style={st.opensRow}>
                <span style={st.who}>Your tutor opens</span>
                <Say text={pack.roleplay.opens}><span style={st.es}>{pack.roleplay.opens}</span></Say>
              </div>
              <div style={st.mustRow}>
                <span style={st.who}>You must use</span>
                <span>{(pack.roleplay.must_use || []).map((m, i) => (
                  <Say key={i} text={m}><code style={st.chip}>{m}</code></Say>
                ))}</span>
              </div>
            </div>
          )}

          {pack.authored && pack.authored.dialogue && (
            <div style={st.card}>
              <div style={st.cardH}>Listen first · {pack.authored.dialogue.setting}</div>
              {(pack.authored.dialogue.lines || []).map((l, i) => (
                <div key={i} style={st.dlg}>
                  <span style={st.spk}>{l.speaker}</span>
                  <div>
                    <Say text={l.es}><span style={st.es}>{l.es}</span></Say>
                    <div style={st.gloss}>{l.en}</div>
                  </div>
                </div>
              ))}
              {pack.authored.comprehension_question && (
                <div style={st.mustRow}>
                  <span style={st.who}>Answer aloud</span>
                  <Say text={pack.authored.comprehension_question}>
                    <span style={st.es}>{pack.authored.comprehension_question}</span>
                  </Say>
                </div>
              )}
            </div>
          )}

          {pack.debate && (
            <div style={st.card}>
              <div style={st.cardH}>Debate</div>
              <Say text={pack.debate.prompt}><p style={{ ...st.es, margin: 0 }}>{pack.debate.prompt}</p></Say>
              <p style={st.pos}><span style={st.who}>A</span>{pack.debate.position_a}</p>
              <p style={st.pos}><span style={st.who}>B</span>{pack.debate.position_b}</p>
            </div>
          )}

          {pack.grammar && (
            <div style={st.card}>
              <div style={st.cardH}>Grammar focus · {pack.grammar.point}</div>
              <p style={st.sit}>{pack.grammar.why}</p>
              {(pack.grammar.examples || []).map((e, i) => (
                <div key={i}><Say text={e}><span style={st.es}>{e}</span></Say></div>
              ))}
            </div>
          )}

          {!!(pack.can_do || []).length && (
            <div style={st.card}>
              <div style={st.cardH}>By the end of this module I can</div>
              <ul style={st.list}>{pack.can_do.map((c, i) => <li key={i} style={st.li}>{c}</li>)}</ul>
            </div>
          )}
        </div>
      )}

      {tab === 'say' && (
        <div style={st.body}>
          {(pack.sentence_mode || []).map((d, i) => (
            <div key={i} style={st.card}>
              <div style={st.drillTop}>
                <Say text={d.say}><span style={st.esBig}>{d.say}</span></Say>
                <span style={st.tag}>{d.targets}</span>
              </div>
              <div style={st.gloss}>{d.means}</div>
              <p style={st.why}>{d.why}</p>
            </div>
          ))}

          {!!(pack.pronunciation_focus || []).length && (
            <div style={st.card}>
              <div style={st.cardH}>Sounds this lesson exercises</div>
              {pack.pronunciation_focus.map((f, i) => (
                <div key={i} style={st.phon}>
                  <div style={st.phonTop}>
                    <span style={st.phonSound}>{f.sound}</span>
                    <span style={{ ...st.tag, ...(f.kind === 'contrast' ? st.tagWarn : st.tagOk) }}>
                      {f.kind === 'contrast' ? 'needs work' : 'free win from Tagalog'}
                    </span>
                  </div>
                  <p style={st.why}>{f.tip_en}</p>
                  <div>{(f.examples || []).map((e, j) => (
                    <Say key={j} text={e}><code style={st.chip}>{e}</code></Say>
                  ))}</div>
                </div>
              ))}
            </div>
          )}

          {pack.authored && !!(pack.authored.likely_errors || []).length && (
            <div style={st.card}>
              <div style={st.cardH}>What Filipino learners get wrong here</div>
              {pack.authored.likely_errors.map((e, i) => (
                <div key={i} style={st.phon}>
                  <div><span style={st.err}>{e.error}</span> <span style={st.fix}>{e.correction}</span></div>
                  <p style={st.why}>{e.why}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'words' && (
        <div style={st.body}>
          <div style={st.words}>
            {(pack.word_mode || []).map((w, i) => (
              <div key={i} style={st.word}>
                <Say text={w.term}><span style={st.es}>{w.term}</span></Say>
                <div style={st.gloss}>{w.gloss}</div>
                {w.cognate && (
                  <div style={st.cog}>
                    Tagalog: <strong>{w.cognate.tagalog}</strong>
                    {w.cognate.note ? <span style={st.cogNote}> · {w.cognate.note}</span> : null}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'work' && hasWork && (
        <div style={st.body}>
          <div style={st.card}>
            <div style={st.cardH}>{pack.occupational.track}</div>
            <p style={st.sit}>{pack.occupational.register}</p>
            {pack.occupational.scenario && (
              <>
                <div style={st.opensRow}>
                  <span style={st.who}>{pack.occupational.scenario.title}</span>
                  <span style={st.sit}>{pack.occupational.scenario.situation}</span>
                </div>
                <div style={st.opensRow}>
                  <span style={st.who}>Caller opens</span>
                  <Say text={pack.occupational.scenario.opens}>
                    <span style={st.es}>{pack.occupational.scenario.opens}</span>
                  </Say>
                </div>
                <div style={st.mustRow}>
                  <span style={st.who}>You must use</span>
                  <span>{(pack.occupational.scenario.must_use || []).map((m, i) => (
                    <Say key={i} text={m}><code style={st.chip}>{m}</code></Say>
                  ))}</span>
                </div>
              </>
            )}
            {pack.occupational.compliance && <p style={st.compliance}>{pack.occupational.compliance}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

const st = {
  wrap: { marginTop: 28, borderTop: '2px solid #C41E3A', paddingTop: 18 },
  head: { display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 12 },
  title: { fontSize: 18, fontWeight: 700, margin: 0, color: '#1a1a2e' },
  theme: { fontSize: 12, color: '#6B7280', letterSpacing: '.06em', textTransform: 'uppercase' },
  tabs: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 },
  tab: { font: 'inherit', fontSize: 13, padding: '7px 14px', borderRadius: 99, border: '1px solid #E5E7EB', background: '#fff', color: '#4B5563', cursor: 'pointer' },
  tabOn: { background: '#C41E3A', borderColor: '#C41E3A', color: '#fff', fontWeight: 600 },
  body: { display: 'grid', gap: 12 },
  card: { background: '#F9FAFB', border: '1px solid #F0F1F3', borderRadius: 10, padding: '14px 16px' },
  cardH: { fontSize: 13.5, fontWeight: 700, color: '#1a1a2e', marginBottom: 8 },
  sit: { fontSize: 14, color: '#4B5563', margin: '0 0 8px', lineHeight: 1.55 },
  opensRow: { display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 6 },
  mustRow: { display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap', marginTop: 6 },
  who: { fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: '#9CA3AF', whiteSpace: 'nowrap' },
  sayBtn: { font: 'inherit', background: 'none', border: 0, padding: 0, margin: 0, cursor: 'pointer', textAlign: 'left', color: 'inherit' },
  speaker: { fontSize: 9, color: '#C41E3A', marginLeft: 5, verticalAlign: 'middle' },
  es: { fontSize: 15.5, color: '#1a1a2e' },
  esBig: { fontSize: 19, color: '#1a1a2e' },
  gloss: { fontSize: 12.5, color: '#6B7280', marginTop: 2 },
  chip: { fontSize: 12, background: '#fff', border: '1px solid #E5E7EB', borderRadius: 5, padding: '2px 7px', marginRight: 6, display: 'inline-block', marginBottom: 4, color: '#1a1a2e' },
  pos: { fontSize: 13.5, color: '#4B5563', margin: '8px 0 0', display: 'flex', gap: 9 },
  list: { margin: 0, paddingLeft: 18 },
  li: { fontSize: 13.5, color: '#4B5563', marginBottom: 3 },
  dlg: { display: 'grid', gridTemplateColumns: '72px 1fr', gap: 10, marginBottom: 9, alignItems: 'baseline' },
  spk: { fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9CA3AF' },
  drillTop: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  tag: { fontSize: 9.5, letterSpacing: '.08em', textTransform: 'uppercase', background: '#FDECEF', color: '#C41E3A', padding: '3px 8px', borderRadius: 99 },
  tagWarn: { background: '#FEF0E7', color: '#9A5B2E' },
  tagOk: { background: '#E6F4F0', color: '#1D6B5E' },
  why: { fontSize: 12.5, color: '#4B5563', margin: '6px 0 0', lineHeight: 1.55 },
  phon: { borderTop: '1px solid #F0F1F3', paddingTop: 10, marginTop: 10 },
  phonTop: { display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap' },
  phonSound: { fontSize: 13, fontWeight: 700, color: '#1a1a2e' },
  err: { fontSize: 15, color: '#C41E3A', textDecoration: 'line-through' },
  fix: { fontSize: 15, color: '#1D6B5E' },
  words: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 8 },
  word: { background: '#fff', border: '1px solid #F0F1F3', borderRadius: 8, padding: '10px 12px' },
  cog: { fontSize: 11.5, color: '#1D6B5E', marginTop: 4 },
  cogNote: { color: '#6B7280' },
  compliance: { fontSize: 12.5, color: '#9A5B2E', borderLeft: '2px solid #9A5B2E', paddingLeft: 10, margin: '10px 0 0' },
};
