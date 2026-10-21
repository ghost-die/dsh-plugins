# dsh-plugins

DeepSeek Harness（DSH）的本地插件集合。每个子目录是一个独立的插件 bundle，可通过 DSH 的插件管理（`plugin_manager` 的 `install_bundle` 或插件页）安装。

## 目录

| 插件 | 说明 |
| --- | --- |
| [`copilot-login/`](./copilot-login/README.md) | 在 设置 → 模型 页面增加 GitHub Copilot 卡片：设备码登录、启用 Copilot 提供方、无需 API Key 即可使用 Copilot 模型。 |

## 快速开始

1. 将本仓库克隆到本地：

   ```bash
   git clone git@github.com:ghost-die/dsh-plugins.git
   cd dsh-plugins
   ```

2. 在 DSH 中安装需要的插件（以 `copilot-login` 为例），按插件目录下的 README 操作。

3. 打开 DSH Web 界面，在对应页面查看插件提供的入口。

## 插件结构约定

每个插件目录通常包含：

- `package.json` —— 包名（`@local/...`）、入口与 `dsh` 字段（bundle 补丁、客户端注入声明）。
- `index.js` —— Host 侧逻辑（HTTP 接口、服务注册等）。
- `client.js` —— Web 客户端渲染逻辑（通过 `dsh.client.inject` 挂载到宿主页面）。
- `cordis.patch.yml` —— 插件的依赖与配置声明。
- `locale/*.json` —— 多语言文案（如 `en`、`zh`）。
- `icon.svg` —— 插件图标。
- `README.md` —— 插件说明、使用方式、接口与限制。

新增插件时，建议沿用上述结构，并在本表格中补充一行索引。

## 开发

- 插件是纯 ESM（`"type": "module"`），无需构建步骤即可被 DSH 加载。
- 修改 `client.js` 后，若同时运行 DSH 的 `pnpm run dev:web`，客户端插件可热更新；否则需要刷新页面或重新构建 Web 产物。
- 修改 Host 侧 `index.js` 或 `cordis.patch.yml` 后，需要重启 DSH Host 进程。

## 贡献

1. Fork 或新建分支。
2. 按上述结构新增或修改插件，并更新对应 README。
3. 提交 Pull Request，说明改动范围与验证方式。

## 许可

未指定许可证。如需开源发布，请在根目录补充 `LICENSE` 文件。
