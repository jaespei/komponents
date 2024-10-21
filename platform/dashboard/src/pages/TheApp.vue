<template>
  <v-app v-if="$root.user.id" style="height: 100%">
    <v-navigation-drawer v-model="$root.showNavigation" touchless app>
      <template v-slot:prepend>
        <v-list-item two-line @click="openEditProfile">
          <v-list-item-avatar>
            <img v-if="$root.user.pict" :src="$root.user.pict" />
            <v-avatar v-else color="primary" size="48">
              <span class="white--text text-h5">{{ $root.user.name.charAt(0).toUpperCase()
              }}{{
                $root.user.surname &&
                  $root.user.surname.charAt(0).toUpperCase() ||
                ""
              }}</span>
              </v-avatar>
          </v-list-item-avatar>

          <v-list-item-content>
            <v-list-item-title>{{ $root.user.name }}</v-list-item-title>
            <v-list-item-subtitle>{{ $root.user.email }}</v-list-item-subtitle>
          </v-list-item-content>
          <v-list-item-action>
            <v-btn icon @click.stop="logout">
              <v-icon>mdi-logout-variant</v-icon>
            </v-btn>
          </v-list-item-action>
        </v-list-item>
      </template>

      <v-divider></v-divider>
      <v-list dense nav>
        <v-list-item
          v-for="item in items"
          :key="item.title"
          link
          :disabled="item.disabled"
          :to="item.path"
        >
          <v-list-item-icon>
            <v-icon>{{ item.icon }}</v-icon>
          </v-list-item-icon>
          <v-list-item-content>
            <v-list-item-title>{{ item.title }}</v-list-item-title>
          </v-list-item-content>
        </v-list-item>
      </v-list>
    </v-navigation-drawer>
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
  <v-app v-else>
    <TheLoginPage></TheLoginPage>
  </v-app>
</template>

<script>
import TheLoginPage from "@/pages/TheLoginPage"
import UserProfile from "@/components/UserProfile"

export default {
  name: "TheApp",
  components: { 
    TheLoginPage,
    UserProfile
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
