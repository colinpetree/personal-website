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
import RoleGuard from './components/admin/RoleGuard'
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
import AdminBlogPostsPage from './pages/admin/AdminBlogPostsPage'
import AdminBlogEditorPage from './pages/admin/AdminBlogEditorPage'
import AdminPageContentEditor from './pages/admin/AdminPageContentEditor'
import AdminBlogCommentsPage from './pages/admin/AdminBlogCommentsPage'
import AdminUsersPage from './pages/admin/AdminUsersPage'
import UserProfilePage from './pages/UserProfilePage'

// For admin-only pages, editors fall back to /admin/blog and contributors to /admin/blog/posts
const adminOnlyFallback = (admin) =>
  admin?.role === 'editor' ? '/admin/blog' : '/admin/blog/posts'

export function createRouter(slugs = {}) {
  const {
    blog = 'blog',
    projects = 'projects',
    about = 'about',
    contact = 'contact',
    ai_demo = 'demo',
    donate = 'donate',
  } = slugs

  return createBrowserRouter([
    // Public site — Navbar layout
    {
      path: '/',
      element: <App />,
      children: [
        { index: true, element: <HomePage /> },
        { path: blog, element: <BlogPage /> },
        { path: projects, element: <ProjectsPage /> },
        { path: about, element: <AboutPage /> },
        { path: contact, element: <ContactPage /> },
        { path: ai_demo, element: <AIDemoPage /> },
        { path: donate, element: <DonatePage /> },
        { path: 'profile', element: <UserProfilePage /> },
        { path: ':slug', element: <BlogPostPage /> },
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
        // Administrator+ only
        {
          index: true,
          element: (
            <RoleGuard minRole="administrator" fallback={adminOnlyFallback}>
              <AdminSettingsPage />
            </RoleGuard>
          ),
        },
        {
          path: 'users',
          element: (
            <RoleGuard minRole="administrator" fallback={adminOnlyFallback}>
              <AdminUsersPage />
            </RoleGuard>
          ),
        },
        // Editor+ only (contributors are blocked)
        {
          path: 'home',
          element: (
            <RoleGuard minRole="editor" fallback="/admin/blog/posts">
              <AdminHomePage />
            </RoleGuard>
          ),
        },
        {
          path: 'home/edit',
          element: (
            <RoleGuard minRole="editor" fallback="/admin/blog/posts">
              <AdminPageContentEditor pageTitle="Home" backTo="/admin/home" contentField="home_text" metaField="home_meta_description" />
            </RoleGuard>
          ),
        },
        {
          path: 'blog',
          element: (
            <RoleGuard minRole="editor" fallback="/admin/blog/posts">
              <AdminBlogPage />
            </RoleGuard>
          ),
        },
        {
          path: 'blog/comments',
          element: (
            <RoleGuard minRole="editor" fallback="/admin/blog/posts">
              <AdminBlogCommentsPage />
            </RoleGuard>
          ),
        },
        {
          path: 'projects',
          element: (
            <RoleGuard minRole="editor" fallback="/admin/blog/posts">
              <AdminProjectsPage />
            </RoleGuard>
          ),
        },
        {
          path: 'projects/edit',
          element: (
            <RoleGuard minRole="editor" fallback="/admin/blog/posts">
              <AdminPageContentEditor pageTitle="Projects" backTo="/admin/projects" contentField="projects_text" metaField="projects_meta_description" />
            </RoleGuard>
          ),
        },
        {
          path: 'about',
          element: (
            <RoleGuard minRole="editor" fallback="/admin/blog/posts">
              <AdminAboutPage />
            </RoleGuard>
          ),
        },
        {
          path: 'about/edit',
          element: (
            <RoleGuard minRole="editor" fallback="/admin/blog/posts">
              <AdminPageContentEditor pageTitle="About" backTo="/admin/about" contentField="about_text" metaField="about_meta_description" />
            </RoleGuard>
          ),
        },
        {
          path: 'contact',
          element: (
            <RoleGuard minRole="editor" fallback="/admin/blog/posts">
              <AdminContactPage />
            </RoleGuard>
          ),
        },
        {
          path: 'demo',
          element: (
            <RoleGuard minRole="editor" fallback="/admin/blog/posts">
              <AdminAIDemoPage />
            </RoleGuard>
          ),
        },
        {
          path: 'donate',
          element: (
            <RoleGuard minRole="editor" fallback="/admin/blog/posts">
              <AdminDonatePage />
            </RoleGuard>
          ),
        },
        {
          path: 'accounts',
          element: (
            <RoleGuard minRole="editor" fallback="/admin/blog/posts">
              <AdminAccountsPage />
            </RoleGuard>
          ),
        },
        // All roles
        { path: 'blog/posts', element: <AdminBlogPostsPage /> },
        { path: 'blog/posts/:id', element: <AdminBlogEditorPage /> },
      ],
    },
  ])
}
