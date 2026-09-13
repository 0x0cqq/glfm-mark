/**
 * 静态挂载入口：供 MkDocs 普通脚本直接调用。
 *
 * 同一容器只能存在一个实例；重复挂载会先销毁旧实例。
 * 离开页面时调用返回句柄的 `destroy()` 释放组件、监听器和未完成请求。
 */
import { createApp, h, ref, type App } from 'vue';
import './styles/style.css';
import GlfmEditor from './components/GlfmEditor.vue';
import type {
  DocumentContext,
  EditorError,
  EditorMode,
  EditorTheme,
  EditorServices,
  GlfmEditorHandle,
  MountedGlfmEditor,
} from './core/types';

/** 挂载选项。 */
export interface MountGlfmEditorOptions {
  /** 初始 Markdown。 */
  markdown?: string;
  /** 文档上下文。 */
  context: DocumentContext;
  /** 宿主服务。 */
  services?: EditorServices;
  /** 是否只读。 */
  readonly?: boolean;
  /** 初始模式。 */
  initialMode?: EditorMode;
  /** 外观主题，默认 Material。 */
  theme?: EditorTheme;
  /** 内容变化回调。 */
  onChange?: (markdown: string) => void;
  /** 错误回调。 */
  onError?: (error: EditorError) => void;
}

/** 已挂载实例。 */
interface MountedRecord {
  app: App;
  markdown: ReturnType<typeof ref<string>>;
  editor: ReturnType<typeof ref<GlfmEditorHandle | null>>;
  handle: MountedGlfmEditor;
}

/** 记录已挂载的实例，保证同一容器只有一个编辑器。 */
const mounted = new WeakMap<HTMLElement, MountedRecord>();

/**
 * 在指定元素上挂载 GLFM 编辑器。
 *
 * 返回句柄用于读取内容、替换内容、切换模式、标记已保存与销毁。
 */
export function mountGlfmEditor(
  element: HTMLElement,
  options: MountGlfmEditorOptions,
): MountedGlfmEditor {
  mounted.get(element)?.handle.destroy();

  const markdown = ref(options.markdown ?? '');
  const editor = ref<GlfmEditorHandle | null>(null);

  const app = createApp({
    render() {
      return h(GlfmEditor, {
        ref: (value: unknown) => {
          editor.value = value as GlfmEditorHandle | null;
        },
        modelValue: markdown.value,
        context: options.context,
        services: options.services,
        readonly: options.readonly ?? false,
        theme: options.theme,
        initialMode: options.initialMode ?? 'wysiwyg',
        'onUpdate:modelValue': (value: string) => {
          markdown.value = value;
          options.onChange?.(value);
        },
        onError: (error: EditorError) => options.onError?.(error),
      });
    },
  });

  app.mount(element);

  const handle: MountedGlfmEditor = {
    getMarkdown: () => markdown.value,
    async setMarkdown(value: string) {
      markdown.value = value;
      // 等待 Vue 把新值传给组件并触发重新导入。
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    },
    markSaved(value: string) {
      editor.value?.markSaved(value);
    },
    async setMode(mode: EditorMode) {
      return (await editor.value?.setMode(mode)) ?? false;
    },
    destroy() {
      app.unmount();
      mounted.delete(element);
      element.replaceChildren();
    },
  };

  mounted.set(element, { app, markdown, editor, handle });
  return handle;
}

/** 查找并挂载页面上所有符合选择器且尚未挂载的容器。 */
export function mountAllGlfmEditors(
  selector: string,
  resolve: (element: HTMLElement) => MountGlfmEditorOptions | null,
): MountedGlfmEditor[] {
  const handles: MountedGlfmEditor[] = [];

  document.querySelectorAll<HTMLElement>(selector).forEach((element) => {
    if (mounted.has(element)) return;
    const options = resolve(element);
    if (options) handles.push(mountGlfmEditor(element, options));
  });

  return handles;
}

/** 销毁指定容器上的实例。 */
export function unmountGlfmEditor(element: HTMLElement): void {
  mounted.get(element)?.handle.destroy();
}

export { GlfmEditor };
export type {
  DocumentContext,
  EditorError,
  EditorMode,
  EditorTheme,
  EditorServices,
  MountedGlfmEditor,
};

export { renderMarkdown } from './glfm/render';
