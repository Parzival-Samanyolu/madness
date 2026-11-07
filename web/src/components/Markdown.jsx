import { memo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

function CodeBlock({ children, ...props }) {
  const ref = useRef(null)
  const [copied, setCopied] = useState(false)
  const lang = (children?.props?.className || '').match(/language-(\w+)/)?.[1]
  const copy = async () => {
    await navigator.clipboard.writeText(ref.current?.innerText || '')
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="my-3 overflow-hidden rounded-lg border border-line bg-[#0d1117]">
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5 text-xs text-ink-3">
        <span>{lang || 'code'}</span>
        <button onClick={copy} className="hover:text-ink">{copied ? 'Copied ✓' : 'Copy'}</button>
      </div>
      <pre ref={ref} className="overflow-x-auto" {...props}>{children}</pre>
    </div>
  )
}

function Markdown({ text }) {
  return (
    <div className="prose-chat">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, { ignoreMissing: true }]]}
        components={{ pre: CodeBlock, a: (p) => <a {...p} target="_blank" rel="noreferrer noopener" /> }}>
        {text}
      </ReactMarkdown>
    </div>
  )
}

export default memo(Markdown)
