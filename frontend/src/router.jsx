import { createBrowserRouter } from 'react-router-dom'
import App from './App'
import HomePage from './pages/HomePage'
import BlogPage from './pages/BlogPage'
import BlogPostPage from './pages/BlogPostPage'
import ProjectsPage from './pages/ProjectsPage'
import AboutPage from './pages/AboutPage'
import ContactPage from './pages/ContactPage'
import AIDemoPage from './pages/AIDemoPage'
import DonatePage from './pages/DonatePage'
import NotFoundPage from './pages/NotFoundPage'

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'blog', element: <BlogPage /> },
      { path: 'blog/:slug', element: <BlogPostPage /> },
      { path: 'projects', element: <ProjectsPage /> },
      { path: 'about', element: <AboutPage /> },
      { path: 'contact', element: <ContactPage /> },
      { path: 'demo', element: <AIDemoPage /> },
      { path: 'donate', element: <DonatePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

export default router
