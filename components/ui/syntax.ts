// Single import point for syntax highlighting. Every page imports the
// highlighter and its theme from HERE, never from react-syntax-highlighter
// directly — swapping the engine (e.g. to server-side shiki) is then one edit.
// For new UI surfaces prefer <CodeBlock> (components/ui/code-block.tsx), which
// adds the header bar and copy button on top of this.
export { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
export { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
