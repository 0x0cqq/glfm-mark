<!-- 统一线条图标，继承按钮颜色和尺寸。 -->
<script setup lang="ts">
defineProps<{ name: string }>();
const paths: Record<string, string> = {
  bold: 'M6 4h7a4 4 0 0 1 0 8H6m0-8v16h8a4 4 0 0 0 0-8H6',
  italic: 'M10 4h9M5 20h9M15 4 9 20',
  strike: 'M17 6c-2-3-10-3-10 1 0 3 10 3 10 7 0 5-9 6-12 2M3 11h18',
  code: 'm8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18',
  link: 'm10 13 4-4M8 15l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 4a4 4 0 0 1 6 0l5 5a4 4 0 0 1-6 6l-1-1',
  image: 'M3 3h18v18H3zM3 16l6-6 12 11M15 7h.01',
  bullet: 'M9 6h12M9 12h12M9 18h12M3 6h.01M3 12h.01M3 18h.01',
  ordered: 'M10 6h11M10 12h11M10 18h11M3 4h1v5M2 13c4-2 5 1 2 3l-2 3h4',
  task: 'M10 6h11M10 12h11M10 18h11M2 5l2 2 3-4M2 11h4v4H2z',
  quote: 'M3 5h7v8H3v-8m7 8c0 4-3 6-5 6M14 5h7v8h-7v-8m7 8c0 4-3 6-5 6',
  undo: 'M9 5 3 10l6 5M3 10h11a6 6 0 0 1 0 12',
  redo: 'm15 5 6 5-6 5m6-5H10a6 6 0 0 0 0 12',
  plus: 'M12 4v16M4 12h16',
  chevron: 'm7 10 5 5 5-5',
  outline: 'M9 5h12M9 12h12M9 19h12M3 4v16',
  focus: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',
  keyboard: 'M2 5h20v14H2zM6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M10 13h.01M14 13h.01M18 13h.01M7 16h10',
  clear: 'm4 16 9-12 7 6-9 12H8l-4-6m4-5 8 6M14 21h8',
};
</script>
<template>
  <svg class="glfm-editor__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths[name] ?? paths.plus" /></svg>
</template>
