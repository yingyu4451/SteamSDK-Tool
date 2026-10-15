import { createApp } from 'vue'
import App from './App.vue'
import './style.css'
import { reveal, stagger } from './motion.js'

const app = createApp(App)
app.directive('reveal', reveal)
app.directive('stagger', stagger)
app.mount('#app')
