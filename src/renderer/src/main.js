import { createApp, watch } from 'vue'
import App from './App.vue'
import './style.css'
import { reveal, stagger } from './motion.js'
import { lang, t } from './i18n/index.js'

const app = createApp(App)
app.directive('reveal', reveal)
app.directive('stagger', stagger)
app.mount('#app')

// 窗口标题（任务栏 / Alt+Tab）跟着界面语言走。主进程也会设一次，
// 但页面自己的 <title> 会盖回去，所以这里也盯着。
watch(
  lang,
  () => {
    document.title = t('SteamSDK 上传工作台')
  },
  { immediate: true }
)
