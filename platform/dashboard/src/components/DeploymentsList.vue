<template>
  <div class="deployments-list" style="height: 100%; overflow-y: auto">
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
              @click="openAddDeployment"
              >Add deployment</v-btn
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
        :items="deployments"
        :items-per-page="5"
        :search="filterText"
        @click:row="showDeployment"
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
            <v-icon @click.stop="openEditDeployment(item)">
              {{ item.perm == "read" ? "mdi-magnify" : "mdi-pencil" }}
            </v-icon>
          </v-btn>&nbsp;
          <v-btn v-if="item.perm == 'owner'" icon outlined>
            <v-icon @click.stop="openRemoveDeployment(item)">mdi-delete</v-icon>
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

    <v-dialog v-if="addingDeployment" v-model="addingDeployment" width="800">
      <v-card elevation="1">
        <v-card-title>
          <span class="text-h5">Add Deployment</span>
        </v-card-title>
        <v-card-text>
          <deployment-add @cancel="addingDeployment = false" @accept="acceptAddDeployment"></deployment-add>
        </v-card-text>
      </v-card>
    </v-dialog>

     <v-dialog v-model="confirmRemove" max-width="300">
      <v-card>
        <v-card-title class="text-h5"> Remove </v-card-title>
        <v-card-text>
          <p>Are you sure you want to remove the deployment?</p>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="primary" text @click="confirmRemove = false">
            No
          </v-btn>
          <v-btn color="primary" text @click="acceptRemoveDeployment">
            Yes
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

  </div>
</template>

<script>
import _ from "lodash";
import DeploymentAdd from "@/components/DeploymentAdd";
import UserProfile from "@/components/UserProfile";

export default {
  name: "DeploymentsList",
  components: {
    UserProfile,
    DeploymentAdd,
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
        /*{
          text: "TYPE",
          align: "center",
          sortable: true,
          value: "type",
        },*/
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
      deployments: [],
      loading: false,
      addingDeployment: false,
      pending: [],
      users: {},
      showUserProfile: false,
      userProfilePosition: { x: 0, y: 0 },
      selectedUser: "",
      confirmRemove: false,
      selectedDeployment: undefined,
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
      console.log(`[DeploymentsList] ${msg}`);
    },
    async refresh() {
      this.log("refresh()");
      this.loading = true;
      try {
        let result = await this.$model.listDeployments(this.$root.user.token);
        this.deployments.splice(0, this.deployments.length);
        _.each(result, async (deployment) => {
          this.deployments.push(deployment);
          deployment.perm = this.perm(deployment);

          let label = _.find(deployment.labels, (label) => {
            if (label.startsWith("perm=")) {
              let [name, perm] = label.split("=");
              let [role, right] = perm.split(":");
              if (right == "o" && role != 0) return true;
            }
            return false;
          });
          let [name, perm] = label.split("=");
          let [role, right] = perm.split(":");
          deployment.owner = role;
          if (!this.users[deployment.owner]) {
            let [user] = await this.$model.listUsers(this.$root.user.token, {
              id: deployment.owner,
            });
            if (user) this.$set(this.users, deployment.owner, user);
          }
        });
      } catch (err) {
        this.$root.error(err, "Unable to obtain deployments", 5000);
      } finally {
        this.loading = false;
      }
    },
    openAddDeployment() {
      this.log("openAddDeployment()");
      this.addingDeployment = true;
    },
    cancelAddDeployment() {
      this.log("cancelAddDeployment()");
      this.addingDeployment = false;
      this.resetAddDeployment(true);
    },
    async acceptAddDeployment(ev) {
      this.log(`acceptAddDeployment(${JSON.stringify(ev.deployment)})`);

      // 1. Launch transaction
      this.addingDeployment = false;
      this.loading = true;

      let deployment = ev.deployment;
      //deployment.domains = _.map(ev.domains, dom => dom.id);

      let txId, op;
      try {
        txId = await this.$model.addDeployment(
          this.$root.user.token,
          ev.component.id,
          deployment
        );

        op = {
          id: Date.now(),
          deployment: _.clone(deployment),
          stop: false,
        };
        op.deployment.state = "ini";

        this.pending.push(op);
        //this.deployments.push(op.deployment);

        this.$root.success("The deployment is being added", 5000);
      } catch (err) {
        this.$root.error(err, "Unable to add deployment", 5000);
        return;
      } finally {
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
              [result] = await this.$model.listDeployments(
                this.$root.user.token,
                {
                  id: tx.target,
                }
              );
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
        this.$root.error(
          err,
          `The deployment ${op.deployment.title} was not added`
        );
      }
    },
    openEditDeployment(deployment) {
      this.log("openEditDeployment()");
      if (deployment.state == "ready")
        this.$router.push(`/deployments/${deployment.id}`);
      else this.$root.error("Unable to edit non-ready deployment", 2000);
    },
    openRemoveDeployment(deployment) {
      this.log("openRemoveDeployment()");
      this.selectedDeployment = deployment;
      this.confirmRemove = true;
    },
    async acceptRemoveDeployment() {
      this.loading = true;
      let txId, op;
      try {
        let txId = await this.$model.removeDeployment(
          this.$root.user.token,
          this.selectedDeployment.id
        );

        op = {
          id: Date.now(),
          deployment: _.clone(this.selectedDeployment),
          stop: false,
        };
        op.deployment.state = "destroy";

        this.pending.push(op);
        this.$root.success("The deployment is being removed", 5000);

      } catch (err) {
        this.$root.error(err, "Unable to remove deployment", 5000);
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
        this.$root.error(err, `The deployment ${op.deployment.title} was not removed`);
      }

    },
    perm(deployment) {
      let type = "read";
      if (!deployment.labels) return null;
      for (let label of deployment.labels) {
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
    showDeployment(deployment) {
      this.log(`showDeployment(${deployment.id}`);
      if (this.mode == "list") this.openEditDeployment(deployment);
      else if (this.mode == "select") this.$emit("select", deployment);
    },
  },
};
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
</style>
