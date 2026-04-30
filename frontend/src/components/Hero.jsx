import { useEffect, useState } from 'react'

export default function Hero() {
  const [profile, setProfile] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/api/profile')
      .then(res => {
        if (!res.ok) throw new Error('Failed to load profile')
        return res.json()
      })
      .then(setProfile)
      .catch(err => setError(err.message))
  }, [])

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-red-500">{error}</p>
    </div>
  )

  if (!profile) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-8 h-8 border-4 border-gray-300 border-t-gray-800 rounded-full animate-spin" />
    </div>
  )

  return (
    <section className="min-h-screen flex flex-col items-center justify-center bg-white px-6">
      <div className="max-w-2xl text-center">
        <h1 className="text-5xl font-bold text-gray-900 tracking-tight mb-4">
          {profile.name}
        </h1>
        <p className="text-xl text-gray-500 font-medium mb-6">
          {profile.title}
        </p>
        <p className="text-lg text-gray-600 leading-relaxed">
          {profile.bio}
        </p>
      </div>
    </section>
  )
}
