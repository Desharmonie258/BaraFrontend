# 蔷薇前端 BaraFrontend

**为 SillyTavern 的表格数据库提供一套统一的角色面板。**

脚本 `1.11-Gigantea` · 模板 `1.1-Gigantea`

把散在十几张表里的属性、技能、特性、状态、资源、关系和人设小传，收进一个常驻在聊天下方的面板；顺带把检定、变更审核和角色卡一起做了。

本项目只是**显示层** —— 表格数据的存储与填写由 SP·数据库负责。

## 快速开始

完整图文教程见 [使用教程](发布/蔷薇前端-使用教程.md)。简版：

1. 装 [酒馆助手 JS-Slash-Runner](https://github.com/n0vi028/JS-Slash-Runner)（前置，两个脚本都跑在它上面）
2. 导入 [数据库本体](https://discord.com/channels/1134557553011998840/1429151492362862683)
3. 导入 [`发布/Script-BaraFrontend-1.11-Gigantea.json`](发布/)
4. 数据库设置 → 高级设置 → 存储模式切到 **SQLite**
5. 导入 [`发布/数据库模板-BaraFrontend-1.1-Gigantea.json`](发布/)

> 脚本与模板靠代号（`Gigantea`）配套，小版本号各自演进。脚本打热修时模板不必跟着换。

> [!IMPORTANT]
> 存储模式必须是 SQLite。留在原生 JSON 模式下面板能开，但角色卡里大部分分区会是空的。

## 功能

- **仪表盘** —— 当前时间地点、主角与在场角色、物资清单、人物关系图
- **表格坞** —— 模板里的全部表格，卡片 / 列表 / 日历 / 地图四种视图
- **角色卡** —— 总览 / 库存 / 特性 / 传记四页，把十余张表按角色聚合
- **手改数据** —— 仪表盘、表格坞、角色卡里都能直接改；手改不会混进变更审核
- **交互总览** —— 每张表的每一行都是一个可点对象，点动作就发出对应的一句话
- **检定** —— 点属性直接掷骰，或执行 AI 给出的检定建议；结果连同元叙事一并输出
- **三种规则族** —— SRD 5.2.1 (d20) / BRP SRD 1.0 (d100) / 说书人 (d10)，可切换并同步属性量纲到模板
- **变更审核** —— 基线比对，看出 AI 每轮改了什么
- **跨模板兼容** —— 认不出的表可用仪表盘预设补一组关键词；认不出的功能自动隐藏
- **12 套主题** × 深浅两版

## 开发

```bash
pnpm install
pnpm test          # vitest
pnpm build:tavern  # 构建 + 打包成单文件脚本
```

打包产物在 `dist/BaraFrontend/蔷薇前端-<版本号>.json`。版本号的唯一来源是 `src/BaraFrontend/domain/plugin-license.ts` 的 `PLUGIN_VERSION`，打包脚本从那里读，不要另写一份。

排障：浏览器控制台执行 `BaraFrontend.diagnose()`。

## 文档

- [版本号规则](doc/版本号规则.md) —— 脚本与模板两套版本号、热修字母、代号的取法

## 授权

本项目以 **Aladdin Free Public License (AFPL) Version 9** 分发，**不提供任何担保**。完整许可证见 [LICENSE](LICENSE)。

## 致谢

- **[Caikis 状态栏](https://discord.com/channels/1134557553011998840/1516454086721929297)** · Caikis —— 「手动标记重要角色、再由 AI 建档」的做法源自该前端；配套的数据库模板亦衍生自它的表结构
- **[骰子系统 my-tavern-scripts](https://github.com/jerryzmtz/my-tavern-scripts)** · kousakayou —— 聊天发送的兜底链、变更审核的比对算法、属性预设与模板同步的做法、检定预设结构与元叙事文本的组织方式
- **[Tidy 5e Sheets](https://github.com/kgar/foundry-vtt-tidy-5e-sheets)** · kgar (MIT) —— 角色卡的头部骨架与页签组织方式
- **[tavern_helper_template](https://github.com/StageDog/tavern_helper_template)** · 青空莉 —— 本仓库的脚手架与构建工作流

规则来源的完整声明（SRD 5.2.1 / BRP SRD 1.0 / Dark Pack）在插件设置的「关于」栏目内，恒以英文原文展示 —— 那些措辞是许可条件的一部分。
