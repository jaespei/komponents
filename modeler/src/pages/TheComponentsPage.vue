<template>
  <div class="the-components-page" style="height: 100%; overflow: hidden;">
    <v-app-bar app dark extended>
      <v-app-bar-nav-icon
        class="d-lg-none"
        @click="$root.showNavigation = !$root.showNavigation"
      ></v-app-bar-nav-icon>
      <v-list-item>
        <v-list-item-avatar color="white">
          <v-icon color="black">mdi-cube</v-icon>
        </v-list-item-avatar>
        <v-list-item-content>
          <v-toolbar-title v-if="appMode == 'modeler'">The Modeler </v-toolbar-title>
          <v-toolbar-title v-else>Components</v-toolbar-title>
          <v-list-item-subtitle v-if="appMode == 'modeler'">The tool for editing and storing your component models</v-list-item-subtitle>
          <v-list-item-subtitle v-else>Applications, services</v-list-item-subtitle>
        </v-list-item-content>
      </v-list-item>
    </v-app-bar>
    <v-container fluid style="width: 100%; height: 100%;">
      <components-list mode="list"></components-list>
    </v-container>
  </div>
</template>

<script>
import _ from "lodash";
import ComponentsList from "../components/ComponentsList"

export default {
  name: "TheComponentsPage",
  components: {
    ComponentsList,
  },
  data() {
    return {
      appMode: this.$appMode
    }
  }
};
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
</style>
