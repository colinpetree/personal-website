import RoleGuard from '../../components/admin/RoleGuard'
import AdminPageContentEditor from './AdminPageContentEditor'

export default function AdminAboutEditRoute() {
  return (
    <RoleGuard minRole="editor" fallback="/admin/blog/posts">
      <AdminPageContentEditor pageTitle="About" backTo="/admin/about" contentField="about_text" metaField="about_meta_description" />
    </RoleGuard>
  )
}
