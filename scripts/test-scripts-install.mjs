/**
 * scripts.js 冒烟测试：把随包的 build.ps1 / check.ps1 装进一个假的 ContentBuilder，
 * 验证「缺了补、有了不动、改过不覆盖、点修复才覆盖」这几条纪律。
 *
 *   node scripts/test-scripts-install.mjs
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { BUNDLED_SCRIPTS, resolveBundledScriptsDir, setBundledScriptsDir, inspectScripts, installScripts, ensureScripts } =
  await import(pathToFileURL(path.join(root, 'src/main/scripts.js')).href)

let failed = 0
function check(name, cond, extra = '') {
  if (cond) {
    console.log(`  ok   ${name}`)
  } else {
    failed++
    console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ''}`)
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'steamsdk-scripts-'))
const cb = path.join(tmp, 'tools', 'ContentBuilder')
fs.mkdirSync(cb, { recursive: true })

try {
  const found = resolveBundledScriptsDir({ isPackaged: false, appPath: root })
  check('找到仓库里的 resources/scripts', found === path.join(root, 'resources', 'scripts'), found)
  setBundledScriptsDir(found)

  const before = inspectScripts(cb)
  check('空 ContentBuilder：两个都缺', before.missing.length === 2, JSON.stringify(before.missing))
  check('自带脚本齐全', before.bundledReady === true)

  const first = ensureScripts(cb)
  check('自动补两个脚本', first.missing.length === 0 && first.written.length === 2, JSON.stringify(first))
  for (const name of BUNDLED_SCRIPTS) {
    check(`${name} 文件真的在`, fs.existsSync(path.join(cb, name)))
  }

  const again = ensureScripts(cb)
  check('已存在时不再重写', again.written.length === 0, JSON.stringify(again.written))

  // 模拟用户改过脚本：内容不一样 -> 算 stale，但自动流程不许覆盖
  const edited = path.join(cb, 'build.ps1')
  fs.appendFileSync(edited, '\r\n# local tweak\r\n')
  const stale = inspectScripts(cb)
  check('改过的脚本标成 stale', stale.stale.includes('build.ps1'), JSON.stringify(stale.stale))
  const kept = ensureScripts(cb)
  check('自动流程不覆盖用户改过的脚本', fs.readFileSync(edited, 'utf8').includes('# local tweak'), 'file was overwritten')
  check('不覆盖时也没有报错', kept.error === '', kept.error)

  const repaired = installScripts(cb, { force: true })
  check('点修复后覆盖回自带版本', repaired.ok && !fs.readFileSync(edited, 'utf8').includes('# local tweak'))
  check('修复后不再 stale', inspectScripts(cb).stale.length === 0)

  const missingCb = installScripts(path.join(tmp, 'nope'))
  check('ContentBuilder 不存在时报错', missingCb.ok === false && !!missingCb.error, JSON.stringify(missingCb))

  console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed')
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}

process.exit(failed ? 1 : 0)
