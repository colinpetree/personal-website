// Ghost-style two-line URL field: an editable bare-slug input on top, gray
// hint text below showing the resolved absolute URL. Replaces InputWithPrefix
// for the blog post editor's and Pages editor's slug fields — see
// AdminBlogEditorPage.jsx and AdminPageEditorPage.jsx.
export default function SlugUrlField({ value, onChange, onBlur, domain, className }) {
  return (
    <div className="flex flex-col gap-1">
      <input
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        className={`rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-400 w-full ${className || ''}`}
      />
      <p className="text-xs text-gray-400 truncate">
        {domain || 'localhost'}/{value}
      </p>
    </div>
  )
}
