<script setup lang="ts">
import { Analytics } from '@vercel/analytics/vue';
import EnterpriseGame from './components/EnterpriseGame.vue'
</script>

<template>
  <Analytics />
  <EnterpriseGame />
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
</style>
