import Vue from 'vue'
import vuetify from './plugins/vuetify'
// Tiptap
import tiptap from './plugins/tiptap'
// Cytoscape
import cytoscape from "./plugins/cytoscape"

//import jointjs from './plugins/jointjs';
import router from './router'
//import model from './libs/model'
import api from "./libs/api"
import util from './libs/util'
import App from './App.vue'

Vue.config.productionTip = false

//Vue.prototype.$model = model;
Vue.prototype.$model = api;
Vue.prototype.$util = util;
Vue.prototype.$appMode = "dashboard";
//Vue.use(jointjs);

// Load current authentication
let auth = localStorage.getItem("ks-auth");
auth = auth && JSON.parse(auth) || {};

window.Vue = Vue;
window.app = new Vue({
    vuetify,
    router,
    data: {
        showNavigation: null, // show navigation drawer
        user: auth,
        isError: false,
        errorMsg: "rr",
        isSuccess: false,
        successMsg: ""
    },
    methods: {
        error(err, msg, timeout) {
            if (typeof err === "string") {
                timeout = msg;
                msg = err;
                err = {};
            }
            if (!err) this.isError = false;
            else if (err.type == "AuthenticationError") {
                for (let key in this.user) {
                    this.$delete(this.user, key);
                }
            } else if (msg) {
                this.isSuccess = false;
                this.isError = true;
                this.errorMsg = msg + " " + err.stack;
                if (timeout) setTimeout(() => this.isError = false, timeout);
            }

        },
        success(msg, timeout) {
            if (!msg) {
                this.isSuccess = false;
            } else {
                this.isError = false;
                this.isSuccess = true;
                this.successMsg = msg;
                if (timeout) setTimeout(() => this.isSuccess = false, timeout);
            }
        }
    },
    render: h => h(App)
}).$mount('#app')