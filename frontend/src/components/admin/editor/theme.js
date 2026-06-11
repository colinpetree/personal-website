const theme = {
  heading: {
    h1: 'max-w-3xl mx-auto px-6 text-3xl font-bold mt-6 mb-3',
    h2: 'max-w-3xl mx-auto px-6 text-2xl font-bold mt-5 mb-2',
    h3: 'max-w-3xl mx-auto px-6 text-xl font-semibold mt-4 mb-2',
  },
  paragraph: 'editor-paragraph max-w-3xl mx-auto px-6 mb-3 leading-relaxed',
  // Border is drawn via background-gradient in .editor-quote so it aligns with px-6 text position
  quote: 'editor-quote max-w-3xl mx-auto border-l-0 pr-6 italic text-gray-600 my-3',
  text: {
    bold: 'font-bold',
    italic: 'italic',
    underline: 'underline',
    strikethrough: 'line-through',
    code: 'bg-gray-100 rounded px-1 font-mono text-sm',
  },
  list: {
    // pr-6 aligns right with paragraphs; pl-12 = px-6 (24px) + pl-6 (24px bullet indent)
    ul: 'max-w-3xl mx-auto pr-6 pl-12 list-disc mb-3',
    ol: 'max-w-3xl mx-auto pr-6 pl-12 list-decimal mb-3',
    listitem: 'mb-1',
    nested: {
      listitem: '',
    },
  },
  link: 'text-blue-600 underline',
}

export default theme
