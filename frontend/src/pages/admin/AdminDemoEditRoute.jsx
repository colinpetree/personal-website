import RoleGuard from '../../components/admin/RoleGuard'
import AdminPageContentEditor from './AdminPageContentEditor'

export default function AdminDemoEditRoute() {
  return (
    <RoleGuard minRole="editor" fallback="/admin/blog/posts">
      <AdminPageContentEditor pageTitle="AI Implementations" backTo="/admin/demo" contentField="ai_demo_text" metaField="ai_demo_meta_description" navField="ai_demo_scrollable_nav_enabled" widthField="ai_demo_page_width" fontFamilyField="ai_demo_font_family" />
    </RoleGuard>
  )
}
