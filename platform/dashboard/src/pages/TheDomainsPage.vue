<template>
  <div class="the-domains-page" style="height: 100%; overflow: auto">
    <v-app-bar app dark extended>
      <v-app-bar-nav-icon
        class="d-lg-none"
        @click="$root.showNavigation = !$root.showNavigation"
      ></v-app-bar-nav-icon>
      <v-list-item>
        <v-list-item-avatar color="white">
          <v-icon color="black">mdi-server</v-icon>
        </v-list-item-avatar>
        <v-list-item-content>
          <v-toolbar-title>Domains </v-toolbar-title>
          <v-list-item-subtitle>Clusters, machines, cloud</v-list-item-subtitle>
        </v-list-item-content>
      </v-list-item>
    </v-app-bar>

    <v-container fluid style="width: 100%; height: 100%">
      <domains-list mode="list"></domains-list>
    </v-container>
  </div>
</template>

<script>
import _ from "lodash";
import DomainsList from "@/components/DomainsList";

export default {
  name: "TheDomainsPage",
  components: {
    DomainsList,
  },
};
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
</style>
