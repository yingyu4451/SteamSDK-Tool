import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

/**
 * 随包带的两个 PowerShell 脚本：build.ps1 / check.ps1。
 *
 * 它们不是 Steamworks SDK 的一部分（官方 SDK 里只有 readme.txt 和 run_build.bat），
 * 是这个工具自己的构建/校验逻辑。所以安装包里塞一份（electron-builder.yml 的
 * extraResources: resources/scripts → resources/scripts），启动 / 换 SDK 路径 /
 * 跑检查或上传之前，发现 SDK 的 tools\ContentBuilder 里没有就补进去。
 *
 * 三个纪律：
 *  - 已经在的文件不覆盖。用户可能改了脚本（比如换成自己公司的上传参数），
 *    自动流程不能把人家的版本冲掉。
 *  - 只有用户明确点「安装/修复脚本」时才覆盖（force），而且只有内容确实
 *    和自带版本不一样才写，避免无意义的文件改动。
 *  - 只写 SDK 的 ContentBuilder 目录，不碰别的地方。
 */

export const BUNDLED_SCRIPTS = ['build.ps1', 'check.ps1']

let bundledDir = ''

/** main 启动时把「自带脚本目录」定下来，之后各 handler 直接用。 */
export function setBundledScriptsDir(dir) {
  bundledDir = dir ? path.resolve(dir) : ''
}

export function getBundledScriptsDir() {
  return bundledDir
}

/**
 * 找到安装包里自带的脚本目录。
 * 打包后是 resources\scripts（extraResources），开发时是仓库里的 resources\scripts。
 * 两处都按「两个脚本都在」判断，避免半套文件被当成可用。
 */
export function resolveBundledScriptsDir({ isPackaged = false, resourcesPath = '', appPath = '' } = {}) {
  const packaged = resourcesPath ? path.join(resourcesPath, 'scripts') : ''
  const dev = appPath ? path.join(appPath, 'resources', 'scripts') : ''
  const candidates = (isPackaged ? [packaged, dev] : [dev, packaged]).filter(Boolean)
  const usable = candidates.find((dir) =>
    BUNDLED_SCRIPTS.every((name) => fs.existsSync(path.join(dir, name)))
  )
  return usable || candidates[0] || ''
}

function digest(file) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
  } catch {
    return ''
  }
}

/**
 * 对比「SDK 里现有的」和「工具自带的」。
 * contentBuilder 不存在时 missing 会是两个名字 —— 调用方先用 contentBuilderExists 判断 SDK 路径。
 */
export function inspectScripts(contentBuilderDir) {
  const targetDir = contentBuilderDir || ''
  const report = {
    bundledDir,
    bundledReady: false,
    missing: [],
    stale: [],
    details: {}
  }

  for (const name of BUNDLED_SCRIPTS) {
    const source = bundledDir ? path.join(bundledDir, name) : ''
    const target = targetDir ? path.join(targetDir, name) : ''
    const sourceSum = source ? digest(source) : ''
    const targetSum = target ? digest(target) : ''
    const bundled = Boolean(sourceSum)
    const installed = Boolean(targetSum)
    const stale = installed && bundled && sourceSum !== targetSum

    if (!installed) report.missing.push(name)
    else if (stale) report.stale.push(name)

    report.details[name] = { bundled, installed, stale, source, target }
  }

  report.bundledReady = BUNDLED_SCRIPTS.every((name) => report.details[name].bundled)
  return report
}

/**
 * 把自带的脚本写进 ContentBuilder。
 * force=false：只补缺失的（启动 / 换路径 / 跑任务前的自动流程）；
 * force=true：连内容不一样的也覆盖回去（设置页的「安装/修复脚本」）。
 */
export function installScripts(contentBuilderDir, { force = false } = {}) {
  const targetDir = contentBuilderDir || ''
  const result = { ok: false, error: '', written: [], skipped: [], failed: [] }

  if (!targetDir) {
    result.error = '没有 ContentBuilder 目录 —— 先在设置里选对 SDK 路径'
    return result
  }
  if (!fs.existsSync(targetDir)) {
    result.error = `ContentBuilder 目录不存在：${targetDir}`
    return result
  }
  if (!bundledDir || !fs.existsSync(bundledDir)) {
    result.error = '这个安装包里没找到自带的构建脚本（resources\\scripts），装包不完整'
    return result
  }

  let lastError = null
  for (const name of BUNDLED_SCRIPTS) {
    const source = path.join(bundledDir, name)
    const target = path.join(targetDir, name)
    const sourceSum = digest(source)
    if (!sourceSum) {
      result.failed.push(name)
      lastError = new Error(`自带脚本缺失：${source}`)
      continue
    }
    const targetSum = digest(target)
    if (targetSum === sourceSum) {
      result.skipped.push(name)
      continue
    }
    if (targetSum && !force) {
      // 已有且内容不同：用户可能改过，不动它
      result.skipped.push(name)
      continue
    }
    try {
      fs.copyFileSync(source, target)
      result.written.push(name)
    } catch (error) {
      result.failed.push(name)
      lastError = error
    }
  }

  const after = inspectScripts(targetDir)
  result.missing = after.missing
  result.stale = after.stale
  result.contentBuilderDir = targetDir
  result.ok = result.failed.length === 0 && after.missing.length === 0
  if (!result.ok) {
    const names = (result.failed.length ? result.failed : after.missing).join('、')
    const reason = lastError ? lastError.code || lastError.message : ''
    result.error = `写不进 ${targetDir}（${names}）：${reason || '未知错误'} —— 这个目录可能被占用或没有写权限`
  }
  return result
}

/**
 * 自动流程用：缺才补，有的不动。返回安装后的最新状态。
 */
export function ensureScripts(contentBuilderDir) {
  const before = inspectScripts(contentBuilderDir)
  if (!before.bundledReady || before.missing.length === 0) {
    return { ...before, written: [], error: before.bundledReady ? '' : '安装包里没找到自带的构建脚本' }
  }

  const result = installScripts(contentBuilderDir, { force: false })
  const after = inspectScripts(contentBuilderDir)
  return { ...after, written: result.written, error: result.error }
}
