// Loaded before anything else: every API client in the app (the default axios,
// each axios.create instance and plain fetch) reports a licence lock (HTTP 402)
// so the licence screen can take over at once.
import axios from 'axios'

export const LICENSE_LOCKED_EVENT = 'srs:license-locked'

const notify = license => window.dispatchEvent(new CustomEvent(LICENSE_LOCKED_EVENT, { detail: license }))

const onError = error => {
  const data = error?.response?.data
  if (error?.response?.status === 402 && data?.license_locked) notify(data.license)
  return Promise.reject(error)
}

const watch = instance => {
  instance.interceptors.response.use(response => response, onError)
  return instance
}

watch(axios)
const createInstance = axios.create.bind(axios)
axios.create = (...args) => watch(createInstance(...args))

const nativeFetch = window.fetch.bind(window)
window.fetch = async (...args) => {
  const response = await nativeFetch(...args)
  if (response.status === 402) {
    response.clone().json()
      .then(data => { if (data?.license_locked) notify(data.license) })
      .catch(() => {})
  }
  return response
}
