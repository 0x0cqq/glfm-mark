/** 测试与生产共用本地解析器，额外 HTML 契约样例由测试显式提供。 */
import { renderMarkdown } from '../../src/glfm/render';
/** 创建测试调用包装。 */
export function createFixtureRenderer() { return { render: renderMarkdown }; }
export const fixtureRenderer = createFixtureRenderer();
