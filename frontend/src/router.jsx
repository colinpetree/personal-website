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
import AdminLayout from './components/admin/AdminLayout'
import AdminLoginPage from './pages/admin/AdminLoginPage'
import AdminSettingsPage from './pages/admin/AdminSettingsPage'
import AdminHomePage from './pages/admin/AdminHomePage'
import AdminBlogPage from './pages/admin/AdminBlogPage'
import AdminProjectsPage from './pages/admin/AdminProjectsPage'
import AdminAboutPage from './pages/admin/AdminAboutPage'
import AdminContactPage from './pages/admin/AdminContactPage'
import AdminAIDemoPage from './pages/admin/AdminAIDemoPage'
import AdminDonatePage from './pages/admin/AdminDonatePage'
import AdminAccountsPage from './pages/admin/AdminAccountsPage'

const router = createBrowserRouter([
  // Public site — Navbar layout
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
  // Admin login — standalone page (no sidebar)
  {
    path: '/admin/login',
    element: <AdminLoginPage />,
  },
  // Admin panel — sidebar layout with auth guard built into AdminLayout
  {
    path: '/admin',
    element: <AdminLayout />,
    children: [
      { index: true, element: <AdminSettingsPage /> },
      { path: 'home', element: <AdminHomePage /> },
      { path: 'blog', element: <AdminBlogPage /> },
      { path: 'projects', element: <AdminProjectsPage /> },
      { path: 'about', element: <AdminAboutPage /> },
      { path: 'contact', element: <AdminContactPage /> },
      { path: 'demo', element: <AdminAIDemoPage /> },
      { path: 'donate', element: <AdminDonatePage /> },
      { path: 'accounts', element: <AdminAccountsPage /> },
    ],
  },
])

export default router
