<script setup lang="ts">
interface Props { label: string; count?: number }
const props = withDefaults(defineProps<Props>(), { count: 0 })
</script>
<template>
  <span class="badge">{{ props.label }}: {{ props.count }}</span>
</template>
