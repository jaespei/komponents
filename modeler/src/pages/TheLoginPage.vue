<template>
  <div class="the-login-page">
    <v-dialog v-model="dialog" persistent max-width="600px" min-width="360px">
      <div>
        <v-overlay :value="loading">
          <v-progress-circular indeterminate size="64"></v-progress-circular>
        </v-overlay>
        <v-tabs
          v-model="tab"
          show-arrows
          icons-and-text
          dark
          grow
          @change="reset"
        >
          <v-tabs-slider color="primary"></v-tabs-slider>
          <v-tab v-for="(item, i) in tabs" :key="i">
            <v-icon large>{{ item.icon }}</v-icon>
            <div class="caption py-1">{{ item.name }}</div>
          </v-tab>
          <v-tab-item>
            <v-card class="px-4">
              <v-card-text>
                <v-form ref="loginForm" v-model="valid">
                  <v-row>
                    <v-col cols="12">
                      <v-text-field
                        v-model="cred.email"
                        :rules="[rules.required, rules.email]"
                        label="E-mail"
                        required
                      ></v-text-field>
                    </v-col>
                    <v-col cols="12">
                      <v-text-field
                        v-model="cred.password"
                        :append-icon="show1 ? 'mdi-eye' : 'mdi-eye-off'"
                        :rules="[rules.required, rules.min]"
                        :type="show1 ? 'text' : 'password'"
                        label="Password"
                        hint="At least 4 characters"
                        counter
                        @click:append="show1 = !show1"
                      ></v-text-field>
                    </v-col>
                    <v-col class="d-flex" cols="12" sm="6" xsm="12"></v-col>
                    <v-spacer></v-spacer>
                    <v-col class="d-flex" cols="12" sm="3" xsm="12" align-end>
                      <v-btn
                        x-large
                        block
                        :disabled="!valid"
                        color="primary"
                        @click="login"
                      >
                        Login
                      </v-btn>
                    </v-col>
                  </v-row>
                </v-form>
              </v-card-text>
            </v-card>
            <v-alert v-if="error" type="error" dense>{{ error }}</v-alert>
            <v-alert v-if="success" type="success" dense>{{ success }}</v-alert>
          </v-tab-item>
          <v-tab-item>
            <v-card class="px-4">
              <v-card-text>
                <v-form ref="registerForm" v-model="valid">
                  <v-row>
                    <v-col cols="12" sm="6" md="6">
                      <v-text-field
                        v-model="user.name"
                        :rules="[rules.required]"
                        label="First Name"
                        maxlength="20"
                        required
                      ></v-text-field>
                    </v-col>
                    <v-col cols="12" sm="6" md="6">
                      <v-text-field
                        v-model="user.surname"
                        :rules="[rules.required]"
                        label="Last Name"
                        maxlength="20"
                        required
                      ></v-text-field>
                    </v-col>
                    <v-col cols="12">
                      <v-text-field
                        v-model="user.email"
                        :rules="[rules.required, rules.email]"
                        label="E-mail"
                        required
                      ></v-text-field>
                    </v-col>
                    <v-col cols="12">
                      <v-text-field
                        v-model="user.password"
                        :append-icon="show1 ? 'mdi-eye' : 'mdi-eye-off'"
                        :rules="[rules.required, rules.min]"
                        :type="show1 ? 'text' : 'password'"
                        label="Password"
                        hint="At least 4 characters"
                        counter
                        @click:append="show1 = !show1"
                      ></v-text-field>
                    </v-col>
                    <v-col cols="12">
                      <v-text-field
                        block
                        v-model="user.repassword"
                        :append-icon="show1 ? 'mdi-eye' : 'mdi-eye-off'"
                        :rules="[rules.required, passwordMatch]"
                        :type="show1 ? 'text' : 'password'"
                        label="Confirm Password"
                        counter
                        @click:append="show1 = !show1"
                      ></v-text-field>
                    </v-col>
                    <v-spacer></v-spacer>
                    <v-col class="d-flex ml-auto" cols="12" sm="3" xsm="12">
                      <v-btn
                        x-large
                        block
                        :disabled="!valid"
                        color="primary"
                        @click="register"
                        >Register</v-btn
                      >
                    </v-col>
                  </v-row>
                </v-form>
              </v-card-text>
            </v-card>
          </v-tab-item>
        </v-tabs>
      </div>
    </v-dialog>
  </div>
</template>

<script>
export default {
  name: "TheLoginPage",
  computed: {
    passwordMatch() {
        return this.user.password === this.user.repassword || "Password must match";
      },
  },
  data: () => ({
    dialog: true,
    tab: 0,
    tabs: [
      { name: "Login", icon: "mdi-account" },
      { name: "Register", icon: "mdi-account-plus-outline" },
    ],
    valid: false,
    user: {
      name: "",
      surname: "",
      email: "",
      password: "",
      repassword: "",
      pict: "",
    },
    cred: {
      email: "",
      password: "",
    },
    error: "",
    success: "",
    loading: false,
    /*firstName: "",
    lastName: "",
    email: "",
    password: "",
    verify: "",
    loginPassword: "",
    loginEmail: "",
    emailRules: [
      (v) => !!v || "Required",
      (v) => /.+@.+\..+/.test(v) || "Unsupported email format",
    ],*/
    show1: false,
    rules: {
      email:(v) => /.+@.+\..+/.test(v) || "Unsupported email format",
      required: (value) => !!value || "Required",
      min: (v) => (v && v.length >= 4) || "Min 4 characters"
    },
  }),
  methods: {
    async login() {
      this.$util.log(`login()`);
      try {
        this.loading = true;
        let { token, user } = await this.$model.login(this.cred);
        this.$root.user.token = token;
        for (let key in user) {
          this.$set(this.$root.user, key, user[key]);
        }
        this.$set(this.$root.user, "roles", user.groups.concat(user.id));
        localStorage.setItem("ks-auth", JSON.stringify(this.$root.user));
      } catch (err) {
        this.$util.log(`ERROR, ${err.stack}`);
        this.error = "Unable to login";
      } finally {
        this.loading = false;
      }
    },
    async register() {
      this.$util.log(`register()`);
      try {
        this.loading = true;
        let user = await this.$model.addUser(this.user);
        this.success = "User created syccessfully";
      } catch (err) {
        this.$util.log(`ERROR, ${err.stack}`);
        this.error = "Unable to create user";
      } finally {
        this.loading = false;
      }
      this.tab = 0;
    },
    reset() {
      if (this.$refs.loginForm) this.$refs.loginForm.reset();
      if (this.$refs.registerForm) this.$refs.registerForm.reset();
      this.error = "";
      this.success = "";
    },
  },
};
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
</style>
