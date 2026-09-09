/**
 * 测试用的编辑器工厂：直接构建 schema、序列化器与文档控制器，
 * 不依赖 Vue 组件，用于验证“导入 → 编辑 → 导出”的源码保留链路。
 */
import { Schema } from '@tiptap/pm/model';
import { getSchema } from '@tiptap/core';
import { glfmExtensions } from '../../src/glfm/schema';
import { createGlfmSerializer } from '../../src/glfm/serialize';
import { DocumentController } from '../../src/source/document-controller';
import { resetSourceIdCounter } from '../../src/source/source-id';
import { fixtureRenderer } from './renderer';

/** 创建 GLFM schema。 */
export function createSchema(): Schema {
  return getSchema(glfmExtensions());
}

/** 测试环境：schema、序列化器与文档控制器。 */
export interface TestEnv {
  schema: Schema;
  controller: DocumentController;
  render: (markdown: string) => Promise<{ html: string }>;
}

/** 建立隔离的测试环境。 */
export function createEnv(): TestEnv {
  resetSourceIdCounter();
  const schema = createSchema();
  const serializer = createGlfmSerializer();
  return {
    schema,
    controller: new DocumentController(schema, serializer),
    render: fixtureRenderer.render,
  };
}

/** 导入 Markdown 并返回控制器。 */
export async function load(env: TestEnv, markdown: string) {
  const result = await env.controller.load(markdown, (value) => env.render(value));
  return result;
}

/** 导入并直接导出，用于往返验证。 */
export async function roundTrip(env: TestEnv, markdown: string): Promise<string> {
  const result = await load(env, markdown);
  return env.controller.export(result.doc);
}
