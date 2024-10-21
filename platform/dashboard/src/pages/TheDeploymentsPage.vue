<template>
  <div class="the-deployments-page" style="height: 100%; overflow: hidden;">
    <v-app-bar app dark extended>
      <v-app-bar-nav-icon
        class="d-lg-none"
        @click="$root.showNavigation = !$root.showNavigation"
      ></v-app-bar-nav-icon>
      <v-list-item>
        <v-list-item-avatar color="white">
          <v-icon color="black">mdi-graph</v-icon>
        </v-list-item-avatar>
        <v-list-item-content>
          <v-toolbar-title>Deployments </v-toolbar-title>
          <v-list-item-subtitle>Component instances</v-list-item-subtitle>
        </v-list-item-content>
      </v-list-item>
    </v-app-bar>
    <v-container fluid style="width: 100%; height: 100%;">
      <deployments-list mode="list"></deployments-list>
    </v-container>
  </div>
</template>

<script>
import _ from "lodash";
import DeploymentsList from "@/components/DeploymentsList"

export default {
  name: "TheDeploymentsList",
  components: {
    DeploymentsList,
  },
};
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
</style>