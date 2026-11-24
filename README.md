# dsh-go 手机助手 · Phone Assistant for dsh-go

仓库 / Repo: <https://github.com/Fangshuming-star/Deepseek-Mobile-voice-assistant-Plugin-for-DSH-GO>

一个 dsh-go 插件：**直接用 dsh-go 自带的手机操控**（MCP）读屏、点按、输入、滑动、开应用，带长期记忆、语音优先和步骤播报。**不依赖任何第三方 App。**

A dsh-go plugin that drives the phone through dsh-go's own phone-control MCP: read the screen, tap, type, scroll, open apps — with long-term memory, voice-first replies and step narration. No third-party app required.

## 能做什么 / Features

- 读屏拿编号、按编号点按、往输入框输入、滑动、按键、打开应用、等界面刷新、批量动作
- 长期记忆（偏好 / 常做 / 事实 / 踩过的坑 / 称呼），可召回、可清空
- 语音优先模式：需要选的时候口头念出选项，支持「再说一遍 / 再播报一次」
- 步骤播报：每完成一步用 2–15 字念一句，可开关
- 输入框上方状态条、主面板、记忆/快捷指令/设置面板、长按菜单、回合尾注
- 31 项设置都能在 App 里改；文案全部可改（phrases.json），无需改代码

## 安装 / Install

需要 dsh-go（本机引擎）。先打开 `设置 › 手机操控`，按提示授权。

插件市场（推荐）：`设置 › 插件 › 插件市场` → 搜索 `dsh-go-phone-assistant` 或输入 npm 包名安装。

命令行：

```sh
dsh plugin --profile web add dsh-go-phone-assistant
# 或本地目录
dsh plugin --profile web add /绝对路径/dsh-go-phone-assistant
```

## 配置 / Configuration

运行时文件在手机存储里，文件管理器可直接改；也可以在「助手设置」面板里改：

| 文件 | 内容 |
|---|---|
| `/sdcard/Download/DSH-Go/fishy/phrases.json` | 全部文案（中英各一份） |
| `/sdcard/Download/DSH-Go/fishy/config.json` | 开关、唤醒词、记忆上限、危险词表、语音参数 |
| `/sdcard/Download/DSH-Go/fishy/memory.json` | 长期记忆 |

改文件和面板都不会影响已装的其他插件；改 `lib/` 代码才需要重启引擎。

## 工具 / Tools

`fishy_screen` `fishy_tap` `fishy_type` `fishy_swipe` `fishy_key` `fishy_open` `fishy_wait` `fishy_do` `fishy_memory` `fishy_voice`

## 开发 / Development

```sh
node --test test/*.test.js
node <dsh-go 插件检查器>/kit/bin/check.mjs . --load
```

## 许可 / License

MIT。dsh-go 本体是 AGPL-3.0。
