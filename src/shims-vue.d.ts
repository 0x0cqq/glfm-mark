/**
 * Vue 单文件组件的类型声明。
 *
 * `vue-tsc` 能直接解析 `.vue`，此声明只用于让纯 `tsc` 也能通过类型检查。
 */
declare module '*.vue' {
  import type { Component } from 'vue';

  const component: Component;
  export default component;
}
