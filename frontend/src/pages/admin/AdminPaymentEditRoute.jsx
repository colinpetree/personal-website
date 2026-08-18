import RoleGuard from '../../components/admin/RoleGuard'
import AdminPageContentEditor from './AdminPageContentEditor'

export default function AdminPaymentEditRoute() {
  return (
    <RoleGuard minRole="editor" fallback="/admin/blog/posts">
      <AdminPageContentEditor pageTitle="Payment" backTo="/admin/payment" contentField="payment_text" metaField="payment_meta_description" navField="payment_scrollable_nav_enabled" />
    </RoleGuard>
  )
}
