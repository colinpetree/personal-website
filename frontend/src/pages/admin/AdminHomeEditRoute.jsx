import RoleGuard from '../../components/admin/RoleGuard'
import AdminPageContentEditor from './AdminPageContentEditor'

export default function AdminHomeEditRoute() {
  return (
    <RoleGuard minRole="editor" fallback="/admin/blog/posts">
      <AdminPageContentEditor pageTitle="Home" backTo="/admin/home" contentField="home_text" metaField="home_meta_description" navField="home_scrollable_nav_enabled" widthField="home_page_width" fontFamilyField="home_font_family" />
    </RoleGuard>
  )
}
