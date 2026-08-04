<script lang="ts">
  import type { PageData } from './$types';
  import CleanBadge from '$lib/components/CleanBadge.svelte';
  export let data: PageData;
</script>
<h1>{data.title}</h1>
<CleanBadge label={data.title} />
