# dsh-plugins

DeepSeek Harness（DSH）的本地插件仓库。仓库根目录即为一个插件 bundle（`@local/dsh-copilot-login`），可直接通过仓库地址安装到 DSH 中。

插件详细说明见 [PLUGIN.md](./PLUGIN.md)。

## 插件

**GitHub Copilot 登录**：在 设置 → 模型 页面增加 GitHub Copilot 卡片，支持设备码登录、启用 Copilot 提供方，无需 API Key 即可使用 Copilot 模型。

## 安装

在 DSH 插件页（或通过 `plugin_manager` 的 `install_bundle`）输入仓库地址：

```
https://github.com/ghost-die/dsh-plugins
```

安装后打开 **设置 → 模型**，页面底部会出现 “GitHub Copilot” 卡片。

## 文件结构

- `package.json` —— 包名（`@local/dsh-copilot-login`）、入口与 `dsh` 字段（bundle 补丁、客户端注入声明）。
- `index.js` —— Host 侧逻辑（HTTP 接口）。
- `client.js` —— Web 客户端卡片渲染（注入 `@deepseek-ai/dsh-client-ui-settings-models`）。
- `cordis.patch.yml` —— 组合包补丁，声明插件条目。
- `locale/*.json` —— 多语言文案（`en`、`zh`）。
- `icon.svg` —— 插件图标。
- `PLUGIN.md` —— 插件说明、使用方式、接口与限制。

## 开发

- 插件是纯 ESM（`"type": "module"`），无需构建步骤即可被 DSH 加载。
- 修改 `client.js` 后，若同时运行 DSH 的 `pnpm run dev:web`，客户端插件可热更新；否则需要刷新页面或重新构建 Web 产物。
- 修改 `index.js` 或 `cordis.patch.yml` 后，需要重启 DSH Host 进程。

## 许可

未指定许可证。如需开源发布，请补充 `LICENSE` 文件。
