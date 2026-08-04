<script setup lang="ts">
import { formatLabel } from '../utils/format'
const title = formatLabel('  hello  ')
</script>
<template>
  <div>
    <h1>{{ title }}</h1>
    <CleanBadge label="auto-imported with no import statement" :count="3" />
  </div>
</template>
