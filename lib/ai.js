import { searchWeb } from './search.js';

function parseJsonLoose(text) {
  const raw = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(raw); } catch {}
  const starts = ['{','['].map(c => raw.indexOf(c)).filter(i => i >= 0);
  if (!starts.length) throw new Error('AI returned invalid JSON');
  const start = Math.min(...starts);
  const end = Math.max(raw.lastIndexOf('}'), raw.lastIndexOf(']'));
  if (end > start) return JSON.parse(raw.slice(start, end + 1));
  throw new Error('AI returned invalid JSON');
}

function dedupeSources(items) {
  const seen = new Set();
  return items.filter(item => item?.url && !seen.has(item.url) && seen.add(item.url));
}

async function groundedPrompt(prompt, web) {
  if (!web) return { prompt, citations: [] };
  if (!process.env.SEARCH_PROVIDER) throw new Error('SEARCH_PROVIDER is required for live-web grounding with this AI provider');
  const results = await searchWeb(prompt.slice(0, 700), 10);
  const citations = results.map(r => ({ url: r.url, title: r.title || r.url }));
  if (!results.length) return { prompt, citations };
  return {
    citations,
    prompt: `${prompt}\n\nLIVE WEB RESULTS (evidence only; never invent beyond these sources):\n${results.map((r,i)=>`[${i+1}] ${r.title}\n${r.url}\n${r.snippet}`).join('\n\n')}`
  };
}

function extractOpenAI(response) {
  const texts = [];
  const citations = [];
  const sources = [];
  for (const item of response.output || []) {
    if (item.type === 'message') {
      for (const content of item.content || []) {
        if (content.type === 'output_text' && content.text) texts.push(content.text);
        for (const ann of content.annotations || []) {
          if (ann.type === 'url_citation' && ann.url) citations.push({ url: ann.url, title: ann.title || ann.url });
        }
      }
    }
    if (item.type === 'web_search_call') {
      for (const src of item.action?.sources || []) if (src.url) sources.push({ url: src.url, title: src.title || src.url });
    }
  }
  return { text: response.output_text || texts.join('\n'), citations: dedupeSources([...citations, ...sources]) };
}

async function callOpenAI(prompt, { web = false, webMode = 'auto' } = {}) {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured');
  const body = { model: process.env.AI_MODEL || 'gpt-5.6', input: prompt };
  if (web) {
    body.tools = [{ type: 'web_search' }];
    body.tool_choice = webMode === 'required' ? 'required' : 'auto';
    body.include = ['web_search_call.action.sources'];
  }
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(Number(process.env.AI_TIMEOUT_MS || 90000))
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${detail.slice(0,400)}`);
  }
  return extractOpenAI(await response.json());
}

async function callCompatible(prompt, { web = false } = {}) {
  if (!process.env.AI_API_KEY) throw new Error('AI_API_KEY is not configured');
  if (!process.env.AI_MODEL) throw new Error('AI_MODEL is not configured');
  const base = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const grounded = await groundedPrompt(prompt, web);
  const response = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.AI_API_KEY}` },
    body: JSON.stringify({
      model: process.env.AI_MODEL,
      messages: [
        { role: 'system', content: 'You are RADAR, an evidence-first competitive intelligence analyst. Separate fact from inference and never invent facts.' },
        { role: 'user', content: grounded.prompt }
      ],
      temperature: 0.2
    }),
    signal: AbortSignal.timeout(Number(process.env.AI_TIMEOUT_MS || 90000))
  });
  if (!response.ok) throw new Error(`Compatible AI request failed (${response.status}): ${(await response.text()).slice(0,400)}`);
  const data = await response.json();
  return { text: data.choices?.[0]?.message?.content || '', citations: grounded.citations };
}

async function callAnthropic(prompt, { web = false } = {}) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not configured');
  if (!process.env.AI_MODEL) throw new Error('AI_MODEL is not configured');
  const grounded = await groundedPrompt(prompt, web);
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': process.env.ANTHROPIC_VERSION || '2023-06-01'
    },
    body: JSON.stringify({
      model: process.env.AI_MODEL,
      max_tokens: Number(process.env.AI_MAX_TOKENS || 5000),
      system: 'You are RADAR, an evidence-first competitive intelligence analyst. Separate fact from inference and never invent facts.',
      messages: [{ role: 'user', content: grounded.prompt }]
    }),
    signal: AbortSignal.timeout(Number(process.env.AI_TIMEOUT_MS || 90000))
  });
  if (!response.ok) throw new Error(`Anthropic request failed (${response.status}): ${(await response.text()).slice(0,400)}`);
  const data = await response.json();
  return { text: (data.content || []).filter(x => x.type === 'text').map(x => x.text).join('\n'), citations: grounded.citations };
}

async function callGemini(prompt, { web = false } = {}) {
  if (!process.env.GEMINI_API_KEY)
    throw new Error('GEMINI_API_KEY is not configured');

  if (!process.env.AI_MODEL)
    throw new Error('AI_MODEL is not configured');

  const model = encodeURIComponent(
    process.env.AI_MODEL.replace(/^models\//, '')
  );

  let grounded = {
    prompt,
    citations: []
  };

  let nativeGoogleSearch = false;

  if (web) {
    if (process.env.SEARCH_PROVIDER) {
      grounded = await groundedPrompt(prompt, true);
    } else {
      nativeGoogleSearch = true;
    }
  }

  const body = {
    systemInstruction: {
      parts: [{
        text: 'You are RADAR, an evidence-first competitive intelligence analyst. Separate fact from inference and never invent unsupported market facts.'
      }]
    },
    contents: [{
      role: 'user',
      parts: [{ text: grounded.prompt }]
    }],
    generationConfig: {
      temperature: 0.2
    }
  };

  if (nativeGoogleSearch) {
    body.tools = [{
      google_search: {}
    }];
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(
        Number(process.env.AI_TIMEOUT_MS || 90000)
      )
    }
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Gemini request failed (${response.status}): ${detail.slice(0,600)}`
    );
  }

  const data = await response.json();

  const candidate = data.candidates?.[0];

  const text = (candidate?.content?.parts || [])
    .map(part => part.text || '')
    .join('\\n');

  const nativeSources =
    candidate?.groundingMetadata?.groundingChunks || [];

  const nativeCitations = nativeSources
    .map(chunk => ({
      url: chunk?.web?.uri,
      title: chunk?.web?.title || chunk?.web?.uri
    }))
    .filter(item => item.url);

  return {
    text,
    citations: dedupeSources([
      ...grounded.citations,
      ...nativeCitations
    ])
  };
}

export async function aiText(prompt, options = {}) {
  const provider = (process.env.AI_PROVIDER || 'openai').toLowerCase();
  if (provider === 'openai') return callOpenAI(prompt, options);
  if (provider === 'compatible') return callCompatible(prompt, options);
  if (provider === 'anthropic') return callAnthropic(prompt, options);
  if (provider === 'gemini') return callGemini(prompt, options);
  throw new Error(`Unsupported AI_PROVIDER: ${provider}`);
}

export async function aiJson(prompt, options = {}) {
  const result = await aiText(`${prompt}\n\nReturn ONLY valid JSON. Do not wrap it in markdown.`, options);
  try {
    return { data: parseJsonLoose(result.text), citations: result.citations };
  } catch {
    const repaired = await aiText(`Repair the following malformed model output into valid JSON matching the original requested structure. Preserve only information already present. Return JSON only.\n\nORIGINAL REQUEST:\n${prompt}\n\nMALFORMED OUTPUT:\n${String(result.text).slice(0,30000)}`, { web: false });
    return { data: parseJsonLoose(repaired.text), citations: result.citations };
  }
}

export function aiConfigured() {
  const provider = (process.env.AI_PROVIDER || 'openai').toLowerCase();
  if (provider === 'openai') return Boolean(process.env.OPENAI_API_KEY);
  if (provider === 'anthropic') return Boolean(process.env.ANTHROPIC_API_KEY && process.env.AI_MODEL);
  if (provider === 'gemini') return Boolean(process.env.GEMINI_API_KEY && process.env.AI_MODEL);
  if (provider === 'compatible') return Boolean(process.env.AI_API_KEY && process.env.AI_MODEL);
  return false;
}
