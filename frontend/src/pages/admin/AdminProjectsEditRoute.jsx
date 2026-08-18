import RoleGuard from '../../components/admin/RoleGuard'
import AdminPageContentEditor from './AdminPageContentEditor'

export default function AdminProjectsEditRoute() {
  return (
    <RoleGuard minRole="editor" fallback="/admin/blog/posts">
      <AdminPageContentEditor pageTitle="Projects" backTo="/admin/projects" contentField="projects_text" metaField="projects_meta_description" navField="projects_scrollable_nav_enabled" />
    </RoleGuard>
  )
}
