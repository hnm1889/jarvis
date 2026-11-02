require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5-5';
const ACCESS_CODE = process.env.ACCESS_CODE || '';
const PORT = process.env.PORT || 3000;

function systemPrompt() {
  const ahora = new Date().toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    dateStyle: 'full',
    timeStyle: 'short',
  });
  return [
    'Sos Jarvis, el asistente personal por voz de Hector, vendedor de pinturas en Rosario, Argentina.',
    'Hablás en español rioplatense, con tono cercano y directo.',
    'Tus respuestas se leen en voz alta: usá frases cortas, sin listas, sin markdown, sin emojis. Máximo 3 oraciones salvo que te pidan más detalle.',
    'Todavía no tenés acceso a su agenda ni a recordatorios. Si te los piden, decile con claridad que esa función viene en la próxima etapa y ofrecé lo que sí podés hacer ahora.',
    `Fecha y hora actual en Rosario: ${ahora}.`,
  ].join(' ');
}

app.post('/api/chat', async (req, res) => {
  if (ACCESS_CODE && req.get('x-access-code') !== ACCESS_CODE) {
    return res.status(401).json({ error: 'Código de acceso incorrecto' });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'Falta ANTHROPIC_API_KEY en el archivo .env' });
  }

  const messages = (Array.isArray(req.body.messages) ? req.body.messages : [])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));

  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    return res.status(400).json({ error: 'Falta el mensaje' });
  }

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 500, system: systemPrompt(), messages }),
    });
    const data = await r.json();
    if (!r.ok) {
      return res.status(502).json({ error: (data.error && data.error.message) || 'Error al consultar a Claude' });
    }
    const reply = data.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    res.json({ reply });
  } catch (e) {
    res.status(500).json({ error: 'No pude conectarme con Claude' });
  }
});

app.listen(PORT, () => console.log(`Jarvis andando en http://localhost:${PORT}`));
