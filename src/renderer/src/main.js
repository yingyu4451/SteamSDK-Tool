import { createApp } from 'vue'
import App from './App.vue'
import './style.css'
import { reveal, stagger } from './motion.js'

const app = createApp(App)
app.directive('reveal', reveal)
app.directive('stagger', stagger)
app.mount('#app')

// 窗口标题两种语言都一样，直接写常量：主进程 createWindow 的 title 与这里保持一致，
// 页面自己的 <title> 会盖掉主进程那个，所以两边都得是同一个字符串。
document.title = 'SteamSDK Tool'
