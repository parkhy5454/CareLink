import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import HospitalDashboard from './dashboard/HospitalDashboard.jsx'
import PharmacyDashboard from './dashboard/PharmacyDashboard.jsx'
import AdminDashboard from './dashboard/AdminDashboard.jsx'
import FacilityApply from './dashboard/FacilityApply.jsx'
import './index.css'
import './dashboard/dashboard.css'

const path = window.location.pathname

let RootComponent = App
if (path.startsWith('/hospital')) {
  RootComponent = HospitalDashboard
} else if (path.startsWith('/pharmacy')) {
  RootComponent = PharmacyDashboard
} else if (path.startsWith('/admin')) {
  RootComponent = AdminDashboard
} else if (path.startsWith('/apply')) {
  RootComponent = FacilityApply
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>
)
