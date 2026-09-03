import RoleGuard from '../../components/admin/RoleGuard'
import AdminPageContentEditor from './AdminPageContentEditor'

export default function AdminBlogEditRoute() {
  return (
    <RoleGuard minRole="editor" fallback="/admin/blog/posts">
      <AdminPageContentEditor pageTitle="Blog" backTo="/admin/blog" contentField="blog_text" metaField="blog_meta_description" fontFamilyField="blog_font_family" />
    </RoleGuard>
  )
}
