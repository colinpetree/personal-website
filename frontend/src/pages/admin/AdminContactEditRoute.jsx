import RoleGuard from '../../components/admin/RoleGuard'
import AdminPageContentEditor from './AdminPageContentEditor'

export default function AdminContactEditRoute() {
  return (
    <RoleGuard minRole="editor" fallback="/admin/blog/posts">
      <AdminPageContentEditor pageTitle="Contact" backTo="/admin/contact" contentField="contact_text" metaField="contact_meta_description" navField="contact_scrollable_nav_enabled" widthField="contact_page_width" fontFamilyField="contact_font_family" />
    </RoleGuard>
  )
}
