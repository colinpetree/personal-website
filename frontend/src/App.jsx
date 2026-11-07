import { Outlet } from 'react-router'
import Navbar from './components/Navbar'
import { ToastProvider } from './context/ToastContext'

export default function App() {
  return (
    <ToastProvider>
      <Navbar />
      <Outlet />
    </ToastProvider>
  )
}
