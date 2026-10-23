# AI File Manager

AI 辅助文件管理开源项目：希望帮助用户理解、查找和整理文件。

An open-source project exploring AI-assisted file search and organization.

> 项目状态：筹备阶段。目前仅包含开源基础文档和配置示例，没有可运行的应用，也没有发布版本。技术栈、模型服务与数据存储方案尚未确定。

## 计划探索的能力

以下均为规划，尚未实现：

- 通过自然语言搜索文件。
- 根据文件内容生成摘要、标签与分类建议。
- 预览批量重命名、移动与整理方案，再由用户确认执行。
- 探索本地索引和可选择的模型接入方式。

## 数据与文件安全设计目标

以下为未来实现的设计要求，并非当前产品已经提供的功能：

- 明确告知文件内容是否会发送给外部模型，并由用户选择。
- API 密钥保存在本地配置中，不提交到仓库。
- 用户文件、索引、向量数据库、日志和缓存默认不进入版本控制。
- 文件修改操作提供预览与确认，优先支持可撤销流程。
- 开发与演示使用虚构数据，避免上传真实个人文件。

## 获取项目

```bash
git clone https://github.com/arnoldsa2769/ai-file-manager.git
cd ai-file-manager
```

目前没有安装或启动命令。`.env.example` 仅用于说明未来配置的约定，当前没有程序读取这些变量。

## 项目文件

- `LICENSE`：Apache License 2.0 完整文本。
- `.gitignore`：本地配置、用户数据和生成文件的忽略规则。
- `.env.example`：不含真实密钥的配置示例。
- `ROADMAP.md`：初期开发路线。
- `CONTRIBUTING.md`：贡献方式。
- `SECURITY.md`：安全问题反馈指引。

## 参与讨论

欢迎通过 [Issues](https://github.com/arnoldsa2769/ai-file-manager/issues) 分享使用场景、功能建议与问题。开始较大改动前，请先讨论范围。

## 许可证

本项目采用 [Apache License 2.0](LICENSE)，允许商业使用、修改和分发，使用时需遵守协议条件。第三方依赖、模型和素材仍受其各自许可证约束。
