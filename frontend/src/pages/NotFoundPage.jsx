import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-white px-6">
      <h1 className="text-6xl font-bold text-gray-900 mb-4">404</h1>
      <p className="text-xl text-gray-500 mb-8">Page not found.</p>
      <Link to="/" className="text-blue-600 hover:underline">
        Go home
      </Link>
    </main>
  )
}
