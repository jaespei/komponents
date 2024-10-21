<template>
  <v-app style="height: 100%">
    <v-main style="height: 100%">
      <router-view></router-view>
      <v-alert v-model="$root.isError" type="error" dismissible>{{
        $root.errorMsg
      }}</v-alert>
      <v-alert v-model="$root.isSuccess" type="success" dismissible>{{
        $root.successMsg
      }}</v-alert>
      <v-dialog v-model="showProfile" max-width="500">
        <user-profile :user="this.$root.user" @close="showProfile=false"></user-profile>
      </v-dialog>
    </v-main>
  </v-app>
</template>

<script>
export default {
  name: "TheApp",
  components: { 
  },
  data: () => ({
    items: [
      { title: "Dashboard", icon: "mdi-view-dashboard", path: "/dashboard", disabled: true },
      { title: "Components", icon: "mdi-cube", path: "/components", disabled: false },
      { title: "Domains", icon: "mdi-server", path: "/domains", disabled: false },
      { title: "Deployments", icon: "mdi-graph", path: "/deployments", disabled: false },
      { title: "Volumes", icon: "mdi-database", path: "/volumes", disabled: true },      
      { title: "Users", icon: "mdi-account-group", path: "/users", disabled: true },
    ],
    showProfile: false
  }),
  methods: {
    openEditProfile() {
      this.$util.log("[TheApp] openEditProfile()");
      this.showProfile = true;
    },
    logout() {
      this.$util.log("[TheApp] logout()");
      for (let key in this.$root.user) {
        this.$delete(this.$root.user, key);
      }
      localStorage.removeItem("ks-auth");
    },
  }
};
</script>

<style scoped>
.v-alert {
  position: absolute;
  bottom: 0px;
  left: 0px;
  right: 0px;
  margin-bottom: 0px;
}
</style>
