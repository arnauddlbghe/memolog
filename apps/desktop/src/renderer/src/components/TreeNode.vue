<script setup lang="ts">
import { computed } from 'vue'

import type { TreeEntry } from '@shared/types'

import { useVaultStore } from '../stores/vault'

const props = defineProps<{ entry: TreeEntry; depth: number }>()
const emit = defineEmits<{ open: [path: string]; menu: [entry: TreeEntry, event: MouseEvent] }>()

const vault = useVaultStore()
const expanded = computed(() => vault.isExpanded(props.entry.path))
const children = computed(() => vault.children[props.entry.path] ?? [])
const selected = computed(() => vault.selectedPath === props.entry.path)

function activate(): void {
  if (props.entry.kind === 'folder') void vault.toggleDir(props.entry.path)
  else emit('open', props.entry.path)
}
</script>

<template>
  <li>
    <div
      class="row"
      :class="{ 'row--selected': selected }"
      :style="{ paddingLeft: `${8 + depth * 14}px` }"
      role="treeitem"
      :aria-expanded="entry.kind === 'folder' ? expanded : undefined"
      tabindex="0"
      @click="activate"
      @keydown.enter.prevent="activate"
      @contextmenu.prevent="emit('menu', entry, $event)"
    >
      <span class="glyph" aria-hidden="true">
        {{ entry.kind === 'folder' ? (expanded ? '▾' : '▸') : '·' }}
      </span>
      <span class="label">{{ entry.title }}</span>
    </div>

    <ul v-if="entry.kind === 'folder' && expanded" role="group">
      <TreeNode
        v-for="child in children"
        :key="child.path"
        :entry="child"
        :depth="depth + 1"
        @open="emit('open', $event)"
        @menu="(item, event) => emit('menu', item, event)"
      />
    </ul>
  </li>
</template>

<style scoped>
ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px 3px 0;
  border-radius: var(--radius-sm);
  cursor: default;
  user-select: none;
}

.row:hover {
  background: var(--bg-sunken);
}

.row--selected {
  background: var(--accent-soft);
  color: var(--text);
}

.glyph {
  width: 10px;
  color: var(--text-faint);
  font-size: 10px;
}

.label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
