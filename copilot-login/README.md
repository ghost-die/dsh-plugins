# GitHub Copilot 登录（@local/dsh-copilot-login）

在 DeepSeek Harness 的设置 → 模型中增加一张卡片：用 GitHub 账号完成设备码授权登录，启用 Copilot 提供方，然后在模型选择器里直接使用 Copilot 模型。无需 API Key。

## 它做什么

Harness 自带的 `@deepseek-ai/dsh-llm-pi-ai` 已经包含 `github-copilot` 提供方：端点、请求头、模型目录、GitHub 令牌换取 Copilot 令牌、自动刷新都由它负责，并且它已经在授权总线上注册了 `llm-pi-ai/github-copilot` 的登录流程。缺的是 Web 上的入口——模型页没有触发这个流程的地方，未配置的提供方也不会出现在模型列表里。

本插件补齐这两点：

- **Host 半**（`index.js`）在同一来源下提供 `/plugin/copilot/*` JSON 接口：读取登录状态、启动/取消登录、回答流程提问、退出登录，以及把空的 `github-copilot` 提供方档案写入模型设置（等价于在模型页添加该提供方）。
- **Client 半**（`client.js`）在设置 → 模型的页脚渲染一张卡片，显示状态、一次性验证码和操作按钮。

插件不实现任何模型传输，也不读取凭证内容：请求仍由 `llm-pi-ai` 发出，凭证仍保存在 Harness 凭证服务里（记录键 `llm-pi-ai/github-copilot`）。

## 使用

1. 安装并启用本 bundle（`plugin_manager` 的 `install_bundle`，或在插件页安装）。
2. 打开 **设置 → 模型**，页面底部出现 “GitHub Copilot” 卡片。
3. 点 **启用 Copilot 提供方**。这会写入一个空的 Copilot 档案，`github-copilot` 路由随即注册，卡片会显示可用模型数量。
4. 点 **使用 GitHub 登录**：卡片会显示 `https://github.com/login/device` 和一次性验证码，在浏览器里输入即可。需要 GitHub Copilot 订阅（或可用的 Copilot 策略）。
5. GitHub 确认后卡片自动变为“已登录”。在模型选择器或 **设置 → 模型** 中选择 Copilot 模型开始对话。

企业版 GitHub：在登录前把域名（例如 `company.ghe.com`）填到卡片里的“GitHub 域名”输入框；留空表示 `github.com`。

## 配置（可选）

`cordis.patch.yml` 中该行的 `config` 可覆盖默认值：

| 字段 | 默认值 | 含义 |
| --- | --- | --- |
| `provider` | `github-copilot` | 目标模型路由 |
| `flowKey` | `llm-pi-ai/<provider>` | 授权总线上的凭证键 |
| `modelPluginId` | `llm-pi-ai` | 提供方所属插件名，仅用于错误提示 |
| `basePath` | `/plugin/copilot` | HTTP 接口挂载路径（改动后需同步 `client.js` 里的 `BASE`） |

默认值适用于官方 `llm-pi-ai` 组合，一般不需要改。

## 接口

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/plugin/copilot/state` | 路由是否注册、模型数、登录状态、流程与当前尝试 |
| POST | `/plugin/copilot/login` | 启动登录，`{ "enterpriseDomain": "" }` 可预答域名提问 |
| POST | `/plugin/copilot/answer` | 回答流程的提问，`{ "value": "..." }` |
| POST | `/plugin/copilot/cancel` | 取消进行中的登录 |
| POST | `/plugin/copilot/logout` | 删除已保存的登录记录 |
| POST | `/plugin/copilot/enable-route` | 写入空的 Copilot 提供方档案 |

`POST` 只接受与本页面同源（`Origin` 与 `Host` 一致）且 `Content-Type: application/json` 的请求；跨站页面无法读取响应，也无法完成写入。

## 依赖与降级

- 需要 Web 运行时（`webServer` 服务），`inject` 已声明。
- `authorization`、`credentials`、`llm`、`settings` 都是可选依赖：缺少时会返回带代码的错误，卡片显示对应提示，不会让插件加载失败。
- 没有 `llm-pi-ai` 时卡片显示“未找到登录流程”，不会假装可用。

## 卸载

在插件页停用或移除本 bundle。已写入的 `github-copilot` 提供方档案与已保存的登录记录不会自动删除；如不再需要，在 **设置 → 模型** 中移除该提供方，并用卡片的“退出登录”清除凭证。

## 已知限制

- 登录必须在同一个 Host 进程内完成；刷新页面不影响 Host 侧进行中的登录，但重启 Host 会中断它。
- 设备码登录依赖 GitHub 与 Copilot 内部接口可达；企业代理或受限网络下可能失败，错误会显示在卡片上。
- 模型目录来自 `pi-ai` 内置目录与 Copilot 账号策略，实际可选模型取决于订阅。
