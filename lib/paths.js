/**
 * 运行时可编辑文件的落点：默认放在手机存储里，方便用文件管理器直接改。
 *
 * 为什么不用 $DSH_HOME/cache：那是引擎内部目录，手机上看不到；用户要"自己改"就必须放在
 * 能打开的位置。默认 /sdcard/Download/DSH-Go/fishy/，可用 FISHY_HOME 覆盖（测试用）。
 */
import { homedir } from 'node:os'
import { join } from 'node:path'

/** 用户可编辑目录：phrases.json / config.json / memory.json 都放这里 */
export function fishyDir() {
  return process.env.FISHY_HOME || '/sdcard/Download/DSH-Go/fishy'
}

/** 目录里的某个文件 */
export function fishyFile(name) {
  return join(fishyDir(), name)
}

/** 兼容老位置（$DSH_HOME/cache/local-fishy-jarvis）：读不到新文件时回退读这里 */
export function legacyDir() {
  return process.env.FISHY_MEMORY_DIR || join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'cache', 'local-fishy-jarvis')
}
