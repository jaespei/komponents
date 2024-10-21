<template>
  <v-row>
    <v-col cols="12">
      <v-text-field
        label="Gateway"
        dense
        readonly
        outlined
        v-model="domain.gateway"
      ></v-text-field>
    </v-col>
    <v-col cols="12">
      <v-text-field
        label="Ingress"
        dense
        readonly
        outlined
        v-model="domain.ingress"
      ></v-text-field>
    </v-col>
    <v-col cols="12">
      <v-text-field
        label="Secure ingress"
        dense
        readonly
        outlined
        v-model="domain.sIngress"
      ></v-text-field>
    </v-col>
  </v-row>
</template>
<script>
export default {
  name: "DomainConnectivity",
  props: {
    domain: {
      type: Object,
      required: true,
    },
  },
  data() {
    return {};
  },
  methods: {},
};
</script>
<style scoped>
</style>