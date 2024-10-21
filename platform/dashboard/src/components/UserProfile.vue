<template>
  <v-card tile :max-width="width || 500" :min-width="width || 500">
    <div style="background-color: darkblue; height: 200px"></div>
    <!--v-img
      height="100%"
      src="https://cdn.vuetifyjs.com/images/cards/server-room.jpg"
    ></v-img-->
    
      <v-avatar size="100" style="position: absolute; top: 150px; left: 20px;" color="white">
        <v-icon v-if="!user.pict" color="grey" size="64"
          >mdi-cube-outline</v-icon
        >
        <img v-if="user.pict" :src="user.pict" />
      </v-avatar>
      
    <br><br>
    <v-list-item color="rgba(0, 0, 0, .4)">
      <v-list-item-content>
        <v-list-item-title class="title"
          >{{ user.name }} {{ user.surname }}</v-list-item-title
        >
        <v-list-item-subtitle>{{ user.email }}</v-list-item-subtitle>
      </v-list-item-content>
    </v-list-item>
    <v-card-actions>
      <v-spacer></v-spacer>
      <v-btn v-if="myMode == 'write'" color="primary" text @click="reveal = true"
        >Update</v-btn
      >
      <v-btn color="primary" text @click="close">Close</v-btn>
    </v-card-actions>

    <v-expand-transition>
      <v-card
        v-if="reveal"
        class="transition-fast-in-fast-out v-card--reveal"
        style="height: 100%"
      >
        <v-card-text class="pb-0">
          <v-form ref="profileForm" v-model="valid">
            <v-row>
              <v-col cols="6" align="end">
                <input
                  id="filePicture"
                  @change="savePicture"
                  type="file"
                  accept="image/*"
                  style="display: none"
                />
                <v-avatar size="100" color="white">
                  <v-icon v-if="!updated.pict" color="grey" size="64"
                    >mdi-account-outline</v-icon
                  >
                  <img v-if="updated.pict" :src="updated.pict" />
                </v-avatar>
              </v-col>
              <v-col cols="6" align-self="center">
                <v-btn plain @click="openPicture">Set picture</v-btn>
              </v-col>
              <v-col cols="12" sm="6" md="6">
                <v-text-field
                  v-model="updated.name"
                  :rules="[rules.required]"
                  label="First Name"
                  maxlength="20"
                  required
                ></v-text-field>
              </v-col>
              <v-col cols="12" sm="6" md="6">
                <v-text-field
                  v-model="updated.surname"
                  :rules="[rules.required]"
                  label="Last Name"
                  maxlength="20"
                  required
                ></v-text-field>
              </v-col>
              <v-col cols="12" sm="6" md="6">
                <v-text-field
                  v-model="updated.password"
                  :append-icon="show1 ? 'mdi-eye' : 'mdi-eye-off'"
                  :rules="[rules.required, rules.min]"
                  :type="show1 ? 'text' : 'password'"
                  label="Password"
                  hint="At least 4 characters"
                  counter
                  @click:append="show1 = !show1"
                ></v-text-field>
              </v-col>
              <v-col cols="12" sm="6" md="6">
                <v-text-field
                  block
                  v-model="updated.repassword"
                  :append-icon="show1 ? 'mdi-eye' : 'mdi-eye-off'"
                  :rules="[rules.required, passwordMatch]"
                  :type="show1 ? 'text' : 'password'"
                  label="Confirm Password"
                  counter
                  @click:append="show1 = !show1"
                ></v-text-field>
              </v-col>
            </v-row>
          </v-form>
        </v-card-text>
        <v-card-actions class="pt-0">
          <v-spacer></v-spacer>
          <v-btn text color="primary" @click="cancel"> Cancel </v-btn>
          <v-btn text color="primary" @click="accept"> Accept </v-btn>
        </v-card-actions>
      </v-card>
    </v-expand-transition>
  </v-card>
</template>
<script>
import _ from "lodash";

export default {
  name: "UserProfile",
  props: {
    user: {
      type: Object,
      required: true,
    },
    mode: {
      type: String
    },
    width: {
      type: Number
    }
  },
  data() {
    return {
      updated: {},
      reveal: false,
      valid: true,
      show1: false,
      rules: {
        required: (value) => !!value || "Required",
        min: (v) => (v && v.length >= 4) || "Min 4 characters",
      },
    };
  },
  computed: {
    myMode() {
      if (this.mode) return this.mode;
      console.log(this.user.perms);
      let perms = _.filter(this.user.perms, (perm) =>
        this.$root.user.roles.includes(perm.role)
      );
      console.log(perms);
      if (_.find(perms, (perm) => perm.type == "write" || perm.type == "owner"))
        return "write";
      else return "read";
    },
    passwordMatch() {
      return (
        this.user.password === this.user.repassword || "Password must match"
      );
    },
  },
  created() {
    this.refresh();
  },

  /*updated() {
    this.$util.log(
      `[UserProfile] updated(${JSON.stringify(this.component)})`
    );
    if (!this.updated.id) {
      for (let key in this.component)
        this.$set(this.updated, key, this.component[key]);
    }
  },*/
  methods: {
    refresh() {
      for (let key in this.user) {
        this.$set(this.updated, key, this.user[key]);
      }
    },
    openPicture() {
      this.$util.log(`openPicture()`);
      document.getElementById("filePicture").click();
    },
    savePicture() {
      var element = document.getElementById("filePicture");
      var file = element.files[0];
      var reader = new FileReader();
      reader.onloadend = () => {
        this.$set(this.updated, "pict", reader.result);
        //this.$emit("change", { id: this.user.id, pict: this.updated.pict });
      };
      reader.readAsDataURL(file);
      //reader.readAsText(file);
    },
    /*changeUser(prop) {
      this.$util.log(`changeUser(${prop})`);
      let event = {};
      event[prop] = this.updated[prop];
      this.$emit("change", event);
    },*/
    async accept() {
      this.reveal = false;
      try {
        this.loading = true;
        let user = await this.$model.updateUser(
          this.$root.user.token,
          this.user.id,
          this.updated
        );
        for (let key in user) {
          this.$set(this.$root.user, key, user[key]);
        }
      } catch (err) {
        this.$root.error(err, "Unable to update user", 5000);
      } finally {
        this.loading = false;
      }
    },
    cancel() {
      this.reveal = false;
      this.refresh();
    },
    close() {
      this.$emit("close");
    }
  },
};
</script>
<style scoped>
.v-card--reveal {
  bottom: 0;
  opacity: 1 !important;
  position: absolute;
  width: 100%;
}
</style>