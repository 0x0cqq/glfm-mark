# 0006. 包名采用 @glfm-mark/vue

- 状态：accepted
- 日期：2026-09-10
- 关联：`package.json`、`AGENTS.md`、`docs/original-design-doc.md` §2

## 背景

原始设计规格 §2 写“包名固定为 `@glfm-editor/vue`”，仓库根目录 `AGENTS.md`
写“项目与仓库名称：`glfm-mark`。Vue 包目标名称：`@glfm-mark/vue`”。
两处对同一个公开名称给出了不同取值，需要明确以哪一方为准。

`AGENTS.md` 是长期协作方式与工程约束的载体，明确说明“名称用于项目配置”；
设计规格是首版实现规格，其余内容（技术路线、功能边界、接口、失败行为与实现
顺序）与 `AGENTS.md` 一致。

## 决策

包名采用 `@glfm-mark/vue`，与 `AGENTS.md` 的项目命名保持一致。

## 理由与取舍

- 仓库名称、文档标题与示例目录都使用 `glfm-mark`，包名与之一致可避免长期维护
  两套名称。
- `AGENTS.md` 是跨任务的长期约定，命名属于其中明确规定的范围；设计规格中的
  包名出现在描述包结构的段落，属于从项目名称派生的细节。
- 设计规格的其他内容全部继续有效，未做任何放宽。

## 后果与验证

- `package.json` 的 `name` 为 `@glfm-mark/vue`，对外导出入口与类型保持不变。
- 包名尚未注册发布，改动成本低；若后续需要改名，只需修改 `package.json` 与
  相关文档中的一处引用。
- 设计规格原文保留在 `docs/original-design-doc.md`，不修改历史文档；
  差异由本 ADR 记录。
