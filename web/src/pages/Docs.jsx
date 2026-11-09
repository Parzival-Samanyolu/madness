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

## Thinking modes

There is one model, \`synapse-2\`. Choose how long it thinks with \`reasoning_effort\`:

| reasoning_effort | Best for |
|---|---|
| \`low\` | Quick answers, chat, simple tasks |
| \`medium\` (default) | Most questions and everyday coding |
| \`high\` | Hard problems: tricky bugs, math, planning |

## Endpoints

| Method | Path | What it does |
|---|---|---|
| GET | \`/v1/models\` | Lists the available model (\`synapse-2\`) |
| POST | \`/v1/chat/completions\` | Chat, with \`stream: true\` for live tokens |

Supported fields: \`messages\`, \`stream\`, \`max_tokens\`, \`temperature\`, \`top_p\`, \`stop\`, \`tools\`,
\`response_format\`, \`reasoning_effort\`. The model thinks before answering; streamed reasoning
arrives in \`delta.reasoning_content\`.

## Limits

Every account has per-minute, per-day and context limits based on its plan (see [pricing](/pricing)).
When you hit one, you get HTTP **429** with a message saying which limit. Prompts longer than your plan's
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
