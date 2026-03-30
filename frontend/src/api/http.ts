import axios from 'axios'

const http = axios.create({
  baseURL: '/',
  timeout: 30000,
})

http.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error)
    return Promise.reject(error)
  },
)

export default http
