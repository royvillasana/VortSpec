<script setup lang="ts">
interface Props { label: string }
const props = defineProps<Props>()
const wrong: string = 123
</script>
<template><span>{{ props.label }}{{ wrong }}</span></template>
