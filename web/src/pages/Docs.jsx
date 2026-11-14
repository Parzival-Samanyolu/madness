import { Link } from 'react-router-dom'
import Markdown from '../components/Markdown'

export default function Docs() {
  const base = `${window.location.origin}/v1`
  const md = `
## Quick start

The API speaks the **OpenAI Chat Completions** format, so any OpenAI SDK or tool works:
set the base URL to \`${base}\` and use your API key.

1. [Create an API key](/keys) (it starts with \`syn_sk_\`).
2. Send a request:

\`\`\`bash
curl ${base}/chat/completions \\
  -H "Authorization: Bearer $SYNAPSE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "synapse-2", "messages": [{"role": "user", "content": "Write a haiku about GPUs"}]}'
\`\`\`

### Python

\`\`\`python
# pip install openai
from openai import OpenAI

client = OpenAI(base_url="${base}", api_key="syn_sk_...")

stream = client.chat.completions.create(
    model="synapse-2",
    messages=[{"role": "user", "content": "Explain recursion with a Python example"}],
    stream=True,
    extra_body={"reasoning_effort": "medium"},  # low | medium | high
)
for chunk in stream:
    if chunk.choices and chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)
\`\`\`

### JavaScript

\`\`\`javascript
// npm install openai
import OpenAI from "openai";
const client = new OpenAI({ baseURL: "${base}", apiKey: process.env.SYNAPSE_API_KEY });
const res = await client.chat.completions.create({
  model: "synapse-2",
  messages: [{ role: "user", content: "Hello!" }],
});
console.log(res.choices[0].message.content);
\`\`\`

## Use Synapse in Xarı Bülbül

[Xarı Bülbül](/#xari-bulbul) is our desktop coding agent, and Synapse is built in:

1. [Download Xarı Bülbül](https://github.com/Parzival-Samanyolu/xari-bulbul/releases/latest) for macOS, Windows or Linux.
2. Open **Settings → Providers → Samanyolu AI Synapse** and paste your \`syn_sk_\` key.
3. Pick \`synapse-2\` in the model picker. Xarı Bülbül shows your plan and today's token use, and follows your plan's limits.

## Thinking modes

There is one model, \`synapse-2\`. Choose how long it thinks with \`reasoning_effort\`:

| reasoning_effort | Best for |
|---|---|
| \`low\` | Answers right away, without thinking: quick answers, chat, simple tasks |
| \`medium\` (default) | Thinks briefly first (up to about 4,000 tokens): most questions and everyday coding |
| \`high\` | Thinks as long as it needs: hard problems, tricky bugs, math, planning |

## Endpoints

| Method | Path | What it does |
|---|---|---|
| GET | \`/v1/models\` | Lists the model (\`synapse-2\`) with your plan's \`context_length\` and \`max_output_tokens\` |
| GET | \`/v1/key\` | Your key's plan, limits and tokens used today (\`usage.tokens_today\`, \`usage.resets_at\`) |
| POST | \`/v1/chat/completions\` | Chat, with \`stream: true\` for live tokens |

Supported fields: \`messages\`, \`stream\`, \`max_tokens\`, \`temperature\`, \`top_p\`, \`stop\`, \`tools\`,
\`response_format\`, \`reasoning_effort\`. In \`medium\` and \`high\` the model thinks before answering; streamed reasoning
arrives in \`delta.reasoning_content\`.

## Limits

Every account has a per-minute limit, a context limit and a **weekly usage allowance** based on its plan (see [pricing](/pricing)):
Neuron (free) gets $10 of use a week, Myelin $50. Use is measured at **$1 per million tokens**, input and output alike, and
cached input (text the model has already read, like the earlier part of a chat) counts at **$0.10 per million**. You are never
billed per token. The allowance resets Monday 00:00 UTC. \`GET /v1/key\` shows what you've used (\`usage.usd_this_week\`).
When you hit one, you get HTTP **429** with a message saying which limit and a \`Retry-After\` header (seconds). Prompts longer than your plan's
context get HTTP **400**.

## Errors

Errors use the OpenAI format: \`{"error": {"message": "...", "type": "..."}}\`.
\`401\` means a bad or revoked key, \`429\` means slow down, and \`503\` means the model server is restarting, so retry shortly.
`
  return (
    <div className="mx-auto max-w-3xl px-5 py-14">
      <h1 className="font-serif text-5xl tracking-[-0.01em]">API documentation</h1>
      <p className="mt-3 text-lg text-ink-2">Build on synapse-2 in a few minutes. <Link to="/keys" className="text-accent underline">Get a key →</Link></p>
      <div className="mt-6"><Markdown text={md} /></div>
    </div>
  )
}
