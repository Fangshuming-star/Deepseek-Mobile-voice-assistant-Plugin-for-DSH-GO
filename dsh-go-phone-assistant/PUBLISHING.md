# 发布到 GitHub / npm / 插件市场

## 0. 先改占位符

把 `Fangshuming-star` 换成你的 GitHub 用户名：

- `package.json` 里的 `author.url`、`repository.url`、`homepage`、`bugs.url`
- `market/index.json` 里的 `homepage`、`repository.url`

```sh
cd dsh-go-phone-assistant
grep -rn Fangshuming-star .
```

## 1. 上传 GitHub

```sh
git init
git add -A
git commit -m "feat: dsh-go phone assistant 1.0.0"
git branch -M main
git remote add origin https://github.com/Fangshuming-star/dsh-go-phone-assistant.git
git push -u origin main
```

GitHub 上新仓库先不要勾选 README/LICENSE（本地已经有了）。

## 2. 发布到 npm（插件市场靠它安装）

```sh
npm login                       # 没账号先 npm adduser
npm publish --registry https://registry.npmjs.org/
```

发布后验证：

```sh
npm view dsh-go-phone-assistant version
```

注意：npmmirror 只是镜像，**不能**往镜像发布；只发官方 registry，镜像会自动同步。

## 3. 让它出现在插件市场

dsh-go 的插件市场读的是**市场索引 JSON**（格式 1）。本仓库自带 `market/index.json`，
把它放到任意可公网访问的 https 地址即可，例如：

- GitHub raw：`https://raw.githubusercontent.com/<用户名>/dsh-go-phone-assistant/main/market/index.json`
- 或 GitHub Pages

然后在 dsh-go 里添加这个索引源（能加自定义索引的入口在网页版 `设置 › 插件市场 › 索引源`；
App 的市场会读取同一份配置）。加好后搜索「手机助手」或包名即可安装。

> 如果暂时不想配索引：直接在插件市场里输入 npm 包名 `dsh-go-phone-assistant` 安装，
> 或命令行 `dsh plugin --profile web add dsh-go-phone-assistant`。

## 4. 以后发新版本

1. 改 `package.json` 的 `version`
2. 在 `CHANGELOG.md` 记一条
3. `market/index.json` 里加一个新 version 条目（`publishTimestamp` 用发布时刻的 Unix 秒）
4. `npm publish` → `git tag v1.0.1 && git push --tags`
5. 索引更新后，App 市场下拉刷新即可看到新版本

## 5. 本地自检

```sh
node --test test/*.test.js
node <dsh-go 插件检查器>/kit/bin/check.mjs . --load
node -e "import('/opt/dsh/node_modules/@deepseek-ai/dsh-plugin-market-index/lib/index.js').then(m=>{const fs=require('fs');const j=JSON.parse(fs.readFileSync('market/index.json','utf8'));m.parseMarketIndex(j,'https://raw.githubusercontent.com/x/y/main/market/index.json');console.log('market index OK')})"
```
