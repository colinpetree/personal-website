import RoleGuard from '../../components/admin/RoleGuard'
import AdminPageContentEditor from './AdminPageContentEditor'

export default function AdminContactEditRoute() {
  return (
    <RoleGuard minRole="editor" fallback="/admin/blog/posts">
      <AdminPageContentEditor pageTitle="Contact" backTo="/admin/contact" contentField="contact_text" metaField="contact_meta_description" navField="contact_scrollable_nav_enabled" />
    </RoleGuard>
  )
}
