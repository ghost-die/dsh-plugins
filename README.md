# dsh-plugins

DeepSeek Harness（DSH）插件仓库：**一个 Git 仓库可以放多个独立插件包**。每个插件占一个子目录，有自己的 `package.json` 和 `dsh.bundle.patch`，可分别安装、启停和卸载。

## 选择并安装插件

| 插件 | 说明 | DSH 安装地址 |
| --- | --- | --- |
| [GitHub Copilot 登录](./copilot-login/README.md) | 在「设置 → 模型」通过 GitHub 设备码登录，并启用 Copilot 提供方。 | `https://github.com/ghost-die/dsh-plugins.git#path:/copilot-login` |

在 DSH **插件**页选择需要的插件，复制其「DSH 安装地址」到安装输入框；如要安装多个插件，分别安装对应地址即可。也可把同一地址交给 `plugin_manager` 的 `install_bundle`。

> **注意：** 直接输入 `https://github.com/ghost-die/dsh-plugins` 不会弹出插件选择界面，且仓库根目录不是插件包，会报“没有声明组合包”。DSH 目前一次安装一个 bundle，尚不支持读取 Git 仓库目录并自动提供多选列表。这里的“选择”是从上表挑选安装地址，**不是安装时自动勾选**。

地址中的 `#path:/copilot-login` 使用 [pnpm 官方支持的 Git 子目录安装语法](https://pnpm.io/package-sources#install-from-a-subdirectory-of-a-git-repository)。如需固定版本，可以用 Git ref 与子目录参数组合，例如 `https://github.com/ghost-die/dsh-plugins.git#main&path:/copilot-login`；在 Shell 中执行安装命令时须将整个地址用引号包住，避免 `&` 被 Shell 解释。

## 仓库结构

```text
dsh-plugins/
├── README.md                 # 插件目录与安装地址
└── copilot-login/            # 独立的 DSH bundle
    ├── package.json          # 包名、dsh.bundle.patch 与客户端入口
    ├── cordis.patch.yml      # Host 插件行
    ├── index.js              # Host 侧逻辑
    ├── client.js             # Web 侧逻辑
    ├── locale/               # 多语言文案
    ├── icon.svg
    └── README.md             # 具体使用方法
```

新增插件时，在新的子目录内放置独立的 `package.json`（含 `dsh.bundle.patch`）和补丁文件，并在上表添加其 `#path:/目录名` 安装地址。各插件的包名应互不相同。

## 许可

本仓库尚未指定许可证。
