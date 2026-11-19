const MODELS = { quick: 'claude-haiku-5-5', full: 'claude-sonnet-5-5' };

function parseJson(text) {
  try { return JSON.parse(text); } catch (e) {}
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fence) { try { return JSON.parse(fence[1]); } catch (e) {} }
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch (e) {} }
  return null;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ code: 'method_not_allowed' });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ code: 'server_not_configured' });
  const need = process.env.ACCESS_CODE;
  if (need && req.headers['x-access-code'] !== need) return res.status(401).json({ code: 'need_code' });

  const { prompt, image, quick } = req.body || {};
  if (typeof prompt !== 'string' || typeof image !== 'string' || prompt.length > 20000 || image.length > 6000000)
    return res.status(400).json({ code: 'invalid_request' });

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: quick ? MODELS.quick : MODELS.full,
        max_tokens: 16000,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
          { type: 'text', text: prompt }
        ] }]
      })
    });
    if (r.status === 429) return res.status(429).json({ code: 'rate_limited' });
    if (!r.ok) return res.status(502).json({ code: 'upstream_error' });
    const j = await r.json();
    const text = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
    const data = parseJson(text);
    if (!data) return res.status(502).json({ code: 'invalid_json' });
    return res.status(200).json({ data });
  } catch (e) {
    return res.status(502).json({ code: 'upstream_error' });
  }
};
