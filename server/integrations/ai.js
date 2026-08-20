// ============================================================
// AI adapter (PRD §11.1) — provider-agnostic.
//   ANTHROPIC_API_KEY -> Claude (Messages API)
//   OPENAI_API_KEY    -> GPT (Chat Completions) + Whisper
//   neither           -> deterministic rule engine (still works)
// Every proposal, whatever the provider, goes through
// schedulerEngine.validateProposal before Paul sees it.
// ============================================================
const { db } = require('../db');
const { ruleSchedule } = require('../services/schedulerEngine');

function provider() {
  const pref = (process.env.AI_PROVIDER || 'auto').toLowerCase();
  if (pref === 'anthropic' && process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (pref === 'openai' && process.env.OPENAI_API_KEY) return 'openai';
  if (pref === 'auto') {
    if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
    if (process.env.OPENAI_API_KEY) return 'openai';
  }
  return 'builtin';
}

function logEvent(event, payload, status = 'ok') {
  db.prepare('INSERT INTO integration_events (provider, direction, event, payload, status) VALUES (?,?,?,?,?)')
    .run('ai', 'out', event, JSON.stringify(payload).slice(0, 4000), status);
}

const SYSTEM_PROMPT = `You are the scheduling assistant for Paul Douglas Roofing and Building Ltd, a UK roofing firm.
You are given structured, factual data about tomorrow's situation: unscheduled jobs (with priority, required skills, materials, address), the field staff (with skills and whether they drive), who is on approved holiday, and what is already scheduled. You are also given the owner's spoken instruction, which may add constraints (someone is off sick, a job must come first, team preferences).

Rules you must never break:
- Never assign someone who is on holiday or already scheduled that day.
- Never assign the same person to two jobs.
- Each team should include at least one driver whenever drivers are available.
- Cover each job's required skills with at least one team member holding that skill where possible.
- Respect the owner's spoken instructions over everything except the rules above.
- Only use job ids and staff ids that appear in the provided data.

Respond with ONLY a JSON object, no prose, in exactly this shape:
{"assignments":[{"job_id":1,"user_ids":[2,3],"start_time":"08:00","end_time":"16:30","note":"why this team"}],"unassigned":[{"job_id":4,"reason":"why"}],"summary":"2-3 sentence plain-English explanation of the plan"}`;

function buildUserContent(context, transcript) {
  return `DATE TO SCHEDULE: ${context.forDate}

UNSCHEDULED JOBS:
${JSON.stringify(context.unscheduledJobs, null, 1)}

STAFF (available=true means free that day):
${JSON.stringify(context.staff.map(({ color, ...s }) => s), null, 1)}

ALREADY SCHEDULED THAT DAY (do not move, do not reuse their staff):
${JSON.stringify(context.scheduledThatDay, null, 1)}

OWNER'S SPOKEN INSTRUCTION:
"${transcript || '(none — just build the best schedule)'}"`;
}

function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON found in model response');
  return JSON.parse(text.slice(start, end + 1));
}

async function askAnthropic(context, transcript) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserContent(context, transcript) }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${JSON.stringify(data.error || data)}`);
  return extractJson(data.content.map((c) => c.text || '').join(''));
}

async function askOpenAI(context, transcript) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserContent(context, transcript) },
      ],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${JSON.stringify(data.error || data)}`);
  return extractJson(data.choices[0].message.content);
}

/**
 * Produce a schedule proposal. Falls back to the rule engine on any
 * LLM failure so the feature can never dead-end for Paul.
 * Returns { provider, proposal } (proposal NOT yet validated).
 */
async function proposeSchedule(context, transcript) {
  const p = provider();
  if (p === 'anthropic' || p === 'openai') {
    try {
      const proposal = p === 'anthropic' ? await askAnthropic(context, transcript) : await askOpenAI(context, transcript);
      logEvent('schedule.proposed', { provider: p, jobs: (proposal.assignments || []).length });
      return { provider: p, proposal };
    } catch (err) {
      logEvent('schedule.llm_error', { provider: p, error: String(err.message) }, 'error');
      const proposal = ruleSchedule(context, transcript);
      proposal.summary = `(AI call failed — built-in scheduler used instead. ${proposal.summary})`;
      return { provider: 'builtin-fallback', proposal };
    }
  }
  const proposal = ruleSchedule(context, transcript);
  logEvent('schedule.proposed', { provider: 'builtin', jobs: proposal.assignments.length });
  return { provider: 'builtin', proposal };
}

/** Server-side transcription via OpenAI Whisper (optional — browser speech is the default input). */
async function transcribe(audioBuffer, mime = 'audio/webm') {
  if (!process.env.OPENAI_API_KEY) {
    return { available: false, hint: 'No OPENAI_API_KEY — use the in-browser microphone (built-in speech recognition) or type the instruction.' };
  }
  const form = new FormData();
  form.append('file', new Blob([audioBuffer], { type: mime }), 'note.webm');
  form.append('model', 'whisper-1');
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Whisper ${res.status}: ${JSON.stringify(data.error || data)}`);
  return { available: true, text: data.text };
}

function status() {
  const p = provider();
  return {
    id: 'ai',
    name: 'AI — scheduling assistant',
    configured: p !== 'builtin',
    connected: p !== 'builtin',
    mode: p === 'builtin' ? 'built-in rules' : `live (${p})`,
    env_needed: ['ANTHROPIC_API_KEY (or OPENAI_API_KEY)', 'AI_PROVIDER'],
    detail:
      p === 'builtin'
        ? 'Using the built-in rule scheduler (drivers/skills/holidays respected). Add ANTHROPIC_API_KEY or OPENAI_API_KEY for full natural-language scheduling.'
        : `Live — proposals generated by ${p === 'anthropic' ? `Claude (${process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5'})` : `OpenAI (${process.env.OPENAI_MODEL || 'gpt-4o'})`}, validated server-side before display.`,
  };
}

module.exports = { provider, proposeSchedule, transcribe, status };
