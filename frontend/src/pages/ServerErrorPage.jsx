import { Link } from 'react-router'

// Presentational only — deliberately NOT a routed page (unlike the otherwise-
// similar NotFoundPage.jsx). No fixed URL maps to "a server error happened";
// this only ever renders as a conditional branch inside SlugResolverPage.jsx
// when fetchResolvedData() catches a genuine failure, the same way
// BlogPostView/PageView are presentational components rendered by that same
// file rather than routes of their own. Do not add this to routes.ts.
export default function ServerErrorPage() {
  return (
    <main className="h-[calc(100dvh-4rem-1px)] flex flex-col items-center justify-center bg-white px-6">
      <h1 className="text-6xl font-bold text-gray-900 mb-4">Error</h1>
      <p className="text-xl text-gray-500 mb-8">Something went wrong. Please try again.</p>
      <div className="flex items-center gap-4">
        <button
          onClick={() => window.location.reload()}
          className="text-blue-600 hover:underline"
        >
          Try again
        </button>
        {/* Escape hatch for the case where retrying doesn't help (a real
            outage, not just one bad request) — mirrors NotFoundPage's own
            "Back to home" link, which exists for the same reason: give the
            visitor somewhere to go besides being stuck. */}
        <Link to="/" className="text-blue-600 hover:underline">
          Back to home
        </Link>
      </div>
    </main>
  )
}
