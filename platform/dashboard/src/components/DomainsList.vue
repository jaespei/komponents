<template>
  <div class="domains-list" style="height: 100%; overflow-y: auto">
    <v-container fluid>
      <v-row no-gutters>
        <v-col cols="12">
          <v-toolbar flat dense>
            <v-text-field
              v-model="filterText"
              prepend-icon="mdi-magnify"
              label="Search"
              clearable
              class="mx-4"
              @change="appendFilter(filterText)"
            ></v-text-field>
            <v-spacer></v-spacer>
            <v-btn
              v-if="mode == 'list'"
              color="primary"
              dark
              @click="openAddDomain"
              >Add domain</v-btn
            >
          </v-toolbar>
        </v-col>
        <v-col cols="12">
          <v-row>
            <v-col cols="auto">
              <v-chip-group
                column
                multiple
                mandatory
                v-model="selectedFixedFilters"
                @change="refresh"
              >
                <v-chip
                  filter
                  v-for="f in fixedFilters"
                  :key="f.label"
                  :value="f.value"
                >
                  {{ f.label }}
                </v-chip>
              </v-chip-group>
            </v-col>
            <v-col cols="auto">
              <v-chip-group column multiple v-model="selectedFilters">
                <v-chip
                  filter
                  close
                  v-for="f in filters"
                  :key="f.label"
                  :value="f.value"
                  @click:close="removeFilter(f)"
                  @change="refresh"
                >
                  {{ f.label }}
                </v-chip>
              </v-chip-group>
            </v-col>
          </v-row>
        </v-col>
      </v-row>

      <v-data-table
        :headers="myHeaders"
        :items="domains"
        :items-per-page="5"
        :search="filterText"
        :single-select="mode == 'select'"
        :show-select="mode == 'select' || mode == 'multiselect'"
        @click:row="showDomain"
        @item-selected="selectDomain"
        @click.native="clickDomain"
        @toggle-select-all="selectDomain"
      >
        <template v-slot:item.owner="{ item }">
          <v-chip
            v-if="users[item.owner]"
            pill
            color="lightgrey"
            @click.stop="selectUser($event, users[item.owner])"
          >
            <v-avatar v-if="users[item.owner].pict" left>
              <img :src="users[item.owner].pict" />
            </v-avatar>
            <span>{{ users[item.owner].name }}</span>
          </v-chip>
          <v-progress-circular v-else indeterminate></v-progress-circular>
        </template>
        <template v-slot:item.state="{ item }">
          <v-chip v-if="item.state == 'ready'" color="green" dark>
            {{ item.state }}
          </v-chip>
          <v-chip v-if="item.state == 'destroy'" color="red" dark>
            {{ item.state }}
          </v-chip>
          <v-progress-circular
            v-if="item.state == 'ini'"
            indeterminate
          ></v-progress-circular>
        </template>

        <template v-if="mode == 'list'" v-slot:item.actions="{ item }">
          <v-btn v-if="item.perm" icon outlined>
            <v-icon @click.stop="openEditDomain(item)">
              {{ item.perm == "read" ? "mdi-magnify" : "mdi-pencil" }}
            </v-icon>
          </v-btn>&nbsp;
          <v-btn v-if="item.perm == 'owner'" icon outlined>
            <v-icon @click.stop="openRemoveDomain(item)">mdi-delete</v-icon>
          </v-btn>
        </template>
      </v-data-table>
    </v-container>

    <v-overlay :value="loading">
      <v-progress-circular indeterminate size="64"></v-progress-circular>
    </v-overlay>

    <v-menu
      v-model="showUserProfile"
      :close-on-content-click="false"
      :position-x="userProfilePosition.x"
      :position-y="userProfilePosition.y"
      absolute
      offset-y
    >
      <user-profile
        :user="selectedUser"
        :width="300"
        @close="showUserProfile = false"
      ></user-profile>
    </v-menu>

    <v-menu
      v-model="showDomainDetails"
      :close-on-content-click="false"
      :position-x="domainDetailsPosition.x"
      :position-y="domainDetailsPosition.y"
      absolute
      offset-y
    >
      <v-card>
        <v-card-text>
          <domain-basic
            mode="read"
            :domain="selectedDomain"
          ></domain-basic>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="primary" text @click="showDomainDetails=false">Close</v-btn>
        </v-card-actions>
      </v-card>
    </v-menu>

    <v-dialog v-model="addingDomain" persistent scrollable max-width="600px">
      <v-card>
        <v-card-title>
          <span class="text-h5">Add Domain</span>
        </v-card-title>
        <v-card-text>
          <v-container>
            <v-form ref="addDomainForm" v-model="addDomainValid">
              <v-row>
                <v-col cols="12">
                  <v-select
                    :items="domainTypes"
                    label="Type*"
                    :rules="[rules.required]"
                    required
                    v-model="addDomain.type"
                    @change="resetAddDomain(false)"
                  ></v-select>
                </v-col>
                <v-col cols="12">
                  <v-text-field
                    label="Title*"
                    :rules="[rules.required]"
                    required
                    v-model="addDomain.title"
                  ></v-text-field>
                </v-col>
              </v-row>

              <!---------------- kind/k8s  -------------->
              <v-row v-if="addDomain.type == 'kind/k8s'">
                <v-col cols="12">
                  <v-text-field
                    clearable
                    label="Host address*"
                    :rules="[rules.required, rules.address]"
                    hint="Host where the cluster will be created"
                    required
                    v-model="addDomain.hostAddr"
                  ></v-text-field>
                </v-col>
                <v-col cols="12" md="6">
                  <v-text-field
                    clearable
                    label="SSH user*"
                    :rules="[rules.required]"
                    required
                    v-model="addDomain.hostUser"
                  ></v-text-field>
                </v-col>
                <v-col cols="12" md="6">
                  <v-text-field
                    clearable
                    type="password"
                    label="SSH password"
                    :rules="[passwordOrKey]"
                    v-model="addDomain.hostPassword"
                  ></v-text-field>
                </v-col>
                <v-col cols="12" md="4" align-self="center" justify="center">
                  <v-btn small @click="openPrivateKey"
                    >Set SSH private key</v-btn
                  >
                  <input
                    id="filePrivateKey"
                    @change="savePrivateKey"
                    type="file"
                    style="display: none"
                  />
                </v-col>
                <v-col v-if="addDomain.hostPrivateKey" cols="12" md="8">
                  <v-textarea
                    outlined
                    label="Private key"
                    :value="addDomain.hostPrivateKey"
                    no-resize
                    rows="2"
                  ></v-textarea>
                </v-col>
              </v-row>

              <!---------------- external/k8s  -------------->
              <v-row v-if="addDomain.type == 'external/k8s'">
                <v-col cols="12" md="4" align-self="center" justify="end">
                  <v-btn small @click="openKubeConfig">Set Kubeconfig*</v-btn>
                  <input
                    id="fileKubeConfig"
                    @change="saveKubeConfig"
                    type="file"
                    style="display: none"
                  />
                </v-col>
                <v-col cols="12" md="8">
                  <v-textarea
                    outlined
                    label="Kubeconfig"
                    :rules="[rules.required]"
                    :value="addDomain.kubeconfig"
                    no-resize
                    rows="2"
                  ></v-textarea>
                </v-col>
              </v-row>
            </v-form>
          </v-container>
          <small>*Required field</small>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="blue darken-1" text @click="cancelAddDomain">
            Cancel
          </v-btn>
          <v-btn
            :disabled="!addDomainValid"
            color="blue darken-1"
            text
            @click="acceptAddDomain"
          >
            Accept
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    <v-dialog v-model="confirmRemove" max-width="300">
      <v-card>
        <v-card-title class="text-h5"> Remove </v-card-title>
        <v-card-text>
          <p>Are you sure you want to remove the domain?</p>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="primary" text @click="confirmRemove = false">
            No
          </v-btn>
          <v-btn color="primary" text @click="acceptRemoveDomain"> Yes </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script>
import _ from "lodash";
import UserProfile from "@/components/UserProfile";
import DomainBasic from "@/components/DomainBasic"

export default {
  name: "DomainsList",
  components: {
    UserProfile,
    DomainBasic
  },
  props: {
    mode: {
      type: String,
      default: "list",
    },
  },
  data() {
    return {
      fixedFilters: [
        /*{ label: "Composite", value: "type=composite" },
        { label: "Basic", value: "type=basic" },*/
      ],
      selectedFixedFilters: [
        /*"type=composite", "type=basic"*/
      ],
      filters: [],
      selectedFilters: [],
      filterText: "",
      headers: [
        {
          text: "TITLE",
          align: "center",
          sortable: true,
          value: "title",
        },
        {
          text: "TYPE",
          align: "center",
          sortable: true,
          value: "type",
        },
        {
          text: "RUNTIMES",
          align: "center",
          sortable: true,
          value: "runtimes",
        },
        {
          text: "OWNER",
          align: "center",
          sortable: true,
          value: "owner",
        },
        {
          text: "STATE",
          align: "center",
          sortable: true,
          value: "state",
        },
        {
          text: "ACTIONS",
          align: "center",
          sortable: false,
          value: "actions",
        },
      ],
      domains: [],
      loading: false,
      addingDomain: false,
      domainTypes: [
        { text: "Kubernetes in Kind", value: "kind/k8s", disabled: false },
        { text: "External Kubernetes", value: "external/k8s", disabled: false },
        {
          text: "Google Kubernetes Engine - GKE",
          value: "gke",
          disabled: true,
        },
        {
          text: "Amazon Elastic Container Service for Kubernetes - EKS",
          value: "eks",
          disabled: true,
        },
        { text: "Swarm Cluster", value: "swarm", disabled: true },
        { text: "Docker Machine", value: "docker", disabled: true },
        {
          text: "Google Kubernetes Engine - GKE",
          value: "gke",
          disabled: true,
        },
      ],
      addDomain: {
        title: "",
        type: "",
        hostAddr: "",
        hostUser: "",
        hostPassword: "",
        hostPrivateKey: "",
        kubeconfig: "",
      },
      rules: {
        required: (value) => !!value || "Required.",
        address: (v) => /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(v),
        //address: (v) => /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d/.test(v),
      },
      addDomainValid: false,
      pending: [],
      users: {},
      showUserProfile: false,
      userProfilePosition: { x: 0, y: 0 },
      selectedUser: "",
      confirmRemove: false,
      selectedDomain: undefined,
      selectedDomains: [],
      showDomainDetails: false,
      domainDetailsPosition: { x: 0, y: 0 },
    };
  },
  computed: {
    query() {
      let query = {};
      for (let f of this.selectedFixedFilters) {
        let fields = f.split("=");
        console.log(fields);
        if (query[fields[0]] && Array.isArray(query[fields[0]]))
          query[fields[0]].push(fields[1]);
        else if (query[fields[0]])
          query[fields[0]] = [query[fields[0]], fields[1]];
        else query[fields[0]] = fields[1];
      }
      for (let f of this.selectedFilters) {
        let fields = f.split("=");
        if (query[fields[0]] && Array.isArray(query[fields[0]]))
          query[fields[0]].push(fields[1]);
        else if (query[fields[0]])
          query[fields[0]] = [query[fields[0]], fields[1]];
        else query[fields[0]] = fields[1];
      }
      for (let key in query) {
        query[key] = _.isArray(query[key]) ? { $in: query[key] } : query[key];
      }
      this.log(`query() = ${JSON.stringify(query)}`);
      return query;
    },
    passwordOrKey() {
      if (this.addDomain.hostPassword) return true;
      if (this.addDomain.hostPrivateKey) return true;
      return "Either password or key must be set";
    },
    myHeaders() {
      if (this.mode == "list") return this.headers;
      else return _.filter(this.headers, (header) => header.value != "actions");
    },
  },
  created() {
    window.page = this;
    this.refresh();
  },
  destroyed() {
    _.each(this.pending, (op) => (op.stop = true));
  },
  methods: {
    log(msg) {
      //console.log(`[DomainsList] ${msg}`);
    },
    async refresh() {
      this.log("refresh()");
      this.loading = true;
      try {
        let result = await this.$model.listDomains(this.$root.user.token);
        this.domains.splice(0, this.domains.length);
        _.each(result, async (domain) => {
          this.domains.push(domain);
          domain.perm = this.perm(domain);

          let label = _.find(domain.labels, (label) => {
            if (label.startsWith("perm=")) {
              let [name, perm] = label.split("=");
              let [role, right] = perm.split(":");
              if (right == "o" && role != 0) return true;
            }
            return false;
          });
          let [name, perm] = label.split("=");
          let [role, right] = perm.split(":");
          domain.owner = role;
          if (!this.users[domain.owner]) {
            let [user] = await this.$model.listUsers(this.$root.user.token, {
              id: domain.owner,
            });
            if (user) this.$set(this.users, domain.owner, user);
          }
        });

        //Array.prototype.push.apply(this.domains, result);
      } catch (err) {
        this.$root.error(err, "Unable to obtain domains", 5000);
      } finally {
        this.loading = false;
      }
      //for (let i = 0; i < 100; i++) this.domains.push({title: "domain " + i, type: "caca", runtimes: ["docker", "pepe"], state: "destroy"})
    },
    openAddDomain() {
      this.log("openAddDomain()");
      this.addingDomain = true;
    },
    cancelAddDomain() {
      this.log("cancelAddDomain()");
      this.addingDomain = false;
      this.resetAddDomain(true);
    },
    async acceptAddDomain() {
      this.log("addDomain()");

      // 1. Launch transaction
      this.addingDomain = false;
      this.loading = true;

      let txId, op;
      try {
        txId = await this.$model.addDomain(
          this.$root.user.token,
          this.addDomain
        );

        op = {
          id: Date.now(),
          domain: _.clone(this.addDomain),
          stop: false,
        };
        op.domain.state = "ini";
        op.domain.runtimes = [];

        this.pending.push(op);
        this.domains.push(op.domain);

        this.$root.success("The domain is being added", 5000);
      } catch (err) {
        this.$root.error(err, "Unable to add domain", 5000);
        return;
      } finally {
        this.loading = false;
        this.resetAddDomain(true);
      }

      // 2. Wait for pending op
      try {
        let result = await this.$util.loop(
          async () => {
            if (op.stop) return true;
            let tx = await this.$model.findTransactionById(
              this.$root.user.token,
              txId
            );
            if (tx.state == "Completed") {
              [result] = await this.$model.listDomains(this.$root.user.token, {
                id: tx.target,
              });
              return result;
            } else if (tx.state == "Aborted") {
              throw new Error(tx.err);
            }
          },
          {
            timeout: Infinity,
          }
        );
        if (!_.isBoolean(result)) this.refresh();
      } catch (err) {
        this.$root.error(err, `The domain ${op.domain.title} was not added`);
      }
    },
    openPrivateKey(event) {
      document.getElementById("filePrivateKey").click();
    },
    savePrivateKey() {
      var element = document.getElementById("filePrivateKey");
      var file = element.files[0];
      var reader = new FileReader();
      reader.onloadend = () => {
        this.addDomain.hostPrivateKey = reader.result;
        console.log(this.addDomain.hostPrivateKey);
      };
      //reader.readAsDataURL(file);
      reader.readAsText(file);
    },
    openKubeConfig(event) {
      document.getElementById("fileKubeConfig").click();
    },
    saveKubeConfig() {
      var element = document.getElementById("fileKubeConfig");
      var file = element.files[0];
      var reader = new FileReader();
      reader.onloadend = () => {
        this.addDomain.kubeconfig = reader.result;
        console.log(this.addDomain.kubeconfig);
      };
      //reader.readAsDataURL(file);
      reader.readAsText(file);
    },
    resetAddDomain(all) {
      if (all) {
        if (this.$refs.addDomainForm) this.$refs.addDomainForm.reset();
        this.addDomain.title = "";
        this.addDomain.type = "";
      }
      this.addDomain.hostAddr = "127.0.0.1";
      this.addDomain.hostUser = "";
      this.addDomain.hostPassword = "";
      this.addDomain.hostPrivateKey = "";
      this.addDomain.kubeconfig = "";
    },
    openEditDomain(domain) {
      this.log("openEditDomain()");
      if (domain.state == "ready") this.$router.push(`/domains/${domain.id}`);
      else this.$root.error("Unable to edit non-ready domain", 2000);
    },
    openRemoveDomain(domain) {
      this.log("openRemoveDomain()");
      this.selectedDomain = domain;
      this.confirmRemove = true;
    },
    perm(domain) {
      let type = "read";
      if (!domain.labels) return null;
      for (let label of domain.labels) {
        if (label.startsWith("perm=")) {
          let [name, perm] = label.split("=");
          let [role, right] = perm.split(":");
          if (this.$root.user.roles.includes(role)) {
            if (right == "o") {
              type = "owner";
              break;
            } else if (right == "w" && type != "owner") type = "write";
          }
        }
      }
      return type;
    },
    appendFilter(text) {
      this.log(`appendFilter(${text})`);
      if (text) {
        let filter = null;
        if (text.indexOf("=") != -1) {
          filter = { label: text, value: text };
        } else {
          filter = { label: text, value: `title=${text}` };
        }

        // check whether the filter was added before
        if (!this.filters.find((f) => f.value == filter.value)) {
          // by default the new filter is selected
          this.filters.push(filter);
          this.selectedFilters.push(filter.value);
          //this.computeFiltersHeight();
        }
        this.filterText = "";
        this.refresh();
      }
    },
    removeFilter(filter) {
      this.log(`removeFilter(${filter.value})`);
      let index = this.filters.findIndex((f) => f.value == filter.value);
      this.filters.splice(index, 1);
      index = this.selectedFilters.findIndex((f) => f.value == filter.value);
      if (index !== -1) this.selectedFilters.splice(index, 1);
      // this.computeFiltersHeight();
      this.$nextTick(() => this.refresh());
    },
    selectUser(ev, user) {
      this.log(`selectUser()`);
      this.selectedUser = user;
      this.userProfilePosition.x = ev.clientX;
      this.userProfilePosition.y = ev.clientY;
      this.showUserProfile = true;
    },
    showDomain(domain) {
      this.log(`showDomain(${domain.id}`);
      if (this.mode == "list") this.openEditDomain(domain);
      else if (this.mode == "select" || this.mode == "multiselect") this.selectedDomain = domain;
    },
    selectDomain(ev) {
      this.log(`selectDomain(${JSON.stringify(ev)})`);
      if (this.mode == "select") {
        this.$emit("select", ev.value? ev.item: null);
      } else if (this.mode == "multiselect") {
        if (ev.value && ev.items) {
          this.selectedDomains = ev.items;
        } else if (ev.value && ev.item) {
          this.selectedDomains.push(ev.item);
        } else if (!ev.value && ev.items) {
          this.selectedDomains = _.difference(this.selectedDomains, ev.items);
        } else if (!ev.value && ev.item) {
          this.selectedDomains = _.filter(this.selectedDomains, dom => dom != ev.item);
        }
        this.$emit("select", this.selectedDomains);
      }

      /*if (this.mode == "select" || this.mode == "multiselect")
        this.$emit("select", ev.value ? ev.item : null);*/


    },
    clickDomain(ev) {
      this.log(`clickDomain()`);
      if (this.mode == "select" || this.mode == "multiselect") {
        this.domainDetailsPosition.x = ev.clientX;
        this.domainDetailsPosition.y = ev.clientY;
        this.showDomainDetails = true;
      }
    },
    async acceptRemoveDomain() {

      // 1. Launch transaction
      this.loading = true;
      let txId, op;
      try {
        let txId = await this.$model.removeDomain(
          this.$root.user.token,
          this.selectedDomain.id
        );

        op = {
          id: Date.now(),
          domain: _.clone(this.selectedDomain),
          stop: false,
        };
        op.domain.state = "destroy";

        this.pending.push(op);
        this.$root.success("The domain is being removed", 5000);

        //await this.refresh();
      } catch (err) {
        this.$root.error(err, "Unable to remove domain", 5000);
      } finally {
        this.confirmRemove = false;
        this.loading = false;
      }

      // 2. Wait for pending op
      try {
        let result = await this.$util.loop(
          async () => {
            if (op.stop) return true;
            let tx = await this.$model.findTransactionById(
              this.$root.user.token,
              txId
            );
            if (tx.state == "Completed") {
              return true;
            } else if (tx.state == "Aborted") {
              throw new Error(tx.err);
            }
          },
          {
            timeout: Infinity,
          }
        );
        this.refresh();
      } catch (err) {
        this.$root.error(err, `The domain ${op.domain.title} was not removed`);
      }
    },
  },
};
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
</style>
