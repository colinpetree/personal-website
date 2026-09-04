import { Outlet } from 'react-router'
import Navbar from './components/Navbar'
import { ToastProvider } from './context/ToastContext'
import { NavOverlayProvider } from './context/NavOverlayContext'

export default function App() {
  return (
    <ToastProvider>
      <NavOverlayProvider>
        <Navbar />
        <Outlet />
      </NavOverlayProvider>
    </ToastProvider>
  )
}
