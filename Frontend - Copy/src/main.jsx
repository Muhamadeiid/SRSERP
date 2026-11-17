import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { store } from './store/index.js'
import './index.css'
import App from './App.jsx'
import { ensureServiceWorker } from './services/pushService.js'

// Register the push service worker in the background. Silent if unsupported.
// The notification subscription is started by AuthSync in App.jsx once a user
// is logged in — running it here would leak listeners on /login and never
// re-init after logout+login.
ensureServiceWorker()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>,
)
